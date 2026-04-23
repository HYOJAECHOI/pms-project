"""drop work_reports

Revision ID: 7d3d760e0a63
Revises: 5874c0005af7
Create Date: 2026-04-23 16:03:37.600894

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7d3d760e0a63'
down_revision: Union[str, Sequence[str], None] = '5874c0005af7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """work_reports 테이블과 인덱스 제거. 프론트/백엔드에서 보고 기능 전체 제거됨."""
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    if inspector.has_table('work_reports'):
        with op.batch_alter_table('work_reports', schema=None) as batch_op:
            # initial.py에서 만든 인덱스: ix_work_reports_id
            existing_indexes = {ix['name'] for ix in inspector.get_indexes('work_reports')}
            if 'ix_work_reports_id' in existing_indexes:
                batch_op.drop_index(batch_op.f('ix_work_reports_id'))
        op.drop_table('work_reports')


def downgrade() -> None:
    """복구 불필요 — WorkReport 기능 전체 폐기."""
    pass
