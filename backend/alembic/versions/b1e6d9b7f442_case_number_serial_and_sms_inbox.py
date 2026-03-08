"""case number/serial and sms inbox assignment audit

Revision ID: b1e6d9b7f442
Revises: 9f3c2c8d4a11
Create Date: 2026-03-07 13:10:00.000000
"""

from typing import Sequence, Union
import random
import string

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = "b1e6d9b7f442"
down_revision: Union[str, None] = "9f3c2c8d4a11"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _generate_serial(existing: set[str], length: int = 8) -> str:
    alphabet = string.ascii_uppercase + string.digits
    while True:
        serial = "".join(random.choice(alphabet) for _ in range(length))
        if serial not in existing:
            return serial


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    case_columns = [col["name"] for col in inspector.get_columns("cases")]
    with op.batch_alter_table("cases", schema=None) as batch_op:
        if "case_number" not in case_columns:
            batch_op.add_column(sa.Column("case_number", sa.Integer(), nullable=True))
        if "case_serial" not in case_columns:
            batch_op.add_column(sa.Column("case_serial", sa.String(length=8), nullable=True))

    existing_serials = {
        row[0]
        for row in bind.execute(sa.text("SELECT case_serial FROM cases WHERE case_serial IS NOT NULL")).fetchall()
        if row[0]
    }
    case_rows = bind.execute(sa.text("SELECT id, case_number, case_serial FROM cases")).fetchall()
    for case_id, case_number, case_serial in case_rows:
        next_number = case_number if case_number is not None else case_id
        next_serial = case_serial
        if not next_serial:
            next_serial = _generate_serial(existing_serials)
            existing_serials.add(next_serial)
        bind.execute(
            sa.text(
                "UPDATE cases SET case_number = :case_number, case_serial = :case_serial WHERE id = :case_id"
            ),
            {
                "case_number": next_number,
                "case_serial": next_serial,
                "case_id": case_id,
            },
        )

    with op.batch_alter_table("cases", schema=None) as batch_op:
        batch_op.alter_column("case_number", existing_type=sa.Integer(), nullable=False)
        batch_op.alter_column("case_serial", existing_type=sa.String(length=8), nullable=False)
        index_names = {index["name"] for index in inspector.get_indexes("cases")}
        if "ix_cases_case_number" not in index_names:
            batch_op.create_index("ix_cases_case_number", ["case_number"], unique=True)
        if "ix_cases_case_serial" not in index_names:
            batch_op.create_index("ix_cases_case_serial", ["case_serial"], unique=True)

    assoc_columns = [col["name"] for col in inspector.get_columns("case_client_association")]
    with op.batch_alter_table("case_client_association", schema=None) as batch_op:
        if "role_type" not in assoc_columns:
            batch_op.add_column(sa.Column("role_type", sa.String(), nullable=True, server_default="client"))
    bind.execute(sa.text("UPDATE case_client_association SET role_type = 'client' WHERE role_type IS NULL"))
    with op.batch_alter_table("case_client_association", schema=None) as batch_op:
        if "role_type" not in assoc_columns:
            batch_op.alter_column("role_type", existing_type=sa.String(), nullable=False, server_default="client")

    sms_columns = [col["name"] for col in inspector.get_columns("awaiting_sms")]
    with op.batch_alter_table("awaiting_sms", schema=None) as batch_op:
        if "assigned_case_id" not in sms_columns:
            batch_op.add_column(sa.Column("assigned_case_id", sa.Integer(), nullable=True))
            batch_op.create_foreign_key(
                "fk_awaiting_sms_assigned_case_id_cases",
                "cases",
                ["assigned_case_id"],
                ["id"],
            )
        if "assigned_by_user_id" not in sms_columns:
            batch_op.add_column(sa.Column("assigned_by_user_id", sa.Integer(), nullable=True))
            batch_op.create_foreign_key(
                "fk_awaiting_sms_assigned_by_user_id_users",
                "users",
                ["assigned_by_user_id"],
                ["id"],
            )
        if "assigned_at" not in sms_columns:
            batch_op.add_column(sa.Column("assigned_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    sms_columns = [col["name"] for col in inspector.get_columns("awaiting_sms")]
    with op.batch_alter_table("awaiting_sms", schema=None) as batch_op:
        if "assigned_at" in sms_columns:
            batch_op.drop_column("assigned_at")
        if "assigned_by_user_id" in sms_columns:
            batch_op.drop_constraint("fk_awaiting_sms_assigned_by_user_id_users", type_="foreignkey")
            batch_op.drop_column("assigned_by_user_id")
        if "assigned_case_id" in sms_columns:
            batch_op.drop_constraint("fk_awaiting_sms_assigned_case_id_cases", type_="foreignkey")
            batch_op.drop_column("assigned_case_id")

    assoc_columns = [col["name"] for col in inspector.get_columns("case_client_association")]
    with op.batch_alter_table("case_client_association", schema=None) as batch_op:
        if "role_type" in assoc_columns:
            batch_op.drop_column("role_type")

    case_columns = [col["name"] for col in inspector.get_columns("cases")]
    index_names = {index["name"] for index in inspector.get_indexes("cases")}
    with op.batch_alter_table("cases", schema=None) as batch_op:
        if "ix_cases_case_serial" in index_names:
            batch_op.drop_index("ix_cases_case_serial")
        if "ix_cases_case_number" in index_names:
            batch_op.drop_index("ix_cases_case_number")
        if "case_serial" in case_columns:
            batch_op.drop_column("case_serial")
        if "case_number" in case_columns:
            batch_op.drop_column("case_number")
