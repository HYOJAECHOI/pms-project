"""rename pipeline stages (공고전검토→공고전, 수주실패→실주, 착수→수행중)

Revision ID: d4a7e9c21f50
Revises: abd4a64b744e
Create Date: 2026-04-21 13:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = 'd4a7e9c21f50'
down_revision: Union[str, Sequence[str], None] = 'abd4a64b744e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# 기존 → 신규 단계명 매핑
RENAME_MAP = [
    ('공고전검토', '공고전'),
    ('수주실패', '실주'),
    ('착수', '수행중'),
]


def upgrade() -> None:
    for old, new in RENAME_MAP:
        op.execute(
            f"UPDATE projects SET pipeline_stage = '{new}' "
            f"WHERE pipeline_stage = '{old}'"
        )


def downgrade() -> None:
    # 역방향은 의미 보존이 어렵지만 공고전/실주는 복원 가능 (착수는 수행중과 합쳐져서 복원 불가)
    for old, new in RENAME_MAP:
        if old == '착수':
            continue  # 수행중과 병합되어 원복 불가
        op.execute(
            f"UPDATE projects SET pipeline_stage = '{old}' "
            f"WHERE pipeline_stage = '{new}'"
        )
