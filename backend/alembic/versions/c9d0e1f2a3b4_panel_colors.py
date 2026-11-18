"""panel colors per person: how the documents and texts panels are told apart

Revision ID: c9d0e1f2a3b4
Revises: b8c9d0e1f2a3
Create Date: 2026-11-18 12:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "c9d0e1f2a3b4"
down_revision: Union[str, None] = "b8c9d0e1f2a3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("panel_colors", sa.String(), nullable=False, server_default="distinct"))


def downgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.drop_column("panel_colors")
