"""add azure identity fields and document request note

Revision ID: 9f3c2c8d4a11
Revises: 2902fa2705cd
Create Date: 2026-03-02 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = "9f3c2c8d4a11"
down_revision: Union[str, None] = "2902fa2705cd"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    user_columns = [col["name"] for col in inspector.get_columns("users")]
    with op.batch_alter_table("users", schema=None) as batch_op:
        if "aad_object_id" not in user_columns:
            batch_op.add_column(sa.Column("aad_object_id", sa.String(), nullable=True))
            batch_op.create_index("ix_users_aad_object_id", ["aad_object_id"], unique=True)
        if "auth_provider" not in user_columns:
            batch_op.add_column(sa.Column("auth_provider", sa.String(), nullable=True))
        if "last_azure_group_ids" not in user_columns:
            batch_op.add_column(sa.Column("last_azure_group_ids", sa.String(), nullable=True))
        if "last_azure_sync_at" not in user_columns:
            batch_op.add_column(sa.Column("last_azure_sync_at", sa.DateTime(), nullable=True))
        if "effective_role_source" not in user_columns:
            batch_op.add_column(sa.Column("effective_role_source", sa.String(), nullable=True))

    op.execute("UPDATE users SET auth_provider = 'local' WHERE auth_provider IS NULL")
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.alter_column("auth_provider", existing_type=sa.String(), nullable=False)

    doc_columns = [col["name"] for col in inspector.get_columns("document_requests")]
    with op.batch_alter_table("document_requests", schema=None) as batch_op:
        if "note" not in doc_columns:
            batch_op.add_column(sa.Column("note", sa.String(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    user_columns = [col["name"] for col in inspector.get_columns("users")]
    doc_columns = [col["name"] for col in inspector.get_columns("document_requests")]

    with op.batch_alter_table("document_requests", schema=None) as batch_op:
        if "note" in doc_columns:
            batch_op.drop_column("note")

    with op.batch_alter_table("users", schema=None) as batch_op:
        if "effective_role_source" in user_columns:
            batch_op.drop_column("effective_role_source")
        if "last_azure_sync_at" in user_columns:
            batch_op.drop_column("last_azure_sync_at")
        if "last_azure_group_ids" in user_columns:
            batch_op.drop_column("last_azure_group_ids")
        if "auth_provider" in user_columns:
            batch_op.drop_column("auth_provider")
        if "aad_object_id" in user_columns:
            batch_op.drop_index("ix_users_aad_object_id")
            batch_op.drop_column("aad_object_id")
