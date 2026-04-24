from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import SessionLocal
from datetime import date, datetime
import models
from routers.wbs import _safe_unlink_upload

router = APIRouter()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _iso(v):
    return v.isoformat() if v else None


def _validate_department(department_id: int, db: Session):
    """department_id 조직이 존재하고 '본부'(= parent_id 있는 하위 조직)인지 검증.
    최상위(회사) 혹은 임시팀(project_id 있음)은 본부로 허용하지 않음.
    department_id가 None이면 검증 스킵.
    """
    if department_id is None:
        return
    org = db.query(models.Organization).filter(
        models.Organization.id == department_id
    ).first()
    if not org:
        raise HTTPException(status_code=404, detail="지정한 본부를 찾을 수 없어요.")
    if org.parent_id is None:
        raise HTTPException(
            status_code=400,
            detail="최상위 조직(회사)은 본부로 지정할 수 없어요.",
        )


def _serialize_project(p, db):
    pm_name = None
    if p.pm_id:
        pm = db.query(models.User).filter(models.User.id == p.pm_id).first()
        pm_name = pm.name if pm else None
    organization_name = None
    if p.organization_id:
        org = db.query(models.Organization).filter(models.Organization.id == p.organization_id).first()
        organization_name = org.name if org else None
    department_name = None
    if p.department_id:
        dept = db.query(models.Organization).filter(models.Organization.id == p.department_id).first()
        department_name = dept.name if dept else None
    return {
        "id": p.id,
        "name": p.name,
        "description": p.description,
        "status": p.status,
        "start_date": str(p.start_date) if p.start_date else None,
        "end_date": str(p.end_date) if p.end_date else None,
        "original_start_date": str(p.original_start_date) if p.original_start_date else None,
        "original_end_date":   str(p.original_end_date) if p.original_end_date else None,
        "pm_id": p.pm_id,
        "pm_name": pm_name,
        "organization_id": p.organization_id,
        "organization_name": organization_name,
        "department_id": p.department_id,
        "department_name": department_name,
        "client": p.client,
        "budget": p.budget,
        "bid_deadline": _iso(p.bid_deadline),
        "pipeline_stage": p.pipeline_stage,
        "country": p.country,
        "proposal_writer": p.proposal_writer,
        # 기본 정보
        "announcement_number": p.announcement_number,
        "project_type": p.project_type,
        "division": p.division,
        # 일정 정보
        "announcement_date": str(p.announcement_date) if p.announcement_date else None,
        "submission_deadline": _iso(p.submission_deadline),
        "bidding_deadline": _iso(p.bidding_deadline),
        "evaluation_date": str(p.evaluation_date) if p.evaluation_date else None,
        # 계약/인력 정보
        "contract_method": p.contract_method,
        "participation_limit": p.participation_limit,
        "joint_performance": bool(p.joint_performance) if p.joint_performance is not None else False,
        "subcontract_allowed": bool(p.subcontract_allowed) if p.subcontract_allowed is not None else False,
        "win_amount": p.win_amount,
        "consortium_members": p.consortium_members,
        # 평가 정보
        "evaluation_method": p.evaluation_method,
        "tech_score_ratio": p.tech_score_ratio,
        "price_score_ratio": p.price_score_ratio,
        "evaluation_agency": p.evaluation_agency,
        "negotiation_threshold": p.negotiation_threshold,
        # 내용 정보
        "overview": p.overview,
        "deliverables": p.deliverables,
        "pm_requirements": p.pm_requirements,
        "language_requirements": p.language_requirements,
        "special_notes": p.special_notes,
        "announcement_url": p.announcement_url,
    }


