"""
공통 인가(authorization) 헬퍼.
각 라우터의 엔드포인트에서 호출해 프로젝트 멤버십/PM·PL 여부를 검사.
"""
from fastapi import HTTPException
from sqlalchemy.orm import Session
import models


def require_project_member(project_id: int, user_id: int, db: Session):
    """
    프로젝트 멤버가 아니면 403.
    ProjectMember 행이 없더라도 Project.pm_id == user_id 면 PM으로 간주(synthetic).
    """
    if not user_id:
        raise HTTPException(status_code=401, detail="인증이 필요해요.")
    member = db.query(models.ProjectMember).filter(
        models.ProjectMember.project_id == project_id,
        models.ProjectMember.user_id == user_id,
    ).first()
    if member:
        return member

    # Fallback: Project.pm_id 로 등록된 legacy PM (ProjectMember 행 없음)
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if project and project.pm_id == user_id:
        return None  # synthetic PM

    raise HTTPException(status_code=403, detail="프로젝트 멤버가 아닙니다.")


def require_pm_or_pl(project_id: int, user_id: int, db: Session):
    """
    PM/PL 역할이 아니면 403.
    ProjectMember 행이 없더라도 Project.pm_id == user_id 면 PM으로 간주(synthetic).
    """
    if not user_id:
        raise HTTPException(status_code=401, detail="인증이 필요해요.")
    member = db.query(models.ProjectMember).filter(
        models.ProjectMember.project_id == project_id,
        models.ProjectMember.user_id == user_id,
        models.ProjectMember.project_role.in_(["PM", "PL"]),
    ).first()
    if member:
        return member

    # Fallback: Project.pm_id 로 등록된 legacy PM
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if project and project.pm_id == user_id:
        return None  # synthetic PM (ProjectMember 행 없음)

    raise HTTPException(status_code=403, detail="PM 또는 PL만 가능합니다.")
