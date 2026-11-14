"""document requests to a phone number: secure links, files, and their tracking

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-11-15 12:00:00.000000

Tasks 1.7, 1.8, 1.9 and 1.12. New tables only; nothing existing changes.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "e5f6a7b8c9d0"
down_revision: Union[str, None] = "d4e5f6a7b8c9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "file_requests",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("token", sa.String(), nullable=False),
        sa.Column("conversation_id", sa.Integer(), sa.ForeignKey("conversations.id"), nullable=False),
        sa.Column("lead_id", sa.Integer(), sa.ForeignKey("leads.id"), nullable=True),
        sa.Column("case_id", sa.Integer(), sa.ForeignKey("cases.id"), nullable=True),
        sa.Column("message_id", sa.Integer(), sa.ForeignKey("messages.id"), nullable=True),
        sa.Column("note", sa.String(), nullable=True),
        sa.Column("created_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_file_requests_id", "file_requests", ["id"])
    op.create_index("ix_file_requests_token", "file_requests", ["token"], unique=True)
    op.create_index("ix_file_requests_conversation_id", "file_requests", ["conversation_id"])
    op.create_index("ix_file_requests_lead_id", "file_requests", ["lead_id"])
    op.create_index("ix_file_requests_case_id", "file_requests", ["case_id"])

    op.create_table(
        "file_request_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("request_id", sa.Integer(), sa.ForeignKey("file_requests.id"), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("received_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_file_request_items_id", "file_request_items", ["id"])
    op.create_index("ix_file_request_items_request_id", "file_request_items", ["request_id"])

    op.create_table(
        "request_files",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("request_id", sa.Integer(), sa.ForeignKey("file_requests.id"), nullable=False),
        sa.Column("item_id", sa.Integer(), sa.ForeignKey("file_request_items.id"), nullable=True),
        sa.Column("original_name", sa.String(), nullable=False),
        sa.Column("stored_path", sa.String(), nullable=False),
        sa.Column("content_type", sa.String(), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("sha256", sa.String(), nullable=False),
        sa.Column("uploaded_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_request_files_id", "request_files", ["id"])
    op.create_index("ix_request_files_request_id", "request_files", ["request_id"])
    op.create_index("ix_request_files_item_id", "request_files", ["item_id"])

    op.create_table(
        "file_request_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("request_id", sa.Integer(), sa.ForeignKey("file_requests.id"), nullable=False),
        sa.Column("kind", sa.String(), nullable=False),
        sa.Column("at", sa.DateTime(), nullable=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("detail", sa.String(), nullable=True),
    )
    op.create_index("ix_file_request_events_id", "file_request_events", ["id"])
    op.create_index("ix_file_request_events_request_id", "file_request_events", ["request_id"])
    op.create_index("ix_file_request_events_at", "file_request_events", ["at"])


def downgrade() -> None:
    op.drop_table("file_request_events")
    op.drop_table("request_files")
    op.drop_table("file_request_items")
    op.drop_table("file_requests")
