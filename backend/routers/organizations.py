from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import SessionLocal
import models

router = APIRouter()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _user_name(db: Session, user_id):
    if not user_id:
        return None
    u = db.query(models.User).filter(models.User.id == user_id).first()
    return u.name if u else None


def _validate_leader(leader_id: int, org_id: int, db: Session):
    """leader_id 유저가 존재하고 해당 조직 소속이며 직위가 '본부장'인지 검증.
    leader_id가 None이면 검증 스킵.
    """
    if leader_id is None:
        return
    user = db.query(models.User).filter(models.User.id == leader_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="지정한 본부장 유저를 찾을 수 없어요.")
    if user.organization_id != org_id:
        raise HTTPException(
            status_code=400,
            detail="본부장은 해당 조직 소속이어야 합니다.",
        )
    if user.position != '본부장':
        raise HTTPException(
            status_code=400,
            detail="본부장 직위를 가진 유저만 지정할 수 있어요.",
        )


def _serialize_org(org, db: Session):
    parent_name = None
    if org.parent_id:
        parent = db.query(models.Organization).filter(
            models.Organization.id == org.parent_id
        ).first()
        parent_name = parent.name if parent else None
    return {
        "id": org.id,
        "name": org.name,
        "parent_id": org.parent_id,
        "parent_name": parent_name,
        "project_id": org.project_id,
        "leader_id": org.leader_id,
        "leader_name": _user_name(db, org.leader_id),
    }


# 조직 생성
@router.post("/organizations")
def create_organization(
    name: str,
    parent_id: int = None,
    leader_id: int = None,
    db: Session = Depends(get_db),
):
    """
    leader_id를 넘기면 org를 flush한 뒤 검증 (org.id가 있어야 소속 비교 가능).
    일반적으로 POST 시에는 leader_id 없이 만들고, 유저의 organization_id를 먼저
    이 조직으로 바꾼 뒤 PUT으로 leader_id 지정하는 흐름 권장.
    """
    org = models.Organization(name=name, parent_id=parent_id)
    db.add(org)
    db.flush()  # org.id 확보
    if leader_id is not None:
        _validate_leader(leader_id, org.id, db)
        org.leader_id = leader_id
    db.commit()
    db.refresh(org)
    return _serialize_org(org, db)

# 조직 목록 조회
@router.get("/organizations")
def get_organizations(db: Session = Depends(get_db)):
    orgs = db.query(models.Organization).all()
    return [_serialize_org(o, db) for o in orgs]

# 조직 수정
@router.put("/organizations/{org_id}")
def update_organization(
    org_id: int,
    name: str = None,
    parent_id: int = None,
    clear_parent: bool = False,
    leader_id: int = None,
    clear_leader: bool = False,
    db: Session = Depends(get_db),
):
    """
    parent_id: 새 상위 조직 id. None이면 변경 없음.
    clear_parent=True: parent_id를 명시적으로 NULL로 해제 (최상위 승격).
    leader_id: 새 본부장 id. None이면 변경 없음. 지정 시 조직 소속 검증.
    clear_leader=True: leader_id를 명시적으로 NULL로 해제 (본부장 제거).
    """
    org = db.query(models.Organization).filter(models.Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="조직을 찾을 수 없어요.")
    if name: org.name = name
    if parent_id: org.parent_id = parent_id
    if clear_parent: org.parent_id = None
    if leader_id is not None:
        _validate_leader(leader_id, org_id, db)
        org.leader_id = leader_id
    if clear_leader: org.leader_id = None
    db.commit()
    db.refresh(org)
    return _serialize_org(org, db)

# 조직 삭제 (하위 조직이 있으면 거부)
@router.delete("/organizations/{org_id}")
def delete_organization(org_id: int, db: Session = Depends(get_db)):
    org = db.query(models.Organization).filter(models.Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="조직을 찾을 수 없어요.")
    child_count = db.query(models.Organization).filter(models.Organization.parent_id == org_id).count()
    if child_count > 0:
        raise HTTPException(status_code=400, detail="하위 조직이 있어 삭제할 수 없어요.")
    db.delete(org)
    db.commit()
    return {"message": "조직이 삭제됐어요."}
