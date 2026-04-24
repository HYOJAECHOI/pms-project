"""PMS 대용량 시드 데이터 스크립트.

전제: '한국IT컨설팅' 조직과 그 하위 본부들이 이미 등록되어 있어야 함.
재실행 안전: 이메일/프로젝트명 기준으로 중복은 스킵.

실행:
    cd backend
    venv\\Scripts\\activate
    python seed_data.py
"""
from __future__ import annotations

import os
import random
import sys
from datetime import date, datetime, timedelta

import bcrypt

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from database import SessionLocal  # noqa: E402
import models  # noqa: E402

random.seed(42)

DEFAULT_PASSWORD = "1234"
ROOT_ORG_NAME = "한국IT컨설팅"

USERS_TOTAL = 100
PROJECTS_2025 = 220
PROJECTS_2026 = 60

# 본부당 직위 쿼터 (남는 인원은 사원으로)
POSITION_QUOTA = [
    ("본부장", 1),
    ("이사",   2),
    ("수석",   3),
    ("책임",   5),
    ("대리",   5),
]

KOREAN_LAST = list("김이박최정강조윤장임한오서신권황안송전홍")
KOREAN_FIRST = [
    "민준", "서윤", "도윤", "서연", "예준", "하은", "주원", "지유", "시우", "지우",
    "연우", "채원", "우진", "수아", "건우", "유나", "현우", "서아", "지호", "민서",
    "태민", "수빈", "승현", "예린", "준서", "나연", "승우", "지민", "은우", "유진",
    "재윤", "소율", "성민", "하린", "주안", "채은", "규민", "다은", "원준", "서영",
    "경민", "수현", "태현", "아린", "승민", "현서", "우영", "민재", "재현", "수영",
    "찬우", "지원", "은서", "채아", "민호", "주영", "건희", "나윤", "태우", "서희",
]

CLIENTS = [
    "KOICA", "관세청", "행정안전부", "과학기술정보통신부", "한국전자통신연구원",
    "외교부", "국방부", "기획재정부", "통계청", "환경부", "조달청", "국토교통부",
    "한국전력공사", "한국수자원공사", "중소벤처기업부", "교육부", "고용노동부",
    "보건복지부", "문화체육관광부", "농림축산식품부", "산업통상자원부",
    "여성가족부", "해양수산부", "공정거래위원회", "국세청", "병무청", "경찰청",
]

COUNTRIES = [
    "한국", "베트남", "인도네시아", "케냐", "탄자니아", "에티오피아", "우즈베키스탄",
    "필리핀", "콜롬비아", "파라과이", "몽골", "미얀마", "캄보디아", "라오스", "페루",
    "방글라데시", "스리랑카", "네팔", "요르단", "튀니지",
]

KEYWORDS_2025 = [
    "공공데이터 개방 컨설팅", "스마트행정 ISP", "교육행정 정보화", "조달시스템 고도화",
    "전자정부 표준 적용", "빅데이터 플랫폼 구축", "클라우드 전환 컨설팅", "AI 기반 분석체계",
    "국방 ERP 진단", "수출입 통관 시스템", "보건의료 정보화", "ESG 데이터 거버넌스",
    "스마트 시티 PoC", "디지털 트윈 PoC", "RPA 도입 진단", "지방세 시스템 고도화",
    "전자조달 EA", "인사 시스템 통합", "재난안전 통합관제", "공공앱 운영지원",
    "물류 통계 분석", "해외 ODA 디지털전환", "개도국 전자정부", "역량강화 워크숍",
    "정보화 마스터플랜", "IT거버넌스 수립", "사이버보안 진단", "데이터 표준화 컨설팅",
    "정부24 운영 지원", "수자원 통합관리", "산림 정보화", "농업 빅데이터",
    "관광 통계 시스템", "교통 안전관리", "해양안전 통합관리", "검역 시스템 고도화",
    "전자세금계산서 운영", "국가기록물 디지털화",
]

