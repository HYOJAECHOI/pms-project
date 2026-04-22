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

# 조직 생성
@router.post("/organizations")
def create_organization(name: str, parent_id: int = None, db: Session = Depends(get_db)):
    org = models.Organization(name=name, parent_id=parent_id)
    db.add(org)
    db.commit()
    db.refresh(org)
    return org

# 조직 목록 조회
@router.get("/organizations")
def get_organizations(db: Session = Depends(get_db)):
    orgs = db.query(models.Organization).all()
    result = []
    for org in orgs:
        parent_name = None
        if org.parent_id:
            parent = db.query(models.Organization).filter(models.Organization.id == org.parent_id).first()
            parent_name = parent.name if parent else None
        result.append({
            "id": org.id,
            "name": org.name,
            "parent_id": org.parent_id,
            "parent_name": parent_name,
        })
    return result

# 조직 수정
@router.put("/organizations/{org_id}")
def update_organization(org_id: int, name: str = None, parent_id: int = None, db: Session = Depends(get_db)):
    org = db.query(models.Organization).filter(models.Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="조직을 찾을 수 없어요.")
    if name: org.name = name
    if parent_id: org.parent_id = parent_id
    db.commit()
    db.refresh(org)
    return org

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