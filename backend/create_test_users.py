import bcrypt
from datetime import date
from database import SessionLocal
import models

TEST_USERS = [
    {"email": "admin@pms.com",   "name": "테스트관리자", "role": "admin",   "position": "사장"},
    {"email": "manager@pms.com", "name": "테스트본부장", "role": "manager", "position": "본부장"},
    {"email": "pm@pms.com",      "name": "테스트PM",    "role": "manager", "position": "책임"},
    {"email": "user@pms.com",    "name": "테스트사원",  "role": "user",    "position": "사원"},
]
PASSWORD = "1234"

TEST_PROJECTS = [
    {
        "name": "테스트_수행중프로젝트",
        "pipeline_stage": "수행중",
        "status": "수행",
        "start_date": date(2026, 1, 1),
        "end_date":   date(2026, 6, 30),
    },
    {
        "name": "테스트_제안중프로젝트",
        "pipeline_stage": "제안진행",
        "status": "제안",
        "start_date": date(2026, 2, 1),
        "end_date":   date(2026, 12, 31),
    },
    {
        "name": "테스트_완료프로젝트",
        "pipeline_stage": "완료",
        "status": "종료",
        "start_date": date(2025, 6, 1),
        "end_date":   date(2026, 1, 31),
    },
]

TEST_WBS = [
    {
        "title": "요구사항 분석", "level": 1, "wbs_number": "1",
        "plan_start_date": date(2026, 3, 1),  "plan_end_date": date(2026, 4, 30),
        "actual_start_date": date(2026, 3, 1), "actual_end_date": date(2026, 4, 10),
        "actual_progress": 1.0, "status": "완료",
    },
    {
        "title": "시스템 설계", "level": 1, "wbs_number": "2",
        "plan_start_date": date(2026, 4, 1), "plan_end_date": date(2026, 5, 15),
        "actual_start_date": date(2026, 4, 5), "actual_end_date": None,
        "actual_progress": 0.6, "status": "진행중",
    },
    {
        "title": "개발", "level": 1, "wbs_number": "3",
        "plan_start_date": date(2026, 4, 10), "plan_end_date": date(2026, 4, 20),
        "actual_start_date": None, "actual_end_date": None,
        "actual_progress": 0.3, "status": "진행중",
    },
    {
        "title": "테스트", "level": 1, "wbs_number": "4",
        "plan_start_date": date(2026, 5, 1), "plan_end_date": date(2026, 5, 31),
        "actual_start_date": None, "actual_end_date": None,
        "actual_progress": 0.0, "status": "대기",
    },
]


