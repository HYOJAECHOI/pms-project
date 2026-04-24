"""
인력 운용 현황 API.

GET /resource-allocation?year=YYYY[&month=M][&department_id=N]
  - month 지정: 해당 월의 '일별' 할당(daily_allocations) 반환 (기존)
  - month 생략: 해당 연도 범위의 '프로젝트 막대'(project_bars) 반환 (신규)
  - 응답 범위는 요청자 권한별로 제한 (admin / 본부장 / manager+PM / 일반).

본부장 조회 시: 본인 본부 유저(is_external=False) + 본인 본부 프로젝트의
WBS 담당자 중 타 본부 유저(is_external=True)를 함께 포함.
"""
from calendar import monthrange
from datetime import date, timedelta
from typing import List, Optional, Set, Tuple

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from database import get_db
import models
from routers.activity_logs import extract_user_id

router = APIRouter()


# ---------- 공통 유틸 ----------

def _month_range(year: int, month: int) -> Tuple[date, date]:
    last_day = monthrange(year, month)[1]
    return date(year, month, 1), date(year, month, last_day)


def _workdays_in(start: date, end: date) -> int:
    """주말(토,일) 제외. 공휴일 미반영."""
    if end < start:
        return 0
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


def _get_bar_group(status: Optional[str], pipeline_stage: Optional[str]) -> str:
    """프로젝트 상태/단계로 바 그룹 분류."""
    if status in ('제안', '검토'):
        return 'proposal'
    if pipeline_stage in ('pre_rfp', 'proposal', 'review'):
        return 'proposal'
    return 'execution'


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


def _leader_external_user_ids(db: Session, leader_org_id: int) -> Set[int]:
    """
    본부장이 담당하는 본부의 프로젝트(Project.department_id == leader_org_id)에
    WBS 담당자로 붙은 '타 본부' 유저 id 집합.
    다중 담당자(WBSAssignee) + 단일 담당자(WBSItem.assignee_id) 양쪽 모두 고려.
    """
    dept_proj_ids = [
        r[0] for r in db.query(models.Project.id)
        .filter(models.Project.department_id == leader_org_id).all()
    ]
    if not dept_proj_ids:
        return set()

    external: Set[int] = set()

    # WBSAssignee 경로
    rows_multi = (
        db.query(models.WBSAssignee.user_id)
        .join(models.WBSItem, models.WBSAssignee.wbs_id == models.WBSItem.id)
        .join(models.User, models.WBSAssignee.user_id == models.User.id)
        .filter(
            models.WBSItem.project_id.in_(dept_proj_ids),
            # '다른 본부'로 간주하는 기준: organization_id가 본부장 본부와 다르거나 null
            ((models.User.organization_id != leader_org_id) |
             (models.User.organization_id.is_(None))),
        )
        .distinct()
        .all()
    )
    for (uid,) in rows_multi:
        if uid:
            external.add(uid)

    # WBSItem.assignee_id 경로 (WBSAssignee 가 비어있을 수도 있는 레거시 데이터 대비)
    rows_legacy = (
        db.query(models.WBSItem.assignee_id)
        .join(models.User, models.WBSItem.assignee_id == models.User.id)
        .filter(
            models.WBSItem.project_id.in_(dept_proj_ids),
            models.WBSItem.assignee_id.isnot(None),
            ((models.User.organization_id != leader_org_id) |
             (models.User.organization_id.is_(None))),
        )
        .distinct()
        .all()
    )
    for (uid,) in rows_legacy:
        if uid:
            external.add(uid)

    return external


