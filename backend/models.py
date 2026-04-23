from sqlalchemy import Column, Integer, BigInteger, String, Text, Date, DateTime, Float, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base

class Organization(Base):
    __tablename__ = "organizations"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    parent_id = Column(Integer, ForeignKey("organizations.id"), nullable=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True)  # 임시팀용 프로젝트 연결

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False)
    password = Column(String, nullable=False)
    role = Column(String, default="user")  # system_role: admin/manager/user
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=True)
    position = Column(String, nullable=True)  # 사장/부사장/본부장/이사/수석/책임/대리/사원/연구원
    project_role = Column(String, nullable=True)  # PM/PL/PAO/Member
    is_org_admin = Column(Boolean, default=False)

class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(String)
    status = Column(String, default="제안")  # 프로젝트 상태: 제안/수행/종료
    start_date = Column(Date)
    end_date = Column(Date)
    original_start_date = Column(Date, nullable=True)  # 최초 계획 시작일 (불변)
    original_end_date   = Column(Date, nullable=True)  # 최초 계획 종료일 (불변)
    pm_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=True)  # 임시팀 소속 본부
    client = Column(String, nullable=True)  # 발주기관
    budget = Column(BigInteger, nullable=True)  # 사업금액 (원 단위)
    bid_deadline = Column(DateTime, nullable=True)  # 입찰마감일
    pipeline_stage = Column(String, default="공고전")  # 검토: 공고전/사전공고/본공고/재공고 · 제안: 제안계획/제안진행/제안제출/평가 · 수행: 수주/기술협상/계약/수행중/완료 · 이력: 실주/제안포기
    country = Column(String, nullable=True)  # 국가/지역
    proposal_writer = Column(String, nullable=True)  # 제안작성자

    # 기본 정보
    announcement_number = Column(String, nullable=True)  # 공고번호
    project_type = Column(String, nullable=True)  # 사업유형: PMC/ISP/BPR/컨설팅/감리/구축/기타
    division = Column(String, nullable=True)  # 구분: ODA/국내공공/민간

    # 일정 정보
    announcement_date = Column(Date, nullable=True)  # 공고일
    submission_deadline = Column(DateTime, nullable=True)  # 제안서 제출 마감
    bidding_deadline = Column(DateTime, nullable=True)  # 투찰 마감일시 (bid_deadline과 별도)
    evaluation_date = Column(Date, nullable=True)  # 평가 예정일

    # 계약/인력 정보
    contract_method = Column(String, nullable=True)  # 계약방법: 협상/제한경쟁/일반경쟁
    participation_limit = Column(String, nullable=True)  # 참가자격제한: 중소기업/중견기업/대기업가능/무제한
    joint_performance = Column(Boolean, default=False)  # 공동이행 여부
    subcontract_allowed = Column(Boolean, default=False)  # 하도급 가능 여부
    win_amount = Column(BigInteger, nullable=True)  # 수주금액
    consortium_members = Column(String, nullable=True)  # 참여업체 (컨소시엄/하도급)

    # 평가 정보
    evaluation_method = Column(String, nullable=True)  # 평가방식: 서면/발표/복합
    tech_score_ratio = Column(Integer, nullable=True)  # 기술점수 비중 (%)
    price_score_ratio = Column(Integer, nullable=True)  # 가격점수 비중 (%)
    evaluation_agency = Column(String, nullable=True)  # 평가기관
    negotiation_threshold = Column(String, nullable=True)  # 협상적격 기준

    # 내용 정보
    overview = Column(Text, nullable=True)  # 사업 개요 (장문)
    deliverables = Column(Text, nullable=True)  # 주요 산출물
    pm_requirements = Column(Text, nullable=True)  # PM 자격요건
    language_requirements = Column(String, nullable=True)  # 언어 요건
    special_notes = Column(Text, nullable=True)  # 특이사항
    announcement_url = Column(String, nullable=True)  # 공고문 URL

class ProjectMember(Base):
    __tablename__ = "project_members"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"))
    user_id = Column(Integer, ForeignKey("users.id"))
    project_role = Column(String, nullable=True)  # PM/PL/PAO/Member
    is_org_admin = Column(Boolean, default=False)

