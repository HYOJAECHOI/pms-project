"""remove_project_organization_id

Revision ID: 596bea7e84cb
Revises: a7193203c614
Create Date: 2026-04-24 14:59:22.784774

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '596bea7e84cb'
down_revision: Union[str, Sequence[str], None] = 'a7193203c614'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """projects.organization_id 컬럼 제거. 데이터는 department_id로 backfill 후 드롭.

    SQLite 3.35+는 ALTER TABLE DROP COLUMN을 네이티브로 지원 — 테이블 재생성이
    없어 기존 organizations.project_id → projects.id FK와도 충돌하지 않음.
    이 프로젝트 DB는 sqlite3 3.50.4이므로 batch_alter_table 우회 불필요.
    """
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    # Step 1: 데이터 백필 (필수) — 기존 organization_id를 department_id로 복사
    conn.execute(sa.text("""
        UPDATE projects
        SET department_id = organization_id
        WHERE department_id IS NULL AND organization_id IS NOT NULL
    """))

    # Step 2: organization_id 컬럼 제거.
    # 네이티브 DROP COLUMN은 FK 제약이 걸린 컬럼을 드롭하지 못하므로 batch 재생성이 필요.
    # batch_alter_table이 내부적으로 DROP/RENAME을 수행하는 동안 organizations.project_id
    # → projects.id FK와 충돌하지 않도록 이 마이그레이션 실행 구간에 한해 PRAGMA OFF.
    # PRAGMA는 SQLAlchemy 2.x의 암시적 트랜잭션에서 무시되므로 원시 DBAPI로 실행.
    # 완료 후 PRAGMA ON + foreign_key_check로 무결성 재검증.
    proj_cols = {c['name'] for c in inspector.get_columns('projects')}
    if 'organization_id' in proj_cols:
        is_sqlite = conn.dialect.name == 'sqlite'
        if is_sqlite:
            conn.connection.execute('PRAGMA foreign_keys=OFF')
        try:
            with op.batch_alter_table('projects', schema=None) as batch_op:
                batch_op.drop_column('organization_id')
        finally:
            if is_sqlite:
                conn.connection.execute('PRAGMA foreign_keys=ON')
                bad_rows = conn.execute(sa.text('PRAGMA foreign_key_check')).fetchall()
                if bad_rows:
                    raise RuntimeError(
                        f'FK 무결성 체크 실패 — rollback 필요: {bad_rows}'
                    )


def downgrade() -> None:
    """복구: 빈 organization_id 컬럼 재추가 후 department_id에서 복사.
    최초 스키마의 FK 제약은 복원하지 않음 (재생성하려면 batch_alter_table 필요).
    """
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    proj_cols = {c['name'] for c in inspector.get_columns('projects')}
    if 'organization_id' not in proj_cols:
        op.add_column(
            'projects',
            sa.Column('organization_id', sa.Integer(), nullable=True),
        )
        conn.execute(sa.text("""
            UPDATE projects
            SET organization_id = department_id
            WHERE organization_id IS NULL
        """))
