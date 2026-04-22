from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import SessionLocal
from datetime import date
import models

router = APIRouter()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _parse_ids(value):
    """콤마구분 문자열 또는 단일 숫자 문자열을 int 리스트로 변환."""
    if value is None:
        return None
    if isinstance(value, list):
        raw = value
    else:
        raw = str(value).split(',')
    out = []
    for x in raw:
        s = str(x).strip()
        if not s:
            continue
        try:
            out.append(int(s))
        except ValueError:
            continue
    return out


# system role 기준 우선순위: admin > manager > user
ROLE_PRIORITY = {'admin': 0, 'manager': 1, 'user': 2}


def _sort_by_role(user_ids, db: Session):
    """system role 우선순위(admin > manager > user)로 정렬. 존재하지 않는 user는 제외."""
    seen = set()
    pairs = []
    for uid in user_ids or []:
        if uid in seen:
            continue
        seen.add(uid)
        u = db.query(models.User).filter(models.User.id == uid).first()
        if not u:
            continue
        pairs.append((uid, ROLE_PRIORITY.get(u.role or 'user', 99)))
    pairs.sort(key=lambda t: t[1])
    return [uid for uid, _ in pairs]


def _set_assignees(wbs_id: int, user_ids, db: Session):
    """wbs_assignees 행을 role 우선순위로 정렬해 교체하고 legacy assignee_id 컬럼도 메인(첫번째)으로 동기화."""
    db.query(models.WBSAssignee).filter(models.WBSAssignee.wbs_id == wbs_id).delete()
    sorted_ids = _sort_by_role(user_ids, db)
    for uid in sorted_ids:
        db.add(models.WBSAssignee(wbs_id=wbs_id, user_id=uid))
    wbs = db.query(models.WBSItem).filter(models.WBSItem.id == wbs_id).first()
    if wbs:
        wbs.assignee_id = sorted_ids[0] if sorted_ids else None


def _list_assignees(wbs_id: int, db: Session):
    rows = db.query(models.WBSAssignee).filter(models.WBSAssignee.wbs_id == wbs_id).all()
    out = []
    for r in rows:
        u = db.query(models.User).filter(models.User.id == r.user_id).first()
        if u:
            out.append({"user_id": u.id, "name": u.name})
    return out


# WBS 항목 생성
@router.post("/projects/{project_id}/wbs")
def create_wbs_item(
    project_id: int,
    title: str,
    level: int = 1,
    wbs_number: str = None,
    parent_id: int = None,
    assignee_id: int = None,
    assignee_ids: str = None,
    status: str = "대기",
    plan_start_date: date = None,
    plan_end_date: date = None,
    actual_start_date: date = None,
    actual_end_date: date = None,
    plan_progress: float = 0.0,
    actual_progress: float = 0.0,
    weight: float = 1.0,
    deliverable: str = None,
    db: Session = Depends(get_db)
):
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="프로젝트를 찾을 수 없어요.")

    item = models.WBSItem(
        project_id=project_id,
        parent_id=parent_id,
        level=level,
        wbs_number=wbs_number,
        title=title,
        assignee_id=assignee_id,
        status=status,
        plan_start_date=plan_start_date,
        plan_end_date=plan_end_date,
        actual_start_date=actual_start_date,
        actual_end_date=actual_end_date,
        plan_progress=plan_progress,
        actual_progress=actual_progress,
        weight=weight,
        deliverable=deliverable,
    )
    db.add(item)
    db.commit()
    db.refresh(item)

    # 담당자 목록: assignee_ids가 우선, 없으면 legacy assignee_id 단일값
    ids = _parse_ids(assignee_ids)
    if ids is None and assignee_id is not None:
        ids = [assignee_id]
    if ids is not None:
        _set_assignees(item.id, ids, db)
        db.commit()
        db.refresh(item)

    return {
        "id": item.id,
        "project_id": item.project_id,
        "parent_id": item.parent_id,
        "level": item.level,
        "wbs_number": item.wbs_number,
        "title": item.title,
        "assignee_id": item.assignee_id,
        "assignees": _list_assignees(item.id, db),
        "status": item.status,
    }