KEYWORDS_2026 = [
    "AI 행정혁신 플랫폼", "차세대 통관 시스템", "국가 데이터 허브", "공공 LLM 도입",
    "디지털 ODA 전략", "스마트 농업 PoC", "재난대응 디지털화", "해외 e-Gov 컨설팅",
    "통합 보안관제 고도화", "공공클라우드 ISP", "빅데이터 분석포털", "스마트 의료체계",
    "전자정부 차세대", "글로벌 협력 플랫폼", "개도국 ICT 역량강화", "에너지 통합관리",
    "지능형 CCTV 통합", "스마트 항만", "해양 빅데이터", "교육 메타버스",
    "병역 정보화", "조세 인프라 개편", "ESG 통합관리", "산업 데이터 플랫폼",
    "스마트 검역", "디지털 트윈 도시", "공공블록체인", "챗봇 민원응대",
    "차세대 행정망", "글로벌 환경모니터링",
]

WBS_TITLES = [
    "요구사항 분석", "현황 진단", "아키텍처 설계", "상세 설계", "개발/구축", "테스트",
    "교육 및 이행", "산출물 검수", "사용자 매뉴얼", "운영 안정화", "품질 점검", "보안 진단",
]

# pipeline_stage 분포
STAGE_DIST_2025 = [("완료", 160), ("실주", 35), ("제안포기", 25)]
STAGE_DIST_2026 = [
    ("공고전", 8), ("사전공고", 6), ("본공고", 7), ("재공고", 3),
    ("제안계획", 4), ("제안진행", 6), ("제안제출", 5), ("평가", 3),
    ("수주", 3), ("기술협상", 2), ("계약", 2), ("수행중", 10),
    ("실주", 2), ("제안포기", 2),
]

PROPOSAL_STAGES = {"공고전", "사전공고", "본공고", "재공고", "제안계획", "제안진행", "제안제출", "평가"}
RUNNING_STAGES = {"수주", "기술협상", "계약", "수행중"}
DONE_STAGES = {"완료", "실주", "제안포기"}


# ─────────────────────────────────────────── helpers ────────────────────────

