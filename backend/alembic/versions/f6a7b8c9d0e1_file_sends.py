"""documents sent to a phone number: request direction and per-file events

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-11-15 15:00:00.000000

Task 1.10. A document link can now go the other way: the firm sends files and the
person downloads them. Events can point at the file they are about, so staff see
each file's downloads.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "f6a7b8c9d0e1"
down_revision: Union[str, None] = "e5f6a7b8c9d0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("file_requests", sa.Column("direction", sa.String(), nullable=False, server_default="request"))
    with op.batch_alter_table("file_request_events") as batch:
        batch.add_column(sa.Column("file_id", sa.Integer(), nullable=True))
        batch.create_foreign_key("fk_file_request_events_file_id", "request_files", ["file_id"], ["id"])


def downgrade() -> None:
    bind = op.get_bind()
    # Sent-document links have no place in the old shape.
    for (req_id,) in bind.execute(sa.text("SELECT id FROM file_requests WHERE direction = 'send'")).fetchall():
        for table in ("file_request_events", "request_files", "file_request_items"):
            bind.execute(sa.text(f"DELETE FROM {table} WHERE request_id = :id"), {"id": req_id})
        bind.execute(sa.text("DELETE FROM file_requests WHERE id = :id"), {"id": req_id})
    with op.batch_alter_table("file_request_events") as batch:
        batch.drop_constraint("fk_file_request_events_file_id", type_="foreignkey")
        batch.drop_column("file_id")
    with op.batch_alter_table("file_requests") as batch:
        batch.drop_column("direction")
