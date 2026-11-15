"""appearance settings per person: theme (light, dark, system) and text size

Revision ID: a7b8c9d0e1f2
Revises: f6a7b8c9d0e1
Create Date: 2026-11-15 18:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "a7b8c9d0e1f2"
down_revision: Union[str, None] = "f6a7b8c9d0e1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("theme", sa.String(), nullable=False, server_default="system"))
    op.add_column("users", sa.Column("text_size", sa.String(), nullable=False, server_default="normal"))


def downgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.drop_column("text_size")
        batch.drop_column("theme")
