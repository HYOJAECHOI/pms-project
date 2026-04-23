"""add_work_plans

Revision ID: c32a0e13ee11
Revises: 7d3d760e0a63
Create Date: 2026-04-24 08:34:56.048440

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c32a0e13ee11'
down_revision: Union[str, Sequence[str], None] = '7d3d760e0a63'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """work_plans 테이블 생성. create_all로 먼저 생성됐을 수 있어 has_table 체크."""
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    if not inspector.has_table('work_plans'):
        op.create_table(
            'work_plans',
            sa.Column('id', sa.Integer(), primary_key=True, index=True),
            sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
            sa.Column('wbs_id', sa.Integer(), sa.ForeignKey('wbs_items.id'), nullable=False),
            sa.Column('plan_date', sa.Date(), nullable=False),
            sa.Column('status', sa.String(), server_default='planned'),
            sa.Column('memo', sa.String(), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=True),
        )

    # 조회 경로(사용자+날짜) 인덱스. SQLite IF NOT EXISTS로 멱등.
    conn.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_work_plans_user_date ON work_plans(user_id, plan_date)"
    ))
    conn.execute(sa.text(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_work_plans_user_wbs_date "
        "ON work_plans(user_id, wbs_id, plan_date)"
    ))


def downgrade() -> None:
    """Downgrade schema."""
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    conn.execute(sa.text("DROP INDEX IF EXISTS uq_work_plans_user_wbs_date"))
    conn.execute(sa.text("DROP INDEX IF EXISTS ix_work_plans_user_date"))
    if inspector.has_table('work_plans'):
        op.drop_table('work_plans')
