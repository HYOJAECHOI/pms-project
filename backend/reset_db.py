from database import SessionLocal
import models

TEST_EMAILS = ['admin@pms.com', 'manager@pms.com', 'pm@pms.com', 'user@pms.com']


def main():
    db = SessionLocal()
    try:
        # ── FK 의존 순서로 자식 테이블부터 삭제 ──
        steps = [
            (1, 'activity_logs',              models.ActivityLog),
            (2, 'wbs_instruction_receipts',   models.WBSInstructionReceipt),
            (3, 'wbs_instructions',           models.WBSInstruction),
            (4, 'wbs_comments',               models.WBSComment),
            (5, 'wbs_files',                  models.WBSFile),
            (6, 'wbs_assignees',              models.WBSAssignee),
            (7, 'wbs_items',                  models.WBSItem),
            (8, 'project_members',            models.ProjectMember),
            (9, 'project_comments',           models.ProjectComment),
            (10, 'project_files',             models.ProjectFile),
        ]
        for step_no, name, model in steps:
            n = db.query(model).delete(synchronize_session=False)
            print(f"[{step_no}] {name} 삭제: {n}건")

        # organizations.project_id는 projects를 참조하는 FK → projects 삭제 전 정리
        db.query(models.Organization).update(
            {models.Organization.project_id: None}, synchronize_session=False
        )

        # 11. projects
        n = db.query(models.Project).delete(synchronize_session=False)
        print(f"[11] projects 삭제: {n}건")

        # 12. users (테스트 4개 제외)
        n = (
            db.query(models.User)
            .filter(~models.User.email.in_(TEST_EMAILS))
            .delete(synchronize_session=False)
        )
        print(f"[12] users 삭제 (테스트 4개 제외): {n}건")

        # 테스트 유저의 organization_id dangling FK 정리 → organizations 삭제 전
        db.query(models.User).update(
            {models.User.organization_id: None}, synchronize_session=False
        )

        # 13. organizations
        n = db.query(models.Organization).delete(synchronize_session=False)
        print(f"[13] organizations 삭제: {n}건")

        db.commit()

        # ── 결과 확인 ──
        user_count = db.query(models.User).count()
        org_count = db.query(models.Organization).count()
        proj_count = db.query(models.Project).count()
        print("\n[AFTER] 남은 데이터")
        print(f"  - 유저:     {user_count}")
        print(f"  - 조직:     {org_count}")
        print(f"  - 프로젝트: {proj_count}")
        print("\n남은 계정:")
        for u in db.query(models.User).order_by(models.User.email).all():
            print(f"  - {u.email} ({u.role})")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