# WBS 전체 조회 (트리 구조)
@router.get("/projects/{project_id}/wbs")
def get_wbs(project_id: int, db: Session = Depends(get_db)):
    items = db.query(models.WBSItem).filter(
        models.WBSItem.project_id == project_id
    ).order_by(models.WBSItem.wbs_number).all()

    result = []
    for item in items:
        assignees = _list_assignees(item.id, db)
        # 하위호환: wbs_assignees 행이 없지만 legacy assignee_id가 설정돼 있으면 그 값을 보여줌
        if not assignees and item.assignee_id:
            user = db.query(models.User).filter(models.User.id == item.assignee_id).first()
            if user:
                assignees = [{"user_id": user.id, "name": user.name}]

        first = assignees[0] if assignees else None
        result.append({
            "id": item.id,
            "project_id": item.project_id,
            "parent_id": item.parent_id,
            "level": item.level,
            "wbs_number": item.wbs_number,
            "title": item.title,
            "assignee_id": first["user_id"] if first else item.assignee_id,
            "assignee_name": first["name"] if first else None,
            "assignees": assignees,
            "status": item.status,
            "plan_start_date": str(item.plan_start_date) if item.plan_start_date else None,
            "plan_end_date": str(item.plan_end_date) if item.plan_end_date else None,
            "actual_start_date": str(item.actual_start_date) if item.actual_start_date else None,
            "actual_end_date": str(item.actual_end_date) if item.actual_end_date else None,
            "plan_progress": item.plan_progress,
            "actual_progress": item.actual_progress,
            "weight": item.weight,
            "deliverable": item.deliverable,
        })
    return result

# WBS 항목 수정
@router.put("/wbs/{item_id}")
def update_wbs_item(
    item_id: int,
    title: str = None,
    assignee_id: int = None,
    assignee_ids: str = None,
    status: str = None,
    plan_start_date: date = None,
    plan_end_date: date = None,
    actual_start_date: date = None,
    actual_end_date: date = None,
    plan_progress: float = None,
    actual_progress: float = None,
    weight: float = None,
    deliverable: str = None,
    wbs_number: str = None,
    level: int = None,
    parent_id: int = None,
    db: Session = Depends(get_db)
):
    item = db.query(models.WBSItem).filter(models.WBSItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="WBS 항목을 찾을 수 없어요.")

    if title is not None: item.title = title
    if status is not None: item.status = status
    if plan_start_date is not None: item.plan_start_date = plan_start_date
    if plan_end_date is not None: item.plan_end_date = plan_end_date
    if actual_start_date is not None: item.actual_start_date = actual_start_date
    if actual_end_date is not None: item.actual_end_date = actual_end_date
    if plan_progress is not None: item.plan_progress = plan_progress
    if actual_progress is not None: item.actual_progress = actual_progress
    if weight is not None: item.weight = weight
    if deliverable is not None: item.deliverable = deliverable
    if wbs_number is not None: item.wbs_number = wbs_number
    if level is not None: item.level = level
    if parent_id is not None: item.parent_id = parent_id

    # 담당자 업데이트: assignee_ids가 우선 (빈 문자열이면 clear),
    # assignee_ids 미지정이고 assignee_id가 오면 단일 담당자 교체 (하위호환)
    if assignee_ids is not None:
        ids = _parse_ids(assignee_ids) or []
        _set_assignees(item.id, ids, db)
    elif assignee_id is not None:
        _set_assignees(item.id, [assignee_id], db)

    db.commit()
    db.refresh(item)
    return {
        "id": item.id,
        "project_id": item.project_id,
        "parent_id": item.parent_id,
        "level": item.level,
        "wbs_number": item.wbs_number,
        "title": item.title,
        "assignee_id": item.assignee_id,
        "assignees": _list_assignees(item.id, db),
        "status": item.status,
    }

# WBS 항목 삭제
@router.delete("/wbs/{item_id}")
def delete_wbs_item(item_id: int, db: Session = Depends(get_db)):
    item = db.query(models.WBSItem).filter(models.WBSItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="WBS 항목을 찾을 수 없어요.")
    db.query(models.WBSAssignee).filter(models.WBSAssignee.wbs_id == item_id).delete()
    db.delete(item)
    db.commit()
    return {"message": "WBS 항목이 삭제됐어요."}
