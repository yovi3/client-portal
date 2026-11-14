"""sms delivery status on messages, sms opt-out on client profiles

Revision ID: b7c8d9e0f1a2
Revises: a1b2c3d4e5f6
Create Date: 2026-11-14 12:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "b7c8d9e0f1a2"
down_revision: Union[str, None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("messages", sa.Column("sms_status", sa.String(), nullable=True))
    op.add_column("messages", sa.Column("sms_sid", sa.String(), nullable=True))
    op.add_column("messages", sa.Column("sms_error", sa.String(), nullable=True))
    op.create_index("ix_messages_sms_sid", "messages", ["sms_sid"], unique=True)
    op.add_column(
        "client_profiles",
        sa.Column("sms_opted_out", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column("client_profiles", sa.Column("sms_opted_out_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("client_profiles") as batch:
        batch.drop_column("sms_opted_out_at")
        batch.drop_column("sms_opted_out")
    op.drop_index("ix_messages_sms_sid", table_name="messages")
    with op.batch_alter_table("messages") as batch:
        batch.drop_column("sms_error")
        batch.drop_column("sms_sid")
        batch.drop_column("sms_status")