class WBSItem(Base):
    __tablename__ = "wbs_items"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    parent_id = Column(Integer, ForeignKey("wbs_items.id"), nullable=True)
    level = Column(Integer, default=1)  # 1/2/3/4
    wbs_number = Column(String)  # 1.1.1 형태
    title = Column(String, nullable=False)
    assignee_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    status = Column(String, default="대기")  # 대기/진행중/완료
    plan_start_date = Column(Date)
    plan_end_date = Column(Date)
    actual_start_date = Column(Date)
    actual_end_date = Column(Date)
    plan_progress = Column(Float, default=0.0)
    actual_progress = Column(Float, default=0.0)
    weight = Column(Float, default=1.0)
    deliverable = Column(String)

class WBSAssignee(Base):
    __tablename__ = "wbs_assignees"

    id = Column(Integer, primary_key=True, index=True)
    wbs_id = Column(Integer, ForeignKey("wbs_items.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)

class ProjectFile(Base):
    __tablename__ = "project_files"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    filename = Column(String, nullable=False)
    filepath = Column(String, nullable=False)
    filesize = Column(BigInteger, nullable=True)
    uploaded_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class WBSFile(Base):
    __tablename__ = "wbs_files"

    id = Column(Integer, primary_key=True, index=True)
    wbs_id = Column(Integer, ForeignKey("wbs_items.id"), nullable=False)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    filename = Column(String, nullable=False)
    filepath = Column(String, nullable=False)
    filesize = Column(BigInteger, nullable=True)
    uploaded_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class ProjectComment(Base):
    __tablename__ = "project_comments"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    content = Column(String, nullable=False)
    comment_type = Column(String, default="manual")  # 'manual' / 'auto'
    created_at = Column(DateTime, default=datetime.utcnow)


class WorkReport(Base):
    __tablename__ = "work_reports"

    id = Column(Integer, primary_key=True, index=True)
    wbs_id = Column(Integer, ForeignKey("wbs_items.id"), nullable=False)
    requester_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    report_type = Column(String, nullable=False)  # 진척보고/일정조정/완료보고
    current_progress = Column(Float)
    requested_progress = Column(Float)
    current_end_date = Column(Date)
    requested_end_date = Column(Date)
    memo = Column(String)
    status = Column(String, default="대기")  # 대기/승인/반려
    created_at = Column(DateTime, default=datetime.utcnow)
    pm_comment = Column(String, nullable=True)


class WBSComment(Base):
    __tablename__ = "wbs_comments"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    wbs_id = Column(Integer, ForeignKey("wbs_items.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    parent_comment_id = Column(Integer, ForeignKey("wbs_comments.id"), nullable=True)
    content = Column(Text, nullable=False)
    comment_type = Column(String, default="memo")  # memo/question/answer/progress_note
    memo_category = Column(String, nullable=True)  # daily_work/issue/next_action/reference
    visibility_scope = Column(String, default="all")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)


class WBSInstruction(Base):
    __tablename__ = "wbs_instructions"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    wbs_id = Column(Integer, ForeignKey("wbs_items.id"), nullable=False)
    author_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    title = Column(String, nullable=False)
    content = Column(Text, nullable=True)
    priority = Column(String, default="normal")  # low/normal/high/urgent
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)


class WBSInstructionReceipt(Base):
    __tablename__ = "wbs_instruction_receipts"

    id = Column(Integer, primary_key=True, index=True)
    instruction_id = Column(Integer, ForeignKey("wbs_instructions.id", ondelete="CASCADE"), nullable=False)
    target_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    status = Column(String, default="open")  # open/acknowledged/in_progress/completed/cancelled
    acknowledged_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    completion_note = Column(Text, nullable=True)


class ActivityLog(Base):
    __tablename__ = "activity_logs"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    wbs_id = Column(Integer, ForeignKey("wbs_items.id"), nullable=True)
    actor_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    action_type = Column(String, nullable=False)
    before_json = Column(Text, nullable=True)
    after_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)