# 프로젝트 생성
@router.post("/projects")
def create_project(
    name: str,
    description: str = "",
    status: str = "제안",
    start_date: date = None,
    end_date: date = None,
    pm_id: int = None,
    organization_id: int = None,
    department_id: int = None,
    client: str = None,
    budget: int = None,
    bid_deadline: datetime = None,
    pipeline_stage: str = "공고전",
    country: str = None,
    proposal_writer: str = None,
    # 기본 정보
    announcement_number: str = None,
    project_type: str = None,
    division: str = None,
    # 일정 정보
    announcement_date: date = None,
    submission_deadline: datetime = None,
    bidding_deadline: datetime = None,
    evaluation_date: date = None,
    # 계약/인력 정보
    contract_method: str = None,
    participation_limit: str = None,
    joint_performance: bool = False,
    subcontract_allowed: bool = False,
    win_amount: int = None,
    consortium_members: str = None,
    # 평가 정보
    evaluation_method: str = None,
    tech_score_ratio: int = None,
    price_score_ratio: int = None,
    evaluation_agency: str = None,
    negotiation_threshold: str = None,
    # 내용 정보
    overview: str = None,
    deliverables: str = None,
    pm_requirements: str = None,
    language_requirements: str = None,
    special_notes: str = None,
    announcement_url: str = None,
    db: Session = Depends(get_db),
):
    _validate_department(department_id, db)
    project = models.Project(
        name=name, description=description, status=status,
        start_date=start_date, end_date=end_date,
        original_start_date=start_date, original_end_date=end_date,
        pm_id=pm_id, organization_id=organization_id, department_id=department_id,
        client=client, budget=budget, bid_deadline=bid_deadline,
        pipeline_stage=pipeline_stage, country=country, proposal_writer=proposal_writer,
        announcement_number=announcement_number,
        project_type=project_type,
        division=division,
        announcement_date=announcement_date,
        submission_deadline=submission_deadline,
        bidding_deadline=bidding_deadline,
        evaluation_date=evaluation_date,
        contract_method=contract_method,
        participation_limit=participation_limit,
        joint_performance=joint_performance,
        subcontract_allowed=subcontract_allowed,
        win_amount=win_amount,
        consortium_members=consortium_members,
        evaluation_method=evaluation_method,
        tech_score_ratio=tech_score_ratio,
        price_score_ratio=price_score_ratio,
        evaluation_agency=evaluation_agency,
        negotiation_threshold=negotiation_threshold,
        overview=overview,
        deliverables=deliverables,
        pm_requirements=pm_requirements,
        language_requirements=language_requirements,
        special_notes=special_notes,
        announcement_url=announcement_url,
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return _serialize_project(project, db)

# 프로젝트 목록 조회
@router.get("/projects")
def get_projects(
    department_id: int = None,
    db: Session = Depends(get_db),
):
    """department_id 쿼리 파라미터를 주면 해당 본부 프로젝트만 필터."""
    q = db.query(models.Project)
    if department_id is not None:
        q = q.filter(models.Project.department_id == department_id)
    projects = q.all()
    return [_serialize_project(p, db) for p in projects]

# 프로젝트 단건 조회
@router.get("/projects/{project_id}")
def get_project(project_id: int, db: Session = Depends(get_db)):
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="프로젝트를 찾을 수 없어요.")
    return _serialize_project(project, db)

def _user_name(db, user_id):
    if not user_id:
        return None
    u = db.query(models.User).filter(models.User.id == user_id).first()
    return u.name if u else None


# 프로젝트 수정
@router.put("/projects/{project_id}")
def update_project(
    project_id: int,
    name: str = None,
    description: str = None,
    status: str = None,
    start_date: date = None,
    end_date: date = None,
    pm_id: int = None,
    organization_id: int = None,
    department_id: int = None,
    client: str = None,
    budget: int = None,
    bid_deadline: datetime = None,
    pipeline_stage: str = None,
    country: str = None,
    proposal_writer: str = None,
    # 기본 정보
    announcement_number: str = None,
    project_type: str = None,
    division: str = None,
    # 일정 정보
    announcement_date: date = None,
    submission_deadline: datetime = None,
    bidding_deadline: datetime = None,
    evaluation_date: date = None,
    # 계약/인력 정보
    contract_method: str = None,
    participation_limit: str = None,
    joint_performance: bool = None,
    subcontract_allowed: bool = None,
    win_amount: int = None,
    consortium_members: str = None,
    # 평가 정보
    evaluation_method: str = None,
    tech_score_ratio: int = None,
    price_score_ratio: int = None,
    evaluation_agency: str = None,
    negotiation_threshold: str = None,
    # 내용 정보
    overview: str = None,
    deliverables: str = None,
    pm_requirements: str = None,
    language_requirements: str = None,
    special_notes: str = None,
    announcement_url: str = None,
    user_id: int = None,
    db: Session = Depends(get_db),
):
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="프로젝트를 찾을 수 없어요.")

    auto_logs = []

    if pipeline_stage is not None and pipeline_stage != project.pipeline_stage:
        auto_logs.append(f"{project.pipeline_stage or '-'} → {pipeline_stage}")
    if status and status != project.status:
        auto_logs.append(f"상태: {project.status or '-'} → {status}")
    if pm_id and pm_id != project.pm_id:
        prev_name = _user_name(db, project.pm_id) or "-"
        new_name = _user_name(db, pm_id) or "-"
        auto_logs.append(f"PM: {prev_name} → {new_name}")

    if name: project.name = name
    if description is not None: project.description = description
    if status: project.status = status
    if start_date:
        project.start_date = start_date
        # original_start_date는 최초 1회만 저장 (이후 수정/범위 확장에는 보존)
        if project.original_start_date is None:
            project.original_start_date = start_date
    if end_date:
        project.end_date = end_date
        if project.original_end_date is None:
            project.original_end_date = end_date
    if pm_id: project.pm_id = pm_id
    if organization_id is not None: project.organization_id = organization_id
    if department_id is not None:
        _validate_department(department_id, db)
        project.department_id = department_id
    if client is not None: project.client = client
    if budget is not None: project.budget = budget
    if bid_deadline is not None: project.bid_deadline = bid_deadline
    if pipeline_stage is not None: project.pipeline_stage = pipeline_stage
    if country is not None: project.country = country
    if proposal_writer is not None: project.proposal_writer = proposal_writer

    # 기본 정보
    if announcement_number is not None: project.announcement_number = announcement_number
    if project_type is not None: project.project_type = project_type
    if division is not None: project.division = division
    # 일정 정보
    if announcement_date is not None: project.announcement_date = announcement_date
    if submission_deadline is not None: project.submission_deadline = submission_deadline
    if bidding_deadline is not None: project.bidding_deadline = bidding_deadline
    if evaluation_date is not None: project.evaluation_date = evaluation_date
    # 계약/인력 정보
    if contract_method is not None: project.contract_method = contract_method
    if participation_limit is not None: project.participation_limit = participation_limit
    if joint_performance is not None: project.joint_performance = joint_performance
    if subcontract_allowed is not None: project.subcontract_allowed = subcontract_allowed
    if win_amount is not None: project.win_amount = win_amount
    if consortium_members is not None: project.consortium_members = consortium_members
    # 평가 정보
    if evaluation_method is not None: project.evaluation_method = evaluation_method
    if tech_score_ratio is not None: project.tech_score_ratio = tech_score_ratio
    if price_score_ratio is not None: project.price_score_ratio = price_score_ratio
    if evaluation_agency is not None: project.evaluation_agency = evaluation_agency
    if negotiation_threshold is not None: project.negotiation_threshold = negotiation_threshold
    # 내용 정보
    if overview is not None: project.overview = overview
    if deliverables is not None: project.deliverables = deliverables
    if pm_requirements is not None: project.pm_requirements = pm_requirements
    if language_requirements is not None: project.language_requirements = language_requirements
    if special_notes is not None: project.special_notes = special_notes
    if announcement_url is not None: project.announcement_url = announcement_url

    for content in auto_logs:
        db.add(models.ProjectComment(
            project_id=project.id,
            user_id=user_id,
            content=content,
            comment_type="auto",
        ))

    db.commit()
    db.refresh(project)
    return _serialize_project(project, db)

