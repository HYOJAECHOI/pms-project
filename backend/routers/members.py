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

# 프로젝트 멤버 추가
@router.post("/projects/{project_id}/members")
def add_member(
    project_id: int,
    user_id: int,
    project_role: str = None,
    db: Session = Depends(get_db),
):
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="프로젝트를 찾을 수 없어요.")

    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="유저를 찾을 수 없어요.")

    existing = db.query(models.ProjectMember).filter(
        models.ProjectMember.project_id == project_id,
        models.ProjectMember.user_id == user_id
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="이미 추가된 멤버예요.")

    member = models.ProjectMember(
        project_id=project_id,
        user_id=user_id,
        project_role=project_role,
        is_org_admin=False,
    )
    db.add(member)
    db.commit()
    db.refresh(member)
    return {
        "member_id": member.id,
        "project_id": member.project_id,
        "user_id": member.user_id,
        "project_role": member.project_role,
        "is_org_admin": bool(member.is_org_admin),
    }


# 프로젝트 멤버 수정 (project_role / is_org_admin)
@router.put("/projects/{project_id}/members/{user_id}")
def update_member(
    project_id: int,
    user_id: int,
    project_role: str = None,
    is_org_admin: bool = None,
    db: Session = Depends(get_db),
):
    member = db.query(models.ProjectMember).filter(
        models.ProjectMember.project_id == project_id,
        models.ProjectMember.user_id == user_id
    ).first()
    if not member:
        raise HTTPException(status_code=404, detail="멤버를 찾을 수 없어요.")
    if project_role is not None: member.project_role = project_role
    if is_org_admin is not None: member.is_org_admin = is_org_admin
    db.commit()
    db.refresh(member)
    return {
        "member_id": member.id,
        "project_id": member.project_id,
        "user_id": member.user_id,
        "project_role": member.project_role,
        "is_org_admin": bool(member.is_org_admin),
    }

# 프로젝트 멤버 목록 조회 (PM 자동 포함)
@router.get("/projects/{project_id}/members")
def get_members(project_id: int, db: Session = Depends(get_db)):
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="프로젝트를 찾을 수 없어요.")

    members = db.query(models.ProjectMember).filter(
        models.ProjectMember.project_id == project_id
    ).all()

    result = []
    seen = set()

    # PM을 먼저 포함 (ProjectMember 행이 없어도 담당자 후보에 노출)
    if project.pm_id:
        pm = db.query(models.User).filter(models.User.id == project.pm_id).first()
        if pm:
            pm_member = db.query(models.ProjectMember).filter(
                models.ProjectMember.project_id == project_id,
                models.ProjectMember.user_id == project.pm_id,
            ).first()
            result.append({
                "member_id": pm_member.id if pm_member else None,
                "user_id": pm.id,
                "name": pm.name,
                "email": pm.email,
                "role": pm.role,
                "project_role": "PM",
                "is_org_admin": bool(pm_member.is_org_admin) if pm_member else False,
                "is_pm": True,
            })
            seen.add(pm.id)

    for member in members:
        if member.user_id in seen:
            continue
        user = db.query(models.User).filter(models.User.id == member.user_id).first()
        if not user:
            continue
        seen.add(user.id)
        result.append({
            "member_id": member.id,
            "user_id": user.id,
            "name": user.name,
            "email": user.email,
            "role": user.role,
            "project_role": member.project_role,
            "is_org_admin": bool(member.is_org_admin),
            "is_pm": False,
        })
    return result

# 프로젝트 멤버 제거
@router.delete("/projects/{project_id}/members/{user_id}")
def remove_member(project_id: int, user_id: int, db: Session = Depends(get_db)):
    member = db.query(models.ProjectMember).filter(
        models.ProjectMember.project_id == project_id,
        models.ProjectMember.user_id == user_id
    ).first()
    if not member:
        raise HTTPException(status_code=404, detail="멤버를 찾을 수 없어요.")
    db.delete(member)
    db.commit()
    return {"message": "멤버가 제거됐어요."}