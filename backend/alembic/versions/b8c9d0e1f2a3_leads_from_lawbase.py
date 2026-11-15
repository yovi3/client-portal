"""leads from LawBase: Serial, source, type, LeadBase statuses, security level, assigned person

Revision ID: b8c9d0e1f2a3
Revises: a7b8c9d0e1f2
Create Date: 2026-11-16 09:00:00.000000

Plan task 2.5. Leads typed in by hand keep source "manual"; the robo bridge fills the rest.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "b8c9d0e1f2a3"
down_revision: Union[str, None] = "a7b8c9d0e1f2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_COLUMNS = [
    ("source", sa.String(), dict(nullable=False, server_default="manual")),
    ("lead_type", sa.String(), {}),
    ("lb_status", sa.String(), {}),
    ("lb_current_status", sa.String(), {}),
    ("security_level", sa.Integer(), {}),
    ("assigned_login", sa.String(), {}),
    ("assigned_name", sa.String(), {}),
    ("email", sa.String(), {}),
    ("language", sa.String(), {}),
    ("synced_at", sa.DateTime(), {}),
]


def upgrade() -> None:
    op.add_column("leads", sa.Column("lawbase_serial", sa.Integer(), nullable=True))
    op.create_index("ix_leads_lawbase_serial", "leads", ["lawbase_serial"], unique=True)
    for name, type_, kw in _COLUMNS:
        op.add_column("leads", sa.Column(name, type_, nullable=kw.get("nullable", True),
                                         server_default=kw.get("server_default")))


def downgrade() -> None:
    op.drop_index("ix_leads_lawbase_serial", table_name="leads")
    with op.batch_alter_table("leads") as batch:
        for name, _, _ in reversed(_COLUMNS):
            batch.drop_column(name)
        batch.drop_column("lawbase_serial")
