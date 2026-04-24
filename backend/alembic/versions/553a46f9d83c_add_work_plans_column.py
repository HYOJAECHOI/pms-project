"""add_work_plans_column

Revision ID: 553a46f9d83c
Revises: c32a0e13ee11
Create Date: 2026-04-24 09:13:03.208608

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '553a46f9d83c'
down_revision: Union[str, Sequence[str], None] = 'c32a0e13ee11'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """work_plans.column 추가. 할일/수행예정/종료/완료보고 분류용. 기본값 '할일'."""
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing = {c['name'] for c in inspector.get_columns('work_plans')}
    if 'column' not in existing:
        # 기존 행도 '할일'로 채우기 위해 server_default 지정
        op.add_column(
            'work_plans',
            sa.Column('column', sa.String(), nullable=True, server_default='할일'),
        )


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('work_plans', schema=None) as batch_op:
        batch_op.drop_column('column')
