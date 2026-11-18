"""SMS History links: LawBase login per person, and each text's row in LeadBase's SMS History

Revision ID: d0e1f2a3b4c5
Revises: c9d0e1f2a3b4
Create Date: 2026-11-18 13:00:00.000000

Plan tasks 2.6 and 2.9.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "d0e1f2a3b4c5"
down_revision: Union[str, None] = "c9d0e1f2a3b4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("lawbase_login", sa.String(), nullable=True))
    op.add_column("messages", sa.Column("lb_sms_serial", sa.Integer(), nullable=True))
    op.add_column("messages", sa.Column("lb_sms_status", sa.String(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("messages") as batch:
        batch.drop_column("lb_sms_status")
        batch.drop_column("lb_sms_serial")
    with op.batch_alter_table("users") as batch:
        batch.drop_column("lawbase_login")