# 프로젝트 삭제 (연관 데이터 cascade)
@router.delete("/projects/{project_id}")
def delete_project(project_id: int, db: Session = Depends(get_db)):
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="프로젝트를 찾을 수 없어요.")

    # 1) 프로젝트 멤버
    db.query(models.ProjectMember).filter(
        models.ProjectMember.project_id == project_id
    ).delete(synchronize_session=False)

    # 2) WBS 연관 데이터 (wbs_id 기반). WBS 항목 삭제 전에 모두 정리.
    wbs_ids = [w.id for w in db.query(models.WBSItem.id).filter(
        models.WBSItem.project_id == project_id
    ).all()]
    if wbs_ids:
        # 2-a) WBS 산출물 파일 (실물 + 레코드)
        file_rows = db.query(models.WBSFile).filter(
            models.WBSFile.wbs_id.in_(wbs_ids)
        ).all()
        for f in file_rows:
            _safe_unlink_upload(f.filepath)
        db.query(models.WBSFile).filter(
            models.WBSFile.wbs_id.in_(wbs_ids)
        ).delete(synchronize_session=False)

        # 2-b) WBS 댓글 (자기참조 FK 선해제)
        db.query(models.WBSComment).filter(
            models.WBSComment.wbs_id.in_(wbs_ids)
        ).update({models.WBSComment.parent_comment_id: None}, synchronize_session=False)
        db.query(models.WBSComment).filter(
            models.WBSComment.wbs_id.in_(wbs_ids)
        ).delete(synchronize_session=False)

        # 2-c) 지시 수신 → 지시
        instruction_ids = [
            i.id for i in db.query(models.WBSInstruction.id).filter(
                models.WBSInstruction.wbs_id.in_(wbs_ids)
            ).all()
        ]
        if instruction_ids:
            db.query(models.WBSInstructionReceipt).filter(
                models.WBSInstructionReceipt.instruction_id.in_(instruction_ids)
            ).delete(synchronize_session=False)
        db.query(models.WBSInstruction).filter(
            models.WBSInstruction.wbs_id.in_(wbs_ids)
        ).delete(synchronize_session=False)

        # 2-d) 담당자
        db.query(models.WBSAssignee).filter(
            models.WBSAssignee.wbs_id.in_(wbs_ids)
        ).delete(synchronize_session=False)

    # 2-e) 프로젝트 전체 활동 이력 (wbs_id 나 project_id 기준 모두)
    db.query(models.ActivityLog).filter(
        models.ActivityLog.project_id == project_id
    ).delete(synchronize_session=False)

    # 2-f) WBS 본체
    db.query(models.WBSItem).filter(
        models.WBSItem.project_id == project_id
    ).delete(synchronize_session=False)

    # 3) 프로젝트 코멘트
    db.query(models.ProjectComment).filter(
        models.ProjectComment.project_id == project_id
    ).delete(synchronize_session=False)

    # 4) 프로젝트 파일
    db.query(models.ProjectFile).filter(
        models.ProjectFile.project_id == project_id
    ).delete(synchronize_session=False)

    # 5) 임시팀 조직이 이 프로젝트를 참조하면 끊어주기 (조직 자체는 유지)
    db.query(models.Organization).filter(
        models.Organization.project_id == project_id
    ).update({models.Organization.project_id: None}, synchronize_session=False)

    # 6) Project 본체
    db.delete(project)
    db.commit()
    return {"message": "프로젝트가 삭제됐어요."}