def hash_pw(pw: str) -> str:
    return bcrypt.hashpw(pw.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def ensure_users(db):
    out = {}
    for spec in TEST_USERS:
        existing = db.query(models.User).filter(models.User.email == spec["email"]).first()
        if existing is None:
            user = models.User(
                email=spec["email"],
                name=spec["name"],
                role=spec["role"],
                position=spec["position"],
                password=hash_pw(PASSWORD),
            )
            db.add(user)
            db.flush()
            print(f"[USER CREATED] {spec['email']} (role={spec['role']})")
            out[spec["email"]] = user
        else:
            changes = []
            if existing.role != spec["role"]:
                changes.append(f"role {existing.role} -> {spec['role']}")
                existing.role = spec["role"]
            if existing.position != spec["position"]:
                changes.append(f"position -> {spec['position']}")
                existing.position = spec["position"]
            existing.password = hash_pw(PASSWORD)
            changes.append("password reset")
            print(f"[USER UPDATED] {spec['email']} ({', '.join(changes)})")
            out[spec["email"]] = existing
    return out


def ensure_org_for_users(db, users):
    org = db.query(models.Organization).order_by(models.Organization.id).first()
    if org is None:
        org = models.Organization(name="테스트본부")
        db.add(org)
        db.flush()
        print(f"[ORG CREATED] id={org.id} name={org.name}")
    else:
        print(f"[ORG FOUND] id={org.id} name={org.name}")
    for email, user in users.items():
        if user.organization_id != org.id:
            user.organization_id = org.id
            print(f"  - {email} -> organization_id={org.id}")
    return org


def ensure_projects(db, users, org):
    out = {}
    pm_user = users["pm@pms.com"]
    for spec in TEST_PROJECTS:
        existing = db.query(models.Project).filter(models.Project.name == spec["name"]).first()
        if existing is None:
            project = models.Project(
                name=spec["name"],
                description=f"{spec['name']} - 테스트용 자동 생성 프로젝트",
                status=spec["status"],
                pipeline_stage=spec["pipeline_stage"],
                start_date=spec["start_date"],
                end_date=spec["end_date"],
                pm_id=pm_user.id,
                organization_id=org.id,
                client="테스트발주기관",
            )
            db.add(project)
            db.flush()
            print(f"[PROJECT CREATED] id={project.id} name={project.name}")
            out[spec["name"]] = project
        else:
            print(f"[PROJECT SKIP] {spec['name']} (이미 존재 id={existing.id})")
            out[spec["name"]] = existing
    return out


def ensure_members(db, users, projects):
    role_map = [
        ("pm@pms.com",      "PM"),
        ("user@pms.com",    "Member"),
        ("manager@pms.com", "Member"),
    ]
    for project in projects.values():
        for email, project_role in role_map:
            user = users[email]
            existing = (
                db.query(models.ProjectMember)
                .filter(
                    models.ProjectMember.project_id == project.id,
                    models.ProjectMember.user_id == user.id,
                )
                .first()
            )
            if existing is None:
                db.add(models.ProjectMember(
                    project_id=project.id,
                    user_id=user.id,
                    project_role=project_role,
                ))
                print(f"[MEMBER ADDED] {project.name} <- {email} ({project_role})")
            elif existing.project_role != project_role:
                print(f"[MEMBER UPDATED] {project.name} {email} role {existing.project_role} -> {project_role}")
                existing.project_role = project_role


def ensure_wbs(db, users, project):
    assignee = users["user@pms.com"]
    out = {}
    for spec in TEST_WBS:
        existing = (
            db.query(models.WBSItem)
            .filter(
                models.WBSItem.project_id == project.id,
                models.WBSItem.title == spec["title"],
            )
            .first()
        )
        if existing is None:
            wbs = models.WBSItem(
                project_id=project.id,
                assignee_id=assignee.id,
                parent_id=None,
                level=spec["level"],
                wbs_number=spec["wbs_number"],
                title=spec["title"],
                status=spec["status"],
                plan_start_date=spec["plan_start_date"],
                plan_end_date=spec["plan_end_date"],
                actual_start_date=spec["actual_start_date"],
                actual_end_date=spec["actual_end_date"],
                actual_progress=spec["actual_progress"],
                weight=1.0,
            )
            db.add(wbs)
            db.flush()
            print(f"[WBS CREATED] {project.name} / {spec['wbs_number']} {spec['title']} (status={spec['status']})")
            out[spec["title"]] = wbs
        else:
            print(f"[WBS SKIP] {project.name} / {spec['title']} (이미 존재 id={existing.id})")
            out[spec["title"]] = existing
    return out


def main():
    db = SessionLocal()
    try:
        print("─── 1. 테스트 계정 ────────────────────────")
        users = ensure_users(db)
        print("\n─── 2. 조직 연결 ──────────────────────────")
        org = ensure_org_for_users(db, users)
        print("\n─── 3. 테스트 프로젝트 ────────────────────")
        projects = ensure_projects(db, users, org)
        print("\n─── 4. 프로젝트 멤버 ──────────────────────")
        ensure_members(db, users, projects)
        print("\n─── 5. WBS (수행중 프로젝트) ──────────────")
        ensure_wbs(db, users, projects["테스트_수행중프로젝트"])
        db.commit()
        print("\n[DONE] 모든 테스트 데이터 세팅 완료. password=1234")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
