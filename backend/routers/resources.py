"""
인력 운용 현황 API.

GET /resource-allocation?year=YYYY&month=M[&department_id=N]
  → 해당 월의 사람별 일별 WBS 할당 + MD% 계산.
  → 요청자 권한으로 응답 범위 제한 (admin / 본부장 / PM / 일반).
"""
from calendar import monthrange
from datetime import date, timedelta
from typing import List, Optional, Set

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from database import get_db
import models
from routers.activity_logs import extract_user_id

router = APIRouter()


# ---------- 공통 유틸 ----------

def _month_range(year: int, month: int) -> tuple[date, date]:
    last_day = monthrange(year, month)[1]
    return date(year, month, 1), date(year, month, last_day)


def _workdays_in(start: date, end: date) -> int:
    """주말(토,일) 제외. 공휴일 미반영."""
    total = 0
    d = start
    while d <= end:
        if d.weekday() < 5:
            total += 1
        d += timedelta(days=1)
    return total


def _iter_workdays(start: date, end: date):
    d = start
    while d <= end:
        if d.weekday() < 5:
            yield d
        d += timedelta(days=1)


def _load_caller(db: Session, caller_id: int) -> models.User:
    user = db.query(models.User).filter(models.User.id == caller_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="로그인 정보를 찾을 수 없어요.")
    return user


def _is_leader_of(db: Session, user: models.User, org_id: Optional[int]) -> bool:
    """유저가 주어진 org의 본부장인지 (organizations.leader_id = user.id)."""
    if org_id is None:
        return False
    org = db.query(models.Organization).filter(models.Organization.id == org_id).first()
    return bool(org and org.leader_id == user.id)


def _pm_project_ids(db: Session, user_id: int) -> Set[int]:
    rows = db.query(models.Project.id).filter(models.Project.pm_id == user_id).all()
    return {r[0] for r in rows}


def _resolve_target_user_ids(
    db: Session,
    caller: models.User,
    department_id: Optional[int],
) -> List[int]:
    """권한별로 응답에 포함할 user id 목록 계산."""
    role = caller.role
    my_org_id = caller.organization_id
    is_leader_here = _is_leader_of(db, caller, my_org_id)

    # 1) admin: 전사. department_id 주어지면 그 본부만.
    if role == "admin":
        q = db.query(models.User.id)
        if department_id is not None:
            q = q.filter(models.User.organization_id == department_id)
        return [r[0] for r in q.all()]

    # 2) 본부장 (organizations.leader_id == caller.id): 소속 본부 전원.
    if is_leader_here:
        if department_id is not None and department_id != my_org_id:
            raise HTTPException(
                status_code=403,
                detail="본부장은 본인 본부의 인력만 조회할 수 있어요.",
            )
        q = db.query(models.User.id).filter(models.User.organization_id == my_org_id)
        return [r[0] for r in q.all()]

    # 3) manager + PM: 본인이 PM인 프로젝트 멤버들. PM이 아니면 본인만.
    if role == "manager":
        pm_pids = _pm_project_ids(db, caller.id)
        if pm_pids:
            # department_id 필터는 일반 관리자에겐 의미 없음 → 무시
            uid_rows = (
                db.query(models.ProjectMember.user_id)
                .filter(models.ProjectMember.project_id.in_(pm_pids))
                .distinct()
                .all()
            )
            ids = {r[0] for r in uid_rows if r[0] is not None}
            ids.add(caller.id)
            return list(ids)
        return [caller.id]

    # 4) 일반 user: 본인만. department_id 필터 무시.
    return [caller.id]


# ---------- 엔드포인트 ----------

