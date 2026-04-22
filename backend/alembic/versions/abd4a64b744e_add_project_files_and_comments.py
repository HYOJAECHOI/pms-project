"""add project files and comments

Revision ID: abd4a64b744e
Revises: c14ad7746953
Create Date: 2026-04-21 12:40:40.508093

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'abd4a64b744e'
down_revision: Union[str, Sequence[str], None] = 'c14ad7746953'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_table(name: str) -> bool:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    return insp.has_table(name)


def upgrade() -> None:
    """Upgrade schema."""
    # uvicorn --reload 환경에서 create_all이 먼저 테이블을 만든 경우를 대비해 멱등 처리
    if not _has_table("project_files"):
        op.create_table(
            "project_files",
            sa.Column("id", sa.Integer(), primary_key=True, index=True),
            sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id"), nullable=False),
            sa.Column("filename", sa.String(), nullable=False),
            sa.Column("filepath", sa.String(), nullable=False),
            sa.Column("filesize", sa.BigInteger(), nullable=True),
            sa.Column("uploaded_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
        )

    if not _has_table("project_comments"):
        op.create_table(
            "project_comments",
            sa.Column("id", sa.Integer(), primary_key=True, index=True),
            sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id"), nullable=False),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("content", sa.String(), nullable=False),
            sa.Column("comment_type", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
        )


def downgrade() -> None:
    """Downgrade schema."""
    if _has_table("project_comments"):
        op.drop_table("project_comments")
    if _has_table("project_files"):
        op.drop_table("project_files")
