from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session
from database import get_db
import models

router = APIRouter()


def extract_user_id(request: Request):
    """auth_middleware가 세팅한 request.state.user_payload에서 sub(user id)를 꺼냄."""
    payload = getattr(request.state, "user_payload", None) or {}
    sub = payload.get("sub")
    try:
        return int(sub) if sub is not None else None
    except (TypeError, ValueError):
        return None


def log_activity(
    db: Session,
    project_id: int,
    wbs_id: int | None,
    actor_user_id: int | None,
    action_type: str,
    before_json: str | None = None,
    after_json: str | None = None,
):
    """
    ActivityLog 한 건 추가. 호출 측에서 commit 책임.
    before_json / after_json은 JSON 문자열 (json.dumps로 직렬화해서 전달).
    """
    entry = models.ActivityLog(
        project_id=project_id,
        wbs_id=wbs_id,
        actor_user_id=actor_user_id,
        action_type=action_type,
        before_json=before_json,
        after_json=after_json,
    )
    db.add(entry)
    return entry


def _serialize(log, user_map):
    return {
        "id": log.id,
        "project_id": log.project_id,
        "wbs_id": log.wbs_id,
        "actor_user_id": log.actor_user_id,
        "actor_name": user_map.get(log.actor_user_id),
        "action_type": log.action_type,
        "before_json": log.before_json,
        "after_json": log.after_json,
        "created_at": log.created_at.isoformat() if log.created_at else None,
    }


def _build_user_map(logs, db: Session):
    user_ids = {l.actor_user_id for l in logs if l.actor_user_id}
    user_map = {}
    if user_ids:
        for u in db.query(models.User).filter(models.User.id.in_(user_ids)).all():
            user_map[u.id] = u.name
    return user_map


@router.get("/wbs/{wbs_id}/activities")
def list_wbs_activities(wbs_id: int, db: Session = Depends(get_db)):
    logs = (
        db.query(models.ActivityLog)
        .filter(models.ActivityLog.wbs_id == wbs_id)
        .order_by(models.ActivityLog.created_at.desc(), models.ActivityLog.id.desc())
        .all()
    )
    user_map = _build_user_map(logs, db)
    return [_serialize(l, user_map) for l in logs]


@router.get("/projects/{project_id}/activities")
def list_project_activities(project_id: int, db: Session = Depends(get_db)):
    logs = (
        db.query(models.ActivityLog)
        .filter(models.ActivityLog.project_id == project_id)
        .order_by(models.ActivityLog.created_at.desc(), models.ActivityLog.id.desc())
        .all()
    )
    user_map = _build_user_map(logs, db)
    return [_serialize(l, user_map) for l in logs]
