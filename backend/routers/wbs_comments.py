import json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from database import get_db
import models
from routers.activity_logs import extract_user_id, log_activity

router = APIRouter()


def _serialize(c, user_map, parent_map):
    parent = None
    if c.parent_comment_id and c.parent_comment_id in parent_map:
        p = parent_map[c.parent_comment_id]
        parent = {
            "id": p.id,
            "user_id": p.user_id,
            "user_name": user_map.get(p.user_id),
            "content": p.content,
        }
    return {
        "id": c.id,
        "project_id": c.project_id,
        "wbs_id": c.wbs_id,
        "user_id": c.user_id,
        "user_name": user_map.get(c.user_id),
        "parent_comment_id": c.parent_comment_id,
        "parent_comment": parent,
        "content": c.content,
        "comment_type": c.comment_type,
        "memo_category": c.memo_category,
        "visibility_scope": c.visibility_scope,
        "created_at": c.created_at.isoformat() if c.created_at else None,
        "updated_at": c.updated_at.isoformat() if c.updated_at else None,
    }


@router.post("/wbs/{wbs_id}/comments")
def create_wbs_comment(
    wbs_id: int,
    content: str,
    request: Request,
    comment_type: str = "memo",
    memo_category: str = None,
    parent_comment_id: int = None,
    db: Session = Depends(get_db),
):
    if not content or not content.strip():
        raise HTTPException(status_code=400, detail="내용을 입력해 주세요.")

    wbs = db.query(models.WBSItem).filter(models.WBSItem.id == wbs_id).first()
    if not wbs:
        raise HTTPException(status_code=404, detail="WBS 항목을 찾을 수 없어요.")

    if parent_comment_id is not None:
        parent = db.query(models.WBSComment).filter(models.WBSComment.id == parent_comment_id).first()
        if not parent or parent.wbs_id != wbs_id:
            raise HTTPException(status_code=400, detail="부모 댓글이 유효하지 않아요.")

    actor_user_id = extract_user_id(request)

    now = datetime.utcnow()
    comment = models.WBSComment(
        project_id=wbs.project_id,
        wbs_id=wbs_id,
        user_id=actor_user_id,
        parent_comment_id=parent_comment_id,
        content=content,
        comment_type=comment_type,
        memo_category=memo_category,
        created_at=now,
        updated_at=now,
    )
    db.add(comment)
    db.flush()  # comment.id 확보

    log_activity(
        db,
        project_id=wbs.project_id,
        wbs_id=wbs_id,
        actor_user_id=actor_user_id,
        action_type="comment_added",
        before_json=None,
        after_json=json.dumps({
            "comment_id": comment.id,
            "comment_type": comment_type,
            "memo_category": memo_category,
            "parent_comment_id": parent_comment_id,
        }, ensure_ascii=False),
    )
    db.commit()
    db.refresh(comment)

    user_map = {}
    if comment.user_id:
        u = db.query(models.User).filter(models.User.id == comment.user_id).first()
        if u:
            user_map[u.id] = u.name

    parent_map = {}
    if comment.parent_comment_id:
        p = db.query(models.WBSComment).filter(models.WBSComment.id == comment.parent_comment_id).first()
        if p:
            parent_map[p.id] = p
            if p.user_id and p.user_id not in user_map:
                pu = db.query(models.User).filter(models.User.id == p.user_id).first()
                if pu:
                    user_map[pu.id] = pu.name

    return _serialize(comment, user_map, parent_map)


@router.get("/wbs/{wbs_id}/comments")
def list_wbs_comments(wbs_id: int, db: Session = Depends(get_db)):
    comments = (
        db.query(models.WBSComment)
        .filter(models.WBSComment.wbs_id == wbs_id)
        .order_by(models.WBSComment.created_at.asc(), models.WBSComment.id.asc())
        .all()
    )

    user_ids = {c.user_id for c in comments if c.user_id}
    parent_ids = {c.parent_comment_id for c in comments if c.parent_comment_id}

    parent_map = {}
    if parent_ids:
        parents = db.query(models.WBSComment).filter(models.WBSComment.id.in_(parent_ids)).all()
        for p in parents:
            parent_map[p.id] = p
            if p.user_id:
                user_ids.add(p.user_id)

    user_map = {}
    if user_ids:
        for u in db.query(models.User).filter(models.User.id.in_(user_ids)).all():
            user_map[u.id] = u.name

    return [_serialize(c, user_map, parent_map) for c in comments]


@router.delete("/wbs/comments/{comment_id}")
def delete_wbs_comment(comment_id: int, request: Request, db: Session = Depends(get_db)):
    comment = db.query(models.WBSComment).filter(models.WBSComment.id == comment_id).first()
    if not comment:
        raise HTTPException(status_code=404, detail="댓글을 찾을 수 없어요.")

    actor_user_id = extract_user_id(request)
    if comment.user_id is None or comment.user_id != actor_user_id:
        raise HTTPException(status_code=403, detail="본인의 댓글만 삭제할 수 있어요.")

    # 답글이 이 댓글을 parent로 참조 중이면 먼저 NULL 처리 (FK 제약 회피)
    db.query(models.WBSComment).filter(
        models.WBSComment.parent_comment_id == comment_id
    ).update({models.WBSComment.parent_comment_id: None})
    db.delete(comment)
    db.commit()
    return {"message": "삭제됐어요."}
