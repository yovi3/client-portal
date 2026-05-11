"""add invites table and seed invite permission

Revision ID: e8f1a2b3c4d5
Revises: b1e6d9b7f442
Create Date: 2026-03-10 11:20:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = "e8f1a2b3c4d5"
down_revision: Union[str, None] = "b1e6d9b7f442"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    tables = inspector.get_table_names()

    if "invites" not in tables:
        op.create_table(
            "invites",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("invited_email", sa.String(), nullable=False),
            sa.Column("role", sa.String(), nullable=False, server_default="client"),
            sa.Column("token_hash", sa.String(), nullable=False),
            sa.Column("invited_by_user_id", sa.Integer(), nullable=False),
            sa.Column("expires_at", sa.DateTime(), nullable=False),
            sa.Column("used_at", sa.DateTime(), nullable=True),
            sa.Column("accepted_user_id", sa.Integer(), nullable=True),
            sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
            sa.Column("prefill_first_name", sa.String(), nullable=True),
            sa.Column("prefill_last_name", sa.String(), nullable=True),
            sa.Column("prefill_phone", sa.String(), nullable=True),
            sa.Column("prefill_address", sa.String(), nullable=True),
            sa.ForeignKeyConstraint(["accepted_user_id"], ["users.id"]),
            sa.ForeignKeyConstraint(["invited_by_user_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_invites_id", "invites", ["id"], unique=False)
        op.create_index("ix_invites_invited_email", "invites", ["invited_email"], unique=False)
        op.create_index("ix_invites_token_hash", "invites", ["token_hash"], unique=True)
        op.create_index("ix_invites_invited_by_user_id", "invites", ["invited_by_user_id"], unique=False)
        op.create_index("ix_invites_expires_at", "invites", ["expires_at"], unique=False)
        op.create_index("ix_invites_used_at", "invites", ["used_at"], unique=False)
        op.create_index("ix_invites_accepted_user_id", "invites", ["accepted_user_id"], unique=False)
        op.create_index("ix_invites_created_at", "invites", ["created_at"], unique=False)

    if "role_permissions" in tables:
        op.execute(
            """
            INSERT INTO role_permissions (role, permission)
            SELECT 'admin', 'invites:manage'
            WHERE NOT EXISTS (
                SELECT 1 FROM role_permissions
                WHERE role = 'admin' AND permission = 'invites:manage'
            )
            """
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    tables = inspector.get_table_names()

    if "role_permissions" in tables:
        op.execute(
            "DELETE FROM role_permissions WHERE role = 'admin' AND permission = 'invites:manage'"
        )

    if "invites" in tables:
        op.drop_index("ix_invites_created_at", table_name="invites")
        op.drop_index("ix_invites_accepted_user_id", table_name="invites")
        op.drop_index("ix_invites_used_at", table_name="invites")
        op.drop_index("ix_invites_expires_at", table_name="invites")
        op.drop_index("ix_invites_invited_by_user_id", table_name="invites")
        op.drop_index("ix_invites_token_hash", table_name="invites")
        op.drop_index("ix_invites_invited_email", table_name="invites")
        op.drop_index("ix_invites_id", table_name="invites")
        op.drop_table("invites")
