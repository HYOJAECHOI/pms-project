"""rename_work_plans_column_종료_to_수행완료

Revision ID: 7d694789dc70
Revises: 553a46f9d83c
Create Date: 2026-04-24 11:00:08.661030

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7d694789dc70'
down_revision: Union[str, Sequence[str], None] = '553a46f9d83c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """work_plans.column 값 '종료' → '수행완료' 일괄 변경.
    (칸반 컬럼 리네이밍 — 스키마는 변경 없고 기존 행의 값만 업데이트.)
    """
    op.execute(sa.text(
        "UPDATE work_plans SET \"column\" = '수행완료' WHERE \"column\" = '종료'"
    ))


def downgrade() -> None:
    """Downgrade schema."""
    op.execute(sa.text(
        "UPDATE work_plans SET \"column\" = '종료' WHERE \"column\" = '수행완료'"
    ))
