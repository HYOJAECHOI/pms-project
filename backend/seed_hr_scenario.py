#!/usr/bin/env python
"""
인력 운용 현황 테스트 시나리오용 시드 데이터.

- 본부별(컨설팅=org 2, 감리=org 3)로 다양한 직위 유저 추가
- 각 본부 소속 테스트 프로젝트 3개 (department_id 지정)
- 각 프로젝트에 3레벨 WBS 트리 + 최하단 leaf에 WBSAssignee 지정
- 일부 WBS는 동일 유저가 두 프로젝트에 동시 투입되도록 기간 겹침

멱등: email / project name 기준으로 이미 있으면 스킵.

실행: (backend 디렉토리에서) python seed_hr_scenario.py
"""
import sys
from datetime import date
from typing import Optional

import bcrypt
from database import SessionLocal
import models


PASSWORD = "1234"
CONSULTING_ORG_ID = 2
AUDIT_ORG_ID = 3


def _hash(pw: str) -> str:
    return bcrypt.hashpw(pw.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


# ========= 유저 스펙 =========
# (name, email, position)
# 컨설팅본부: 본부장은 기존 '테스트본부장'(id=123) 재사용
CONSULTING_USERS = [
    ("이수석",  "consulting.sr1@pms.com", "수석"),
    ("박수석",  "consulting.sr2@pms.com", "수석"),
    ("김책임",  "consulting.pl1@pms.com", "책임"),
    ("최책임",  "consulting.pl2@pms.com", "책임"),
    ("정책임",  "consulting.pl3@pms.com", "책임"),
    ("윤대리",  "consulting.m1@pms.com",  "대리"),
    ("장대리",  "consulting.m2@pms.com",  "대리"),
    ("강사원",  "consulting.j1@pms.com",  "사원"),
    ("조사원",  "consulting.j2@pms.com",  "사원"),
]

# 감리본부: 본부장 신규 생성
AUDIT_USERS = [
    ("감리본부장", "audit.head@pms.com", "본부장"),
    ("한수석",    "audit.sr1@pms.com",  "수석"),
    ("임수석",    "audit.sr2@pms.com",  "수석"),
    ("오책임",    "audit.pl1@pms.com",  "책임"),
    ("홍책임",    "audit.pl2@pms.com",  "책임"),
    ("서책임",    "audit.pl3@pms.com",  "책임"),
    ("권사원",    "audit.j1@pms.com",   "사원"),
    ("송사원",    "audit.j2@pms.com",   "사원"),
]

# position → project_role 매핑 (CLAUDE.md 축 구분과 별개로 기본값)
POSITION_TO_PROJECT_ROLE = {
    "본부장": "PM",
    "수석":   "PL",
    "책임":   "PL",
    "대리":   "Member",
    "사원":   "Member",
    "연구원": "Member",
}


def ensure_user(db, name: str, email: str, position: str, org_id: int) -> models.User:
    u = db.query(models.User).filter(models.User.email == email).first()
    if u:
        # 조직/직위만 최신으로 보정 (비번은 유지)
        changed = False
        if u.organization_id != org_id:
            u.organization_id = org_id; changed = True
        if u.position != position:
            u.position = position; changed = True
        if u.name != name:
            u.name = name; changed = True
        if changed:
            print(f"  [UPDATE] {email} ({position}, org={org_id})")
        return u
    u = models.User(
        name=name,
        email=email,
        password=_hash(PASSWORD),
        role="user",
        organization_id=org_id,
        position=position,
        project_role=POSITION_TO_PROJECT_ROLE.get(position, "Member"),
        is_org_admin=(position == "본부장"),
    )
    db.add(u)
    db.flush()
    print(f"  [CREATE] id={u.id} {name} ({position}, org={org_id})")
    return u


# ========= 프로젝트 스펙 =========
# ('execution', 'pre_rfp' 같은 영문 코드는 DB에 없으므로 한국어 canonical 값으로 매핑)
PROJECTS = [
    {
        "name": "A사 디지털 전환 컨설팅",
        "description": "A 주식회사의 DX 전환 컨설팅 (수행)",
        "status": "수행",
        "pipeline_stage": "수행중",       # ≈ execution
        "start_date": date(2026, 1, 1),
        "end_date":   date(2026, 6, 30),
        "department_id": CONSULTING_ORG_ID,
        "pm_email": "consulting.pl1@pms.com",  # 컨설팅 책임 1명
        "client": "A 주식회사",
    },
    {
        "name": "B청 차세대 시스템 감리",
        "description": "B청 공공 차세대 시스템 감리 (수행)",
        "status": "수행",
        "pipeline_stage": "수행중",
        "start_date": date(2026, 2, 1),
        "end_date":   date(2026, 12, 31),
        "department_id": AUDIT_ORG_ID,
        "pm_email": "audit.pl1@pms.com",  # 감리 책임 1명
        "client": "B청",
    },
    {
        "name": "C시 스마트시티 제안",
        "description": "C시 스마트시티 사업 제안 단계",
        "status": "제안",
        "pipeline_stage": "공고전",        # ≈ pre_rfp
        "start_date": date(2026, 3, 1),
        "end_date":   date(2026, 9, 30),
        "department_id": CONSULTING_ORG_ID,
        "pm_email": None,                  # 제안 단계, PM 미정
        "client": "C시",
    },
]


def ensure_project(db, spec) -> models.Project:
    p = db.query(models.Project).filter(models.Project.name == spec["name"]).first()
    pm_id = None
    if spec.get("pm_email"):
        pm = db.query(models.User).filter(models.User.email == spec["pm_email"]).first()
        pm_id = pm.id if pm else None
    if p:
        # 핵심 필드만 최신화
        p.status = spec["status"]
        p.pipeline_stage = spec["pipeline_stage"]
        p.start_date = spec["start_date"]
        p.end_date = spec["end_date"]
        p.department_id = spec["department_id"]
        p.pm_id = pm_id
        p.client = spec["client"]
        p.description = spec["description"]
        print(f"  [UPDATE] project id={p.id} {p.name}")
        return p
    p = models.Project(
        name=spec["name"],
        description=spec["description"],
        status=spec["status"],
        pipeline_stage=spec["pipeline_stage"],
        start_date=spec["start_date"],
        end_date=spec["end_date"],
        original_start_date=spec["start_date"],
        original_end_date=spec["end_date"],
        department_id=spec["department_id"],
        pm_id=pm_id,
        client=spec["client"],
    )
    db.add(p)
    db.flush()
    print(f"  [CREATE] project id={p.id} {p.name}")
    return p


# ========= WBS 스펙 =========
# 3레벨 트리. 최하단(leaf) 노드에만 assignee 지정.
# parent 구분은 children 키 유무로 판정. 'assignee_email'은 leaf에서만 사용.
#
# 중복 투입 테스트 — 수석1(consulting.sr1@pms.com)은 A와 C에 동시 (2026-04-01~04-15).
WBS_TREE_A = [
    {
        "title": "환경분석",
        "children": [
            {
                "title": "현황조사",
                "children": [
                    {
                        "title": "사용자 인터뷰",
                        "assignee_email": "consulting.sr1@pms.com",
                        "start": date(2026, 3, 1),  "end": date(2026, 3, 15),
                    },
                    {
                        "title": "문서 분석",
                        "assignee_email": "consulting.pl1@pms.com",
                        "start": date(2026, 3, 10), "end": date(2026, 3, 20),
                    },
                ],
            },
            {
                "title": "경쟁사 분석",
                "children": [
                    {
                        "title": "시장 조사",
                        "assignee_email": "consulting.sr2@pms.com",
                        "start": date(2026, 3, 15), "end": date(2026, 3, 25),
                    },
                ],
            },
        ],
    },
    {
        "title": "설계",
        "children": [
            {
                "title": "아키텍처 설계",
                "children": [
                    {
                        "title": "시스템 구조",
                        "assignee_email": "consulting.pl2@pms.com",
                        "start": date(2026, 4, 1),  "end": date(2026, 4, 15),
                    },
                    {
                        "title": "데이터 모델",
                        "assignee_email": "consulting.sr1@pms.com",  # 겹침(A+C)
                        "start": date(2026, 4, 1),  "end": date(2026, 4, 15),
                    },
                ],
            },
        ],
    },
]

WBS_TREE_B = [
    {
        "title": "감리 착수",
        "children": [
            {
                "title": "킥오프",
                "children": [
                    {
                        "title": "이해관계자 미팅",
                        "assignee_email": "audit.pl1@pms.com",
                        "start": date(2026, 2, 5),  "end": date(2026, 2, 15),
                    },
                ],
            },
            {
                "title": "감리계획서 작성",
                "children": [
                    {
                        "title": "요건/범위 정의",
                        "assignee_email": "audit.sr1@pms.com",
                        "start": date(2026, 2, 10), "end": date(2026, 2, 28),
                    },
                    {
                        "title": "점검 체크리스트",
                        "assignee_email": "audit.pl2@pms.com",
                        "start": date(2026, 2, 15), "end": date(2026, 3, 10),
                    },
                ],
            },
        ],
    },
    {
        "title": "분석/설계 감리",
        "children": [
            {
                "title": "요건정의 검토",
                "children": [
                    {
                        "title": "요구사항 추적",
                        "assignee_email": "audit.pl3@pms.com",
                        "start": date(2026, 4, 1),  "end": date(2026, 4, 30),
                    },
                    {
                        "title": "요건 리스크 평가",
                        "assignee_email": "audit.sr2@pms.com",
                        "start": date(2026, 4, 5),  "end": date(2026, 4, 25),
                    },
                ],
            },
        ],
    },
]

WBS_TREE_C = [
    {
        "title": "제안 준비",
        "children": [
            {
                "title": "사전 조사",
                "children": [
                    {
                        "title": "도시 현황 리서치",
                        "assignee_email": "consulting.sr1@pms.com",  # 겹침(A+C)
                        "start": date(2026, 4, 1),  "end": date(2026, 4, 15),
                    },
                    {
                        "title": "벤치마킹",
                        "assignee_email": "consulting.m1@pms.com",
                        "start": date(2026, 4, 5),  "end": date(2026, 4, 20),
                    },
                ],
            },
        ],
    },
    {
        "title": "제안서 작성",
        "children": [
            {
                "title": "기술 제안",
                "children": [
                    {
                        "title": "아키텍처 제안",
                        "assignee_email": "consulting.pl3@pms.com",
                        "start": date(2026, 5, 1),  "end": date(2026, 5, 20),
                    },
                    {
                        "title": "솔루션 구성",
                        "assignee_email": "consulting.m2@pms.com",
                        "start": date(2026, 5, 10), "end": date(2026, 5, 30),
                    },
                ],
            },
            {
                "title": "사업 제안",
                "children": [
                    {
                        "title": "수행조직/공정표",
                        "assignee_email": "consulting.j1@pms.com",
                        "start": date(2026, 5, 15), "end": date(2026, 6, 5),
                    },
                ],
            },
        ],
    },
]


def _email_to_id(db, email: Optional[str]) -> Optional[int]:
    if not email:
        return None
    u = db.query(models.User).filter(models.User.email == email).first()
    return u.id if u else None


def _wbs_key(project_id: int, wbs_number: str) -> str:
    return f"{project_id}:{wbs_number}"


def ensure_wbs_tree(db, project: models.Project, tree: list):
    """
    멱등 삽입: (project_id, wbs_number, title)이 동일하면 스킵.
    leaf 노드에 대해 WBSAssignee 1명 + WBSItem.assignee_id 동시 세팅.
    """
    def walk(nodes, parent_id, level, number_prefix):
        for i, node in enumerate(nodes, start=1):
            wbs_number = f"{number_prefix}{i}" if not number_prefix else f"{number_prefix}.{i}"
            existing = (
                db.query(models.WBSItem)
                .filter(
                    models.WBSItem.project_id == project.id,
                    models.WBSItem.wbs_number == wbs_number,
                )
                .first()
            )
            is_leaf = "children" not in node
            assignee_id = _email_to_id(db, node.get("assignee_email")) if is_leaf else None
            if existing:
                # 필드 업데이트 (assignee, 기간)
                existing.title = node["title"]
                existing.level = level
                existing.parent_id = parent_id
                if is_leaf:
                    existing.assignee_id = assignee_id
                    existing.plan_start_date = node.get("start")
                    existing.plan_end_date = node.get("end")
                wbs = existing
                print(f"    [UPDATE WBS] {wbs_number} {node['title']}")
            else:
                wbs = models.WBSItem(
                    project_id=project.id,
                    parent_id=parent_id,
                    level=level,
                    wbs_number=wbs_number,
                    title=node["title"],
                    assignee_id=assignee_id if is_leaf else None,
                    plan_start_date=node.get("start") if is_leaf else None,
                    plan_end_date=node.get("end") if is_leaf else None,
                    status="대기",
                )
                db.add(wbs)
                db.flush()
                print(f"    [CREATE WBS] id={wbs.id} {wbs_number} {node['title']}")

            # leaf면 WBSAssignee 1건 멱등 upsert
            if is_leaf and assignee_id:
                has_assignee = (
                    db.query(models.WBSAssignee)
                    .filter(
                        models.WBSAssignee.wbs_id == wbs.id,
                        models.WBSAssignee.user_id == assignee_id,
                    )
                    .first()
                )
                if not has_assignee:
                    db.add(models.WBSAssignee(wbs_id=wbs.id, user_id=assignee_id))
                    db.flush()

            # children 재귀
            if not is_leaf:
                walk(node["children"], wbs.id, level + 1, wbs_number)

    walk(tree, None, 1, "")


def ensure_project_members(db, project: models.Project, emails: list):
    """프로젝트에 유저들을 멤버로 멱등 등록 (PM은 PM, 그 외는 Member)."""
    for email in emails:
        uid = _email_to_id(db, email)
        if not uid:
            continue
        exists = (
            db.query(models.ProjectMember)
            .filter(
                models.ProjectMember.project_id == project.id,
                models.ProjectMember.user_id == uid,
            )
            .first()
        )
        if exists:
            continue
        role = "PM" if project.pm_id == uid else "Member"
        db.add(models.ProjectMember(
            project_id=project.id,
            user_id=uid,
            project_role=role,
        ))
    db.flush()


def collect_assignee_emails(tree: list) -> set:
    out = set()
    def walk(nodes):
        for n in nodes:
            if "children" in n:
                walk(n["children"])
            elif n.get("assignee_email"):
                out.add(n["assignee_email"])
    walk(tree)
    return out


def main():
    db = SessionLocal()
    try:
        print("=== 1) 컨설팅본부 유저 세팅 ===")
        for (name, email, position) in CONSULTING_USERS:
            ensure_user(db, name, email, position, CONSULTING_ORG_ID)
        print("=== 2) 감리본부 유저 세팅 ===")
        for (name, email, position) in AUDIT_USERS:
            ensure_user(db, name, email, position, AUDIT_ORG_ID)
        db.flush()

        # 감리본부장을 organizations.leader_id로도 세팅 (있으면)
        audit_head = db.query(models.User).filter(
            models.User.email == "audit.head@pms.com"
        ).first()
        if audit_head:
            audit_org = db.query(models.Organization).filter(
                models.Organization.id == AUDIT_ORG_ID
            ).first()
            if audit_org and audit_org.leader_id != audit_head.id:
                audit_org.leader_id = audit_head.id
                print(f"  [SET LEADER] org {AUDIT_ORG_ID} → leader={audit_head.id}")

        print("=== 3) 프로젝트 세팅 ===")
        projects = []
        for spec in PROJECTS:
            p = ensure_project(db, spec)
            projects.append((p, spec))
        db.flush()

        print("=== 4) WBS 트리 세팅 ===")
        trees = {
            "A사 디지털 전환 컨설팅": WBS_TREE_A,
            "B청 차세대 시스템 감리":   WBS_TREE_B,
            "C시 스마트시티 제안":      WBS_TREE_C,
        }
        for (p, spec) in projects:
            tree = trees.get(p.name)
            if not tree:
                continue
            print(f"  - {p.name}")
            ensure_wbs_tree(db, p, tree)
            # 멤버 멱등 등록 (leaf assignee + PM)
            emails = collect_assignee_emails(tree)
            if spec.get("pm_email"):
                emails.add(spec["pm_email"])
            ensure_project_members(db, p, sorted(emails))

        db.commit()
        print("=== DONE ===")

        # 요약
        total_users = db.query(models.User).count()
        print(f"\n--- 요약 ---")
        print(f"  total users: {total_users}")
        for (p, _spec) in projects:
            wbs_count = db.query(models.WBSItem).filter(
                models.WBSItem.project_id == p.id
            ).count()
            assn_count = (
                db.query(models.WBSAssignee)
                .join(models.WBSItem, models.WBSAssignee.wbs_id == models.WBSItem.id)
                .filter(models.WBSItem.project_id == p.id)
                .count()
            )
            print(f"  project '{p.name}' (id={p.id}, dept={p.department_id}): WBS={wbs_count}, assignees={assn_count}")
    except Exception as e:
        db.rollback()
        print(f"ERROR: {e}", file=sys.stderr)
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
