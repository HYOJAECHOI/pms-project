"""add_org_leader_and_project_department

Revision ID: a7193203c614
Revises: 7d694789dc70
Create Date: 2026-04-24 13:34:50.810209

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a7193203c614'
down_revision: Union[str, Sequence[str], None] = '7d694789dc70'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """
    - organizations.leader_id (본부장 FK)
    - projects.department_id (소속 본부 FK)
    - 기존 position='본부장' 유저로 각 본부의 leader_id 자동 backfill.
    """
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    # SQLite는 기존 테이블에 FK 제약이 붙은 컬럼을 ALTER ADD로 추가할 수 없음.
    # batch_alter_table 우회도 projects 테이블 recreate 시점에 조직의 project_id FK와
    # 충돌(IntegrityError)이 발생하므로, DDL에서는 plain Integer만 추가하고
    # FK는 SQLAlchemy 모델 레벨에서만 선언 (애플리케이션 조인에는 지장 없음).
    org_cols = {c['name'] for c in inspector.get_columns('organizations')}
    if 'leader_id' not in org_cols:
        op.add_column(
            'organizations',
            sa.Column('leader_id', sa.Integer(), nullable=True),
        )

    proj_cols = {c['name'] for c in inspector.get_columns('projects')}
    if 'department_id' not in proj_cols:
        op.add_column(
            'projects',
            sa.Column('department_id', sa.Integer(), nullable=True),
        )

    # 본부장 backfill: parent_id가 있는(=최상위 회사가 아닌) 조직에 대해
    # 해당 조직 소속 유저 중 position='본부장' 1명을 leader_id로 세팅.
    # 참고: 이 backfill의 대상을 '정식 본부'로만 좁히고 싶다면
    #       WHERE 절에 `AND project_id IS NULL`을 추가해 임시팀 조직을 제외하는 것이
    #       장기적으로 더 안전 (현재 데이터에는 임시팀이 없어 영향 없음).
    conn.execute(sa.text("""
        UPDATE organizations
        SET leader_id = (
            SELECT u.id FROM users u
            WHERE u.organization_id = organizations.id
              AND u.position = '본부장'
            LIMIT 1
        )
        WHERE parent_id IS NOT NULL
          AND leader_id IS NULL
    """))


def downgrade() -> None:
    """Downgrade schema. SQLite는 드롭컬럼에 batch_alter_table 필요."""
    with op.batch_alter_table('projects', schema=None) as batch_op:
        batch_op.drop_column('department_id')
    with op.batch_alter_table('organizations', schema=None) as batch_op:
        batch_op.drop_column('leader_id')
