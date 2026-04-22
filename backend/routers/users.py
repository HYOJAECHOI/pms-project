from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import SessionLocal
import models
import bcrypt

router = APIRouter()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# 유저 생성
@router.post("/users")
def create_user(
    name: str,
    email: str,
    password: str,
    role: str = "user",
    position: str = None,
    project_role: str = None,
    organization_id: int = None,
    db: Session = Depends(get_db),
):
    existing_user = db.query(models.User).filter(models.User.email == email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="이미 사용 중인 이메일이에요.")

    hashed_password = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    user = models.User(
        name=name,
        email=email,
        password=hashed_password,
        role=role,
        position=position,
        project_role=project_role,
        organization_id=organization_id,
        is_org_admin=False,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "role": user.role,
        "position": user.position,
        "project_role": user.project_role,
        "organization_id": user.organization_id,
        "is_org_admin": user.is_org_admin,
    }

# 유저 목록 조회
@router.get("/users")
def get_users(db: Session = Depends(get_db)):
    users = db.query(models.User).all()
    result = []
    for u in users:
        organization_name = None
        if u.organization_id:
            org = db.query(models.Organization).filter(models.Organization.id == u.organization_id).first()
            organization_name = org.name if org else None
        result.append({
            "id": u.id,
            "name": u.name,
            "email": u.email,
            "role": u.role,
            "position": u.position,
            "project_role": u.project_role,
            "organization_id": u.organization_id,
            "organization_name": organization_name,
            "is_org_admin": bool(u.is_org_admin),
        })
    return result

# 유저 수정
@router.put("/users/{user_id}")
def update_user(
    user_id: int,
    name: str = None,
    role: str = None,
    organization_id: int = None,
    position: str = None,
    project_role: str = None,
    is_org_admin: bool = None,
    db: Session = Depends(get_db),
):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="유저를 찾을 수 없어요.")
    if name is not None: user.name = name
    if role is not None: user.role = role
    if organization_id is not None: user.organization_id = organization_id if organization_id > 0 else None
    if position is not None: user.position = position
    if project_role is not None: user.project_role = project_role
    if is_org_admin is not None: user.is_org_admin = is_org_admin
    db.commit()
    db.refresh(user)
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "role": user.role,
        "position": user.position,
        "project_role": user.project_role,
        "organization_id": user.organization_id,
        "is_org_admin": bool(user.is_org_admin),
    }

# 유저 삭제
@router.delete("/users/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="유저를 찾을 수 없어요.")
    db.delete(user)
    db.commit()
    return {"message": "유저가 삭제됐어요."}