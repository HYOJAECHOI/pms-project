"""add wbs files

Revision ID: 0d3e6256044e
Revises: 4c41071b4bca
Create Date: 2026-04-22 15:20:30.412727

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0d3e6256044e'
down_revision: Union[str, Sequence[str], None] = '4c41071b4bca'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'wbs_files',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('wbs_id', sa.Integer(), sa.ForeignKey('wbs_items.id'), nullable=False),
        sa.Column('project_id', sa.Integer(), sa.ForeignKey('projects.id'), nullable=False),
        sa.Column('filename', sa.String(), nullable=False),
        sa.Column('filepath', sa.String(), nullable=False),
        sa.Column('filesize', sa.BigInteger(), nullable=True),
        sa.Column('uploaded_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    op.drop_table('wbs_files')