def _resolve_target_user_ids(
    db: Session,
    caller: models.User,
    department_id: Optional[int],
) -> Tuple[List[int], Set[int]]:
    """
    권한별로 응답에 포함할 user id 목록과, 그중 '타 본부(external)'로 표시할
    id 집합을 함께 계산. external은 본부장 케이스에서만 채워짐.
    """
    role = caller.role
    my_org_id = caller.organization_id
    is_leader_here = _is_leader_of(db, caller, my_org_id)

    # 1) admin: 전사. department_id 주어지면 그 본부만. external 없음.
    if role == "admin":
        q = db.query(models.User.id)
        if department_id is not None:
            q = q.filter(models.User.organization_id == department_id)
        return [r[0] for r in q.all()], set()

    # 2) 본부장 (organizations.leader_id == caller.id):
    #    본인 본부 유저(internal) + 본부 프로젝트의 타 본부 WBS 담당자(external).
    if is_leader_here:
        if department_id is not None and department_id != my_org_id:
            raise HTTPException(
                status_code=403,
                detail="본부장은 본인 본부의 인력만 조회할 수 있어요.",
            )
        own_ids = [
            r[0] for r in db.query(models.User.id)
            .filter(models.User.organization_id == my_org_id).all()
        ]
        external_ids = _leader_external_user_ids(db, my_org_id)
        # own과 external의 합집합. own에 이미 있으면 external에서 빼서 is_external=False 유지.
        external_ids = external_ids - set(own_ids)
        combined = list(set(own_ids) | external_ids)
        return combined, external_ids

    # 3) manager + PM: 본인이 PM인 프로젝트 멤버들. PM이 아니면 본인만.
    if role == "manager":
        pm_pids = _pm_project_ids(db, caller.id)
        if pm_pids:
            uid_rows = (
                db.query(models.ProjectMember.user_id)
                .filter(models.ProjectMember.project_id.in_(pm_pids))
                .distinct()
                .all()
            )
            ids = {r[0] for r in uid_rows if r[0] is not None}
            ids.add(caller.id)
            return list(ids), set()
        return [caller.id], set()

    # 4) 일반 user: 본인만. department_id 필터 무시.
    return [caller.id], set()


def _collect_wbs_rows(
    db: Session,
    target_ids: List[int],
    period_start: date,
    period_end: date,
):
    """
    대상 유저 + 기간에 겹치는 leaf WBS 조회.
    리턴: (multi_rows, legacy_rows) — 각각 [(user_id, WBSItem, Project), ...].
    multi_rows: WBSAssignee 경로 / legacy_rows: WBSItem.assignee_id fallback
      (WBS에 WBSAssignee가 있으면 완전 제외).
    """
    if not target_ids:
        return [], []

    parent_ids_select = (
        select(models.WBSItem.parent_id)
        .where(models.WBSItem.parent_id.isnot(None))
        .distinct()
    )
    has_assignee_select = select(models.WBSAssignee.wbs_id).distinct()

    multi_rows = (
        db.query(models.WBSAssignee.user_id, models.WBSItem, models.Project)
        .join(models.WBSItem, models.WBSAssignee.wbs_id == models.WBSItem.id)
        .join(models.Project, models.WBSItem.project_id == models.Project.id)
        .filter(
            models.WBSAssignee.user_id.in_(target_ids),
            models.WBSItem.plan_start_date.isnot(None),
            models.WBSItem.plan_end_date.isnot(None),
            models.WBSItem.plan_start_date <= period_end,
            models.WBSItem.plan_end_date >= period_start,
            models.WBSItem.id.notin_(parent_ids_select),
        )
        .all()
    )

    legacy_rows = (
        db.query(models.WBSItem.assignee_id, models.WBSItem, models.Project)
        .join(models.Project, models.WBSItem.project_id == models.Project.id)
        .filter(
            models.WBSItem.assignee_id.in_(target_ids),
            models.WBSItem.assignee_id.isnot(None),
            models.WBSItem.plan_start_date.isnot(None),
            models.WBSItem.plan_end_date.isnot(None),
            models.WBSItem.plan_start_date <= period_end,
            models.WBSItem.plan_end_date >= period_start,
            models.WBSItem.id.notin_(parent_ids_select),
            models.WBSItem.id.notin_(has_assignee_select),
        )
        .all()
    )
    return multi_rows, legacy_rows


def _user_base_dict(u: models.User, org_name_map: dict, is_external: bool) -> dict:
    return {
        "user_id": u.id,
        "name": u.name,
        "position": u.position,
        "organization_id": u.organization_id,
        "organization_name": org_name_map.get(u.organization_id),
        "is_external": is_external,
    }