@router.get("/resource-allocation")
def resource_allocation(
    request: Request,
    year: int = Query(..., ge=2000, le=2100),
    month: int = Query(..., ge=1, le=12),
    department_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    caller_id = extract_user_id(request)
    if not caller_id:
        raise HTTPException(status_code=401, detail="인증이 필요해요.")
    caller = _load_caller(db, caller_id)

    # 1) 기간 / 작업일
    month_start, month_end = _month_range(year, month)
    workdays = _workdays_in(month_start, month_end)

    # 2) 권한별 대상 유저
    target_ids = _resolve_target_user_ids(db, caller, department_id)
    if not target_ids:
        return {"year": year, "month": month, "workdays": workdays, "users": []}

    # 3) 유저 기본 정보 + 소속 본부
    users_rows = (
        db.query(models.User)
        .filter(models.User.id.in_(target_ids))
        .order_by(models.User.organization_id, models.User.position, models.User.id)
        .all()
    )
    org_ids = {u.organization_id for u in users_rows if u.organization_id}
    org_name_map = {}
    if org_ids:
        for o in db.query(models.Organization).filter(models.Organization.id.in_(org_ids)).all():
            org_name_map[o.id] = o.name

    # 4) 리프 WBS 판별: parent_id로 참조되는 id들의 집합을 만들고, 대상에서 제외.
    parent_ids_select = (
        select(models.WBSItem.parent_id)
        .where(models.WBSItem.parent_id.isnot(None))
        .distinct()
    )

    # WBSAssignee에 한 건이라도 등록된 wbs_id 집합 — assignee_id fallback에서 완전 제외.
    # (조회 대상 유저가 아니더라도 누군가 다중 담당자로 등록된 WBS라면
    #  legacy assignee_id는 이미 대체된 것으로 간주.)
    has_assignee_select = (
        select(models.WBSAssignee.wbs_id).distinct()
    )

    # 5) 다중 담당자(WBSAssignee)로 연결된 leaf WBS 매칭
    #    + 단일 담당자(WBSItem.assignee_id) fallback (해당 WBS에 WBSAssignee 행이
    #       전혀 없는 경우에만).
    # 5-a) WBSAssignee 경로
    multi_rows = (
        db.query(models.WBSAssignee.user_id, models.WBSItem, models.Project)
        .join(models.WBSItem, models.WBSAssignee.wbs_id == models.WBSItem.id)
        .join(models.Project, models.WBSItem.project_id == models.Project.id)
        .filter(
            models.WBSAssignee.user_id.in_(target_ids),
            models.WBSItem.plan_start_date.isnot(None),
            models.WBSItem.plan_end_date.isnot(None),
            models.WBSItem.plan_start_date <= month_end,
            models.WBSItem.plan_end_date >= month_start,
            models.WBSItem.id.notin_(parent_ids_select),
        )
        .all()
    )

    # 5-b) WBSItem.assignee_id fallback
    #      해당 WBS에 WBSAssignee 행이 하나라도 있으면 legacy는 이미 대체됐으므로 제외.
    legacy_rows = (
        db.query(models.WBSItem.assignee_id, models.WBSItem, models.Project)
        .join(models.Project, models.WBSItem.project_id == models.Project.id)
        .filter(
            models.WBSItem.assignee_id.in_(target_ids),
            models.WBSItem.assignee_id.isnot(None),
            models.WBSItem.plan_start_date.isnot(None),
            models.WBSItem.plan_end_date.isnot(None),
            models.WBSItem.plan_start_date <= month_end,
            models.WBSItem.plan_end_date >= month_start,
            models.WBSItem.id.notin_(parent_ids_select),
            models.WBSItem.id.notin_(has_assignee_select),
        )
        .all()
    )

    # 6) 유저별 할당 모으기 (중복 제거용 key: user_id + wbs_id)
    by_user: dict[int, list[tuple[models.WBSItem, models.Project]]] = {}
    for (uid, w, p) in multi_rows + legacy_rows:
        by_user.setdefault(uid, []).append((w, p))

    # 7) 응답 조립
    users_out = []
    for u in users_rows:
        allocs = by_user.get(u.id, [])
        daily_allocations = []
        workday_set: Set[date] = set()

        for (w, p) in allocs:
            span_start = max(w.plan_start_date, month_start)
            span_end = min(w.plan_end_date, month_end)
            for d in _iter_workdays(span_start, span_end):
                daily_allocations.append({
                    "date": d.isoformat(),
                    "wbs_id": w.id,
                    "wbs_title": w.title,
                    "wbs_number": w.wbs_number,
                    "project_id": p.id,
                    "project_name": p.name,
                    "client": p.client,
                    "status": p.status,
                    "pipeline_stage": p.pipeline_stage,
                    "department_id": p.department_id,
                })
                workday_set.add(d)

        # md_rate: 스펙대로 '할당된 일수 합계'. 중복 투입은 2일로 계산되므로
        # 100%를 초과할 수 있음 (오버 할당 시각화용). 평일만 합산.
        total_assigned_days = sum(1 for a in daily_allocations)  # 이미 평일만
        md_rate = round(total_assigned_days / workdays * 100, 1) if workdays else 0.0

        users_out.append({
            "user_id": u.id,
            "name": u.name,
            "position": u.position,
            "organization_id": u.organization_id,
            "organization_name": org_name_map.get(u.organization_id),
            "md_rate": md_rate,
            "daily_allocations": sorted(
                daily_allocations,
                key=lambda a: (a["date"], a["project_id"], a["wbs_id"]),
            ),
        })

    return {
        "year": year,
        "month": month,
        "workdays": workdays,
        "users": users_out,
    }
