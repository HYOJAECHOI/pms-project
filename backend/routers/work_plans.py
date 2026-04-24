from datetime import datetime, date as date_cls
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from database import get_db
import models
from routers.activity_logs import extract_user_id
from routers.dependencies import require_project_member

router = APIRouter()

STATUSES = {"planned", "done", "skipped"}
COLUMNS = {"할일", "수행예정", "종료", "완료보고"}


def _parse_date(value) -> date_cls:
    if isinstance(value, date_cls):
        return value
    try:
        return datetime.strptime(str(value), "%Y-%m-%d").date()
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="plan_date는 YYYY-MM-DD 형식이어야 해요.")


def _serialize(wp, wbs_map=None, project_map=None):
    wbs = (wbs_map or {}).get(wp.wbs_id)
    project = None
    if wbs and project_map:
        project = project_map.get(wbs.project_id)
    return {
        "id": wp.id,
        "user_id": wp.user_id,
        "wbs_id": wp.wbs_id,
        "plan_date": wp.plan_date.isoformat() if wp.plan_date else None,
        "status": wp.status,
        "memo": wp.memo,
        "column": wp.column,
        "created_at": wp.created_at.isoformat() if wp.created_at else None,
        "wbs_title": wbs.title if wbs else None,
        "project_id": wbs.project_id if wbs else None,
        "project_name": project.name if project else None,
    }


@router.post("/work-plans")
def create_work_plan(
    wbs_id: int,
    plan_date: str,
    request: Request,
    memo: str = None,
    column: str = "할일",
    db: Session = Depends(get_db),
):
    user_id = extract_user_id(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="로그인이 필요해요.")

    if column not in COLUMNS:
        raise HTTPException(
            status_code=400,
            detail=f"column은 {sorted(COLUMNS)} 중 하나여야 해요.",
        )

    pdate = _parse_date(plan_date)

    wbs = db.query(models.WBSItem).filter(models.WBSItem.id == wbs_id).first()
    if not wbs:
        raise HTTPException(status_code=404, detail="WBS 항목을 찾을 수 없어요.")
    require_project_member(wbs.project_id, user_id, db)

    exists = (
        db.query(models.WorkPlan)
        .filter(
            models.WorkPlan.user_id == user_id,
            models.WorkPlan.wbs_id == wbs_id,
            models.WorkPlan.plan_date == pdate,
        )
        .first()
    )
    if exists:
        raise HTTPException(status_code=400, detail="이미 같은 날짜에 동일한 WBS의 계획이 있어요.")

    wp = models.WorkPlan(
        user_id=user_id,
        wbs_id=wbs_id,
        plan_date=pdate,
        status="planned",
        memo=memo,
        column=column,
        created_at=datetime.utcnow(),
    )
    db.add(wp)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="이미 같은 날짜에 동일한 WBS의 계획이 있어요.")
    db.refresh(wp)

    project = db.query(models.Project).filter(models.Project.id == wbs.project_id).first()
    return _serialize(wp, {wbs.id: wbs}, {project.id: project} if project else {})


@router.get("/work-plans")
def list_work_plans(
    request: Request,
    date: str = None,
    db: Session = Depends(get_db),
):
    user_id = extract_user_id(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="로그인이 필요해요.")

    pdate = _parse_date(date) if date else datetime.utcnow().date()

    plans = (
        db.query(models.WorkPlan)
        .filter(
            models.WorkPlan.user_id == user_id,
            models.WorkPlan.plan_date == pdate,
        )
        .order_by(models.WorkPlan.id.asc())
        .all()
    )

    wbs_ids = {p.wbs_id for p in plans}
    wbs_map = {}
    project_map = {}
    if wbs_ids:
        wbs_items = db.query(models.WBSItem).filter(models.WBSItem.id.in_(wbs_ids)).all()
        wbs_map = {w.id: w for w in wbs_items}
        project_ids = {w.project_id for w in wbs_items}
        if project_ids:
            projects = db.query(models.Project).filter(models.Project.id.in_(project_ids)).all()
            project_map = {p.id: p for p in projects}

    return [_serialize(p, wbs_map, project_map) for p in plans]


@router.put("/work-plans/{work_plan_id}")
def update_work_plan(
    work_plan_id: int,
    request: Request,
    status: str = None,
    memo: str = None,
    column: str = None,
    db: Session = Depends(get_db),
):
    user_id = extract_user_id(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="로그인이 필요해요.")

    wp = db.query(models.WorkPlan).filter(models.WorkPlan.id == work_plan_id).first()
    if not wp:
        raise HTTPException(status_code=404, detail="업무 계획을 찾을 수 없어요.")
    if wp.user_id != user_id:
        raise HTTPException(status_code=403, detail="본인의 업무 계획만 수정할 수 있어요.")

    if status is not None:
        if status not in STATUSES:
            raise HTTPException(
                status_code=400,
                detail=f"status는 {sorted(STATUSES)} 중 하나여야 해요.",
            )
        wp.status = status
    if memo is not None:
        wp.memo = memo
    if column is not None:
        if column not in COLUMNS:
            raise HTTPException(
                status_code=400,
                detail=f"column은 {sorted(COLUMNS)} 중 하나여야 해요.",
            )
        wp.column = column

    db.commit()
    db.refresh(wp)

    wbs = db.query(models.WBSItem).filter(models.WBSItem.id == wp.wbs_id).first()
    project = None
    if wbs:
        project = db.query(models.Project).filter(models.Project.id == wbs.project_id).first()
    return _serialize(
        wp,
        {wbs.id: wbs} if wbs else {},
        {project.id: project} if project else {},
    )


@router.delete("/work-plans/{work_plan_id}")
def delete_work_plan(
    work_plan_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    user_id = extract_user_id(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="로그인이 필요해요.")

    wp = db.query(models.WorkPlan).filter(models.WorkPlan.id == work_plan_id).first()
    if not wp:
        raise HTTPException(status_code=404, detail="업무 계획을 찾을 수 없어요.")
    if wp.user_id != user_id:
        raise HTTPException(status_code=403, detail="본인의 업무 계획만 삭제할 수 있어요.")

    db.delete(wp)
    db.commit()
    return {"message": "삭제됐어요."}