def _build_daily_allocations(
    users_rows,
    by_user,
    period_start: date,
    period_end: date,
    workdays: int,
    org_name_map: dict,
    external_ids: Set[int],
) -> List[dict]:
    out = []
    for u in users_rows:
        allocs = by_user.get(u.id, [])
        daily = []
        for (w, p) in allocs:
            span_start = max(w.plan_start_date, period_start)
            span_end = min(w.plan_end_date, period_end)
            for d in _iter_workdays(span_start, span_end):
                daily.append({
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
        # 스펙: 할당된 평일의 '합계'. 중복 투입은 그만큼 더해져 100% 초과 가능.
        total_assigned_days = len(daily)
        md_rate = round(total_assigned_days / workdays * 100, 1) if workdays else 0.0

        base = _user_base_dict(u, org_name_map, u.id in external_ids)
        base["md_rate"] = md_rate
        base["daily_allocations"] = sorted(
            daily, key=lambda a: (a["date"], a["project_id"], a["wbs_id"]),
        )
        out.append(base)
    return out


def _build_project_bars(
    users_rows,
    by_user,
    period_start: date,
    period_end: date,
    workdays: int,
    org_name_map: dict,
    external_ids: Set[int],
) -> List[dict]:
    out = []
    for u in users_rows:
        allocs = by_user.get(u.id, [])
        bars = []
        total_md_days = 0
        for (w, p) in allocs:
            span_start = max(w.plan_start_date, period_start)
            span_end = min(w.plan_end_date, period_end)
            if span_end < span_start:
                continue
            md_days = _workdays_in(span_start, span_end)
            total_md_days += md_days
            bars.append({
                "wbs_id": w.id,
                "wbs_title": w.title,
                "wbs_number": w.wbs_number,
                "project_id": p.id,
                "project_name": p.name,
                "client": p.client,
                "status": p.status,
                "pipeline_stage": p.pipeline_stage,
                "department_id": p.department_id,
                "start_date": span_start.isoformat(),
                "end_date": span_end.isoformat(),
                "md_days": md_days,
                "group": _get_bar_group(p.status, p.pipeline_stage),
            })
        md_rate = round(total_md_days / workdays * 100, 1) if workdays else 0.0

        base = _user_base_dict(u, org_name_map, u.id in external_ids)
        base["md_rate"] = md_rate
        base["project_bars"] = sorted(
            bars, key=lambda b: (b["start_date"], b["project_id"], b["wbs_id"]),
        )
        out.append(base)
    return out


# ---------- 엔드포인트 ----------

@router.get("/resource-allocation")
def resource_allocation(
    request: Request,
    year: int = Query(..., ge=2000, le=2100),
    month: Optional[int] = Query(None, ge=1, le=12),
    department_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    caller_id = extract_user_id(request)
    if not caller_id:
        raise HTTPException(status_code=401, detail="인증이 필요해요.")
    caller = _load_caller(db, caller_id)

    # 1) 기간 / 작업일
    if month is not None:
        period_start, period_end = _month_range(year, month)
    else:
        period_start = date(year, 1, 1)
        period_end = date(year, 12, 31)
    workdays = _workdays_in(period_start, period_end)

    # 2) 권한별 대상 유저 + external 집합
    target_ids, external_ids = _resolve_target_user_ids(db, caller, department_id)
    if not target_ids:
        base = {"year": year, "workdays": workdays, "users": []}
        if month is not None:
            base["month"] = month
        return base

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

    # 4) WBS 할당 조회 (기간 겹침 + leaf 필터)
    multi_rows, legacy_rows = _collect_wbs_rows(db, target_ids, period_start, period_end)

    # 5) 유저별 할당 모으기
    by_user: dict = {}
    for (uid, w, p) in multi_rows + legacy_rows:
        by_user.setdefault(uid, []).append((w, p))

    # 6) 응답 조립 — month 유무에 따라 분기
    if month is not None:
        users_out = _build_daily_allocations(
            users_rows, by_user, period_start, period_end, workdays, org_name_map, external_ids,
        )
        return {
            "year": year,
            "month": month,
            "workdays": workdays,
            "users": users_out,
        }

    users_out = _build_project_bars(
        users_rows, by_user, period_start, period_end, workdays, org_name_map, external_ids,
    )
    return {
        "year": year,
        "workdays": workdays,
        "users": users_out,
    }
