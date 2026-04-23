"""add wbs collaboration tables

Revision ID: 5874c0005af7
Revises: 0d3e6256044e
Create Date: 2026-04-23 12:45:37.905132

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '5874c0005af7'
down_revision: Union[str, Sequence[str], None] = '0d3e6256044e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema. create_all로 이미 테이블이 있을 수 있어 has_table 체크."""
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    if not inspector.has_table('wbs_comments'):
        op.create_table(
            'wbs_comments',
            sa.Column('id', sa.Integer(), primary_key=True, index=True),
            sa.Column('project_id', sa.Integer(), sa.ForeignKey('projects.id'), nullable=False),
            sa.Column('wbs_id', sa.Integer(), sa.ForeignKey('wbs_items.id'), nullable=False),
            sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
            sa.Column('parent_comment_id', sa.Integer(), sa.ForeignKey('wbs_comments.id'), nullable=True),
            sa.Column('content', sa.Text(), nullable=False),
            sa.Column('comment_type', sa.String(), server_default='memo'),
            sa.Column('memo_category', sa.String(), nullable=True),
            sa.Column('visibility_scope', sa.String(), server_default='all'),
            sa.Column('created_at', sa.DateTime(), nullable=True),
            sa.Column('updated_at', sa.DateTime(), nullable=True),
        )

    if not inspector.has_table('wbs_instructions'):
        op.create_table(
            'wbs_instructions',
            sa.Column('id', sa.Integer(), primary_key=True, index=True),
            sa.Column('project_id', sa.Integer(), sa.ForeignKey('projects.id'), nullable=False),
            sa.Column('wbs_id', sa.Integer(), sa.ForeignKey('wbs_items.id'), nullable=False),
            sa.Column('author_user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
            sa.Column('title', sa.String(), nullable=False),
            sa.Column('content', sa.Text(), nullable=True),
            sa.Column('priority', sa.String(), server_default='normal'),
            sa.Column('created_at', sa.DateTime(), nullable=True),
            sa.Column('updated_at', sa.DateTime(), nullable=True),
        )

    if not inspector.has_table('wbs_instruction_receipts'):
        op.create_table(
            'wbs_instruction_receipts',
            sa.Column('id', sa.Integer(), primary_key=True, index=True),
            sa.Column(
                'instruction_id', sa.Integer(),
                sa.ForeignKey('wbs_instructions.id', ondelete='CASCADE'), nullable=False,
            ),
            sa.Column('target_user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
            sa.Column('status', sa.String(), server_default='open'),
            sa.Column('acknowledged_at', sa.DateTime(), nullable=True),
            sa.Column('completed_at', sa.DateTime(), nullable=True),
            sa.Column('completion_note', sa.Text(), nullable=True),
        )

    if not inspector.has_table('activity_logs'):
        op.create_table(
            'activity_logs',
            sa.Column('id', sa.Integer(), primary_key=True, index=True),
            sa.Column('project_id', sa.Integer(), sa.ForeignKey('projects.id'), nullable=False),
            sa.Column('wbs_id', sa.Integer(), sa.ForeignKey('wbs_items.id'), nullable=True),
            sa.Column('actor_user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
            sa.Column('action_type', sa.String(), nullable=False),
            sa.Column('before_json', sa.Text(), nullable=True),
            sa.Column('after_json', sa.Text(), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=True),
        )

    # 인덱스 (SQLite IF NOT EXISTS로 멱등)
    conn.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_activity_logs_wbs_id ON activity_logs(wbs_id)"
    ))
    conn.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_activity_logs_project_id ON activity_logs(project_id)"
    ))
    conn.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_activity_logs_created_at ON activity_logs(created_at)"
    ))


def downgrade() -> None:
    """Downgrade schema."""
    conn = op.get_bind()
    conn.execute(sa.text("DROP INDEX IF EXISTS ix_activity_logs_created_at"))
    conn.execute(sa.text("DROP INDEX IF EXISTS ix_activity_logs_project_id"))
    conn.execute(sa.text("DROP INDEX IF EXISTS ix_activity_logs_wbs_id"))
    op.drop_table('activity_logs')
    op.drop_table('wbs_instruction_receipts')
    op.drop_table('wbs_instructions')
    op.drop_table('wbs_comments')
