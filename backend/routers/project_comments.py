from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
import models

router = APIRouter()


def _serialize(c, user_map):
    return {
        "id": c.id,
        "project_id": c.project_id,
        "user_id": c.user_id,
        "user_name": user_map.get(c.user_id),
        "content": c.content,
        "comment_type": c.comment_type,
        "created_at": c.created_at.isoformat() if c.created_at else None,
    }


@router.post("/projects/{project_id}/comments")
def create_comment(
    project_id: int,
    content: str,
    user_id: int = None,
    comment_type: str = "manual",
    db: Session = Depends(get_db),
):
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="프로젝트를 찾을 수 없어요.")
    if not content or not content.strip():
        raise HTTPException(status_code=400, detail="내용을 입력해 주세요.")

    comment = models.ProjectComment(
        project_id=project_id,
        user_id=user_id,
        content=content,
        comment_type=comment_type,
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)

    user_map = {}
    if comment.user_id:
        u = db.query(models.User).filter(models.User.id == comment.user_id).first()
        if u:
            user_map[u.id] = u.name
    return _serialize(comment, user_map)


@router.get("/projects/{project_id}/comments")
def list_comments(project_id: int, db: Session = Depends(get_db)):
    comments = (
        db.query(models.ProjectComment)
        .filter(models.ProjectComment.project_id == project_id)
        .order_by(models.ProjectComment.created_at.desc())
        .all()
    )
    user_ids = {c.user_id for c in comments if c.user_id}
    user_map = {}
    if user_ids:
        for u in db.query(models.User).filter(models.User.id.in_(user_ids)).all():
            user_map[u.id] = u.name
    return [_serialize(c, user_map) for c in comments]