def hash_pw(pw: str) -> str:
    return bcrypt.hashpw(pw.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def stage_to_status(stage: str) -> str:
    if stage in DONE_STAGES:
        return "종료"
    if stage in RUNNING_STAGES:
        return "수행"
    return "제안"


def find_target_orgs(db):
    root = (
        db.query(models.Organization)
        .filter(models.Organization.name == ROOT_ORG_NAME)
        .first()
    )
    if not root:
        return []
    return (
        db.query(models.Organization)
        .filter(models.Organization.parent_id == root.id)
        .order_by(models.Organization.id)
        .all()
    )


def distribute_users(num_orgs: int, total: int):
    """100명을 num_orgs로 가능한 균등 분배."""
    base = total // num_orgs
    rem = total % num_orgs
    return [base + (1 if i < rem else 0) for i in range(num_orgs)]


def build_position_list(n_users: int):
    """n_users 만큼 직위 리스트 생성 (쿼터 우선, 나머지 사원)."""
    positions = []
    remaining = n_users
    for pos, qty in POSITION_QUOTA:
        take = min(qty, remaining)
        positions.extend([pos] * take)
        remaining -= take
        if remaining <= 0:
            break
    positions.extend(["사원"] * remaining)
    return positions


def gen_korean_name(used: set) -> str:
    for _ in range(80):
        n = random.choice(KOREAN_LAST) + random.choice(KOREAN_FIRST)
        if n not in used:
            used.add(n)
            return n
    n = random.choice(KOREAN_LAST) + random.choice(KOREAN_FIRST) + str(random.randint(1, 999))
    used.add(n)
    return n


def project_role_for(position: str) -> str:
    if position in ("본부장", "이사", "수석"):
        return "PM"
    if position == "책임":
        return "PL"
    if position == "대리":
        return "Member"
    return "Member"


# ──────────────────────────────────────── seeders ───────────────────────────

def seed_users(db, orgs):
    counts = distribute_users(len(orgs), USERS_TOTAL)
    print(f"[seed] 본부 {len(orgs)}개에 유저 분배: {counts}")

    used_names = {u.name for u in db.query(models.User).all()}
    org_users = {o.id: [] for o in orgs}
    new_count = 0
    seq = 1

    for org, n_users in zip(orgs, counts):
        for pos in build_position_list(n_users):
            email = f"u{seq:03d}@pms.com"
            seq += 1
            existing = db.query(models.User).filter(models.User.email == email).first()
            if existing:
                org_users[org.id].append(existing)
                continue
            user = models.User(
                name=gen_korean_name(used_names),
                email=email,
                password=hash_pw(DEFAULT_PASSWORD),
                role="user",  # manager 3명은 아래에서 별도 지정
                position=pos,
                project_role=project_role_for(pos),
                organization_id=org.id,
                is_org_admin=(pos == "본부장"),
            )
            db.add(user)
            db.flush()
            org_users[org.id].append(user)
            new_count += 1
        db.commit()

    # manager 3명: 처음 3개 본부의 본부장 우선
    manager_left = 3
    for org in orgs:
        if manager_left <= 0:
            break
        head = next((u for u in org_users[org.id] if u.position == "본부장"), None)
        if head and head.role != "manager":
            head.role = "manager"
            manager_left -= 1
    db.commit()

    return org_users, new_count


def random_date(a: date, b: date) -> date:
    if b <= a:
        return a
    return a + timedelta(days=random.randint(0, (b - a).days))


def make_project_2025(db, org, pm_user, idx, stage):
    keyword = random.choice(KEYWORDS_2025)
    name = f"[2025] {org.name[:6]} {keyword} #{idx:03d}"
    if db.query(models.Project).filter(models.Project.name == name).first():
        return None

    start = random_date(date(2024, 1, 1), date(2025, 6, 30))
    min_end = max(start + timedelta(days=60), date(2025, 1, 1))
    end = random_date(min_end, date(2025, 12, 31))

    proj = models.Project(
        name=name,
        description=f"{keyword} 사업 (2025년 종료)",
        status=stage_to_status(stage),
        start_date=start,
        end_date=end,
        pm_id=pm_user.id,
        department_id=org.id,
        client=random.choice(CLIENTS),
        budget=random.randint(1, 200) * 100_000_000,
        bid_deadline=None,
        pipeline_stage=stage,
        country=random.choice(COUNTRIES),
        proposal_writer=pm_user.name,
    )
    db.add(proj)
    db.flush()
    return proj


def make_project_2026(db, org, pm_user, idx, stage):
    keyword = random.choice(KEYWORDS_2026)
    name = f"[2026] {org.name[:6]} {keyword} #{idx:03d}"
    if db.query(models.Project).filter(models.Project.name == name).first():
        return None

    if stage in PROPOSAL_STAGES:
        bid = datetime(2026, random.randint(3, 8), random.randint(1, 28),
                       random.randint(9, 17), 0)
        start = date(2026, random.randint(6, 11), random.randint(1, 28))
        end_year = random.choice([2026, 2027, 2027, 2027])
        end_month = random.randint(start.month + 1, 12) if end_year == 2026 else random.randint(1, 12)
        end_month = min(max(end_month, 1), 12)
        end = date(end_year, end_month, random.randint(1, 28))
        if end < start:
            end = start + timedelta(days=180)
    elif stage in RUNNING_STAGES:
        bid = None
        start = date(2026, random.randint(1, 4), random.randint(1, 28))
        end_year = random.choice([2026, 2027])
        end_month = random.randint(6, 12) if end_year == 2026 else random.randint(1, 12)
        end = date(end_year, end_month, random.randint(1, 28))
        if end < start:
            end = start + timedelta(days=180)
    else:
        # 실주/제안포기 (2026 이력)
        bid = datetime(2026, random.randint(1, 3), random.randint(1, 28), 17, 0)
        start = date(2026, random.randint(4, 9), 1)
        end = date(2026, 12, 31)

    proj = models.Project(
        name=name,
        description=f"{keyword} 사업 (2026년 진행)",
        status=stage_to_status(stage),
        start_date=start,
        end_date=end,
        pm_id=pm_user.id,
        department_id=org.id,
        client=random.choice(CLIENTS),
        budget=random.randint(1, 200) * 100_000_000,
        bid_deadline=bid,
        pipeline_stage=stage,
        country=random.choice(COUNTRIES),
        proposal_writer=pm_user.name,
    )
    db.add(proj)
    db.flush()
    return proj


def add_members(db, proj, users):
    n = random.randint(3, 5)
    chosen = random.sample(users, min(n, len(users)))
    if proj.pm_id not in {u.id for u in chosen}:
        pm = next((u for u in users if u.id == proj.pm_id), None)
        if pm:
            chosen.append(pm)

    for u in chosen:
        existing = (
            db.query(models.ProjectMember)
            .filter(
                models.ProjectMember.project_id == proj.id,
                models.ProjectMember.user_id == u.id,
            )
            .first()
        )
        if existing:
            continue
        pr = "PM" if u.id == proj.pm_id else (
            "PL" if u.position == "책임" else "Member"
        )
        db.add(models.ProjectMember(
            project_id=proj.id, user_id=u.id, project_role=pr, is_org_admin=False,
        ))
    db.flush()


def add_wbs_2025(db, proj, users):
    """완료 프로젝트: 3~4개 항목 모두 완료 처리."""
    n = random.randint(3, 4)
    titles = random.sample(WBS_TITLES, n)
    start = proj.start_date
    end = proj.end_date
    span = max((end - start).days, n)
    chunk = span // n

    for i, title in enumerate(titles, start=1):
        s = start + timedelta(days=chunk * (i - 1))
        e = end if i == n else start + timedelta(days=chunk * i)
        owner = random.choice(users)
        w = models.WBSItem(
            project_id=proj.id, parent_id=None, level=1,
            wbs_number=str(i), title=title,
            assignee_id=owner.id, status="완료",
            plan_start_date=s, plan_end_date=e,
            actual_start_date=s, actual_end_date=e,
            plan_progress=1.0, actual_progress=1.0,
            weight=1.0, deliverable=f"{title} 산출물",
        )
        db.add(w)
        db.flush()
        db.add(models.WBSAssignee(wbs_id=w.id, user_id=owner.id))


def add_wbs_2026(db, proj, users, stage):
    """진행 프로젝트: 5~8개, 레벨 1~2, 진척률 다양 + 일부 지연."""
    n_l1 = random.randint(3, 4)
    titles = random.sample(WBS_TITLES, min(n_l1, len(WBS_TITLES)))

    today = date.today()
    start = proj.start_date or today
    end = proj.end_date or (today + timedelta(days=180))
    span = max((end - start).days, n_l1)
    chunk = span // n_l1

    is_running = stage in RUNNING_STAGES
    is_proposal = stage in PROPOSAL_STAGES

    total_count = 0
    for i, title in enumerate(titles, start=1):
        s = start + timedelta(days=chunk * (i - 1))
        e = end if i == n_l1 else start + timedelta(days=chunk * i)
        owner = random.choice(users)

        if is_running:
            if i == 1:
                progress = round(random.uniform(0.6, 1.0), 2)
            elif i == 2:
                progress = round(random.uniform(0.3, 0.7), 2)
            else:
                progress = round(random.uniform(0.0, 0.4), 2)
            # 일부 지연 표현: 첫 작업의 plan_end가 과거인데 진척이 낮음
            if i == 1 and random.random() < 0.3:
                e = today - timedelta(days=random.randint(5, 30))
                progress = round(random.uniform(0.3, 0.7), 2)
        else:
            progress = 0.0

        if progress >= 1.0:
            status = "완료"
        elif progress > 0:
            status = "진행중"
        else:
            status = "대기"

        w = models.WBSItem(
            project_id=proj.id, parent_id=None, level=1,
            wbs_number=str(i), title=title,
            assignee_id=owner.id, status=status,
            plan_start_date=s, plan_end_date=e,
            actual_start_date=s if progress > 0 else None,
            actual_end_date=e if progress >= 1.0 else None,
            plan_progress=1.0, actual_progress=progress,
            weight=1.0, deliverable=f"{title} 산출물",
        )
        db.add(w)
        db.flush()
        db.add(models.WBSAssignee(wbs_id=w.id, user_id=owner.id))
        total_count += 1

        # 레벨 2 (1~2개), 총 8개까지만
        n_l2 = random.randint(1, 2)
        for j in range(1, n_l2 + 1):
            if total_count >= 8:
                break
            sub_owner = random.choice(users)
            if is_proposal:
                sub_progress = 0.0
            else:
                sub_progress = max(0.0, progress - random.uniform(0.0, 0.3))
                sub_progress = round(sub_progress, 2)

            if sub_progress >= 1.0:
                sub_status = "완료"
            elif sub_progress > 0:
                sub_status = "진행중"
            else:
                sub_status = "대기"

            sub_span = (e - s).days
            sub_s = s + timedelta(days=sub_span * (j - 1) // max(n_l2, 1))
            sub_e = s + timedelta(days=sub_span * j // max(n_l2, 1))
            sub = models.WBSItem(
                project_id=proj.id, parent_id=w.id, level=2,
                wbs_number=f"{i}.{j}", title=f"{title} 상세 {j}",
                assignee_id=sub_owner.id, status=sub_status,
                plan_start_date=sub_s, plan_end_date=sub_e,
                actual_start_date=sub_s if sub_progress > 0 else None,
                actual_end_date=sub_e if sub_progress >= 1.0 else None,
                plan_progress=1.0, actual_progress=sub_progress,
                weight=1.0, deliverable="",
            )
            db.add(sub)
            db.flush()
            db.add(models.WBSAssignee(wbs_id=sub.id, user_id=sub_owner.id))
            total_count += 1


# ─────────────────────────────────────────── main ───────────────────────────

def seed():
    db = SessionLocal()
    try:
        orgs = find_target_orgs(db)
        if not orgs:
            print(f"[seed] '{ROOT_ORG_NAME}' 하위 본부를 찾지 못했어요. 조직을 먼저 등록하세요.")
            return

        print(f"[seed] '{ROOT_ORG_NAME}' 하위 {len(orgs)}개 본부 발견")
        for o in orgs:
            print(f"  - {o.name} (id={o.id})")

        # 1) 유저 100명
        org_users, new_users = seed_users(db, orgs)
        print(f"[seed] 유저 신규 생성: {new_users}명")

        # 본부별 PM 후보
        pm_pool = {}
        for org in orgs:
            pool = [u for u in org_users[org.id]
                    if u.position in ("본부장", "이사", "수석", "책임")]
            pm_pool[org.id] = pool or list(org_users[org.id])

        # 2) 2025 프로젝트 220개
        stages_2025 = [s for stage, qty in STAGE_DIST_2025 for s in [stage] * qty]
        random.shuffle(stages_2025)
        n_proj_2025 = 0
        for i, stage in enumerate(stages_2025, start=1):
            org = orgs[(i - 1) % len(orgs)]
            pm_user = random.choice(pm_pool[org.id])
            proj = make_project_2025(db, org, pm_user, i, stage)
            if proj:
                add_members(db, proj, org_users[org.id])
                add_wbs_2025(db, proj, org_users[org.id])
                n_proj_2025 += 1
            if i % 50 == 0:
                db.commit()
                print(f"  [2025] {i}/{len(stages_2025)}")
        db.commit()
        print(f"[seed] 2025 프로젝트 신규: {n_proj_2025}개")

        # 3) 2026 프로젝트 60개
        stages_2026 = [s for stage, qty in STAGE_DIST_2026 for s in [stage] * qty]
        random.shuffle(stages_2026)
        n_proj_2026 = 0
        for i, stage in enumerate(stages_2026, start=1):
            org = orgs[(i - 1) % len(orgs)]
            pm_user = random.choice(pm_pool[org.id])
            proj = make_project_2026(db, org, pm_user, i, stage)
            if proj:
                add_members(db, proj, org_users[org.id])
                add_wbs_2026(db, proj, org_users[org.id], stage)
                n_proj_2026 += 1
        db.commit()
        print(f"[seed] 2026 프로젝트 신규: {n_proj_2026}개")

        print("\n[seed] 완료")
        print(f"  본부: {len(orgs)}")
        print(f"  유저: +{new_users}  (기본 비밀번호: {DEFAULT_PASSWORD!r})")
        print(f"  2025 프로젝트: +{n_proj_2025}")
        print(f"  2026 프로젝트: +{n_proj_2026}")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
