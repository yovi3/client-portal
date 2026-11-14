"""conversations keyed by phone number, leads, and message links

Revision ID: c3d4e5f6a7b8
Revises: b7c8d9e0f1a2
Create Date: 2026-11-14 18:00:00.000000

Adds the leads and conversations tables, lets a message belong to a conversation
and a lead, and makes a message's case and sender optional (a text from a lead has
neither). Existing case messages are attached to a conversation for the client's
phone number, so nothing already in the database is orphaned.
"""
import re
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "c3d4e5f6a7b8"
down_revision: Union[str, None] = "b7c8d9e0f1a2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _e164(raw):
    # Same rule as app/phone.py, copied so this migration never changes meaning
    # if that file changes later.
    if not raw:
        return None
    text = str(raw).strip()
    digits = re.sub(r"\D", "", text)
    if text.startswith("+"):
        return f"+{digits}" if 8 <= len(digits) <= 15 else None
    if len(digits) == 10:
        return f"+1{digits}"
    if len(digits) == 11 and digits.startswith("1"):
        return f"+{digits}"
    return None


def upgrade() -> None:
    op.create_table(
        "leads",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("lead_number", sa.String(), nullable=False),
        sa.Column("first_name", sa.String(), nullable=True),
        sa.Column("last_name", sa.String(), nullable=True),
        sa.Column("phone", sa.String(), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="open"),
        sa.Column("assigned_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_leads_id", "leads", ["id"])
    op.create_index("ix_leads_lead_number", "leads", ["lead_number"], unique=True)
    op.create_index("ix_leads_phone", "leads", ["phone"])

    op.create_table(
        "conversations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("phone", sa.String(), nullable=False),
        sa.Column("contact_name", sa.String(), nullable=True),
        sa.Column("lead_id", sa.Integer(), sa.ForeignKey("leads.id"), nullable=True),
        sa.Column("case_id", sa.Integer(), sa.ForeignKey("cases.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("last_message_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_conversations_id", "conversations", ["id"])
    op.create_index("ix_conversations_phone", "conversations", ["phone"], unique=True)
    op.create_index("ix_conversations_lead_id", "conversations", ["lead_id"])
    op.create_index("ix_conversations_case_id", "conversations", ["case_id"])
    op.create_index("ix_conversations_last_message_at", "conversations", ["last_message_at"])

    # batch mode rebuilds the table on SQLite (it can't alter columns in place);
    # on PostgreSQL it runs ordinary ALTER statements.
    with op.batch_alter_table("messages") as batch:
        batch.add_column(sa.Column("conversation_id", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("lead_id", sa.Integer(), nullable=True))
        batch.alter_column("case_id", existing_type=sa.Integer(), nullable=True)
        batch.alter_column("sender_id", existing_type=sa.Integer(), nullable=True)
        batch.create_foreign_key("fk_messages_conversation_id", "conversations", ["conversation_id"], ["id"])
        batch.create_foreign_key("fk_messages_lead_id", "leads", ["lead_id"], ["id"])
        batch.create_index("ix_messages_conversation_id", ["conversation_id"])

    _attach_existing_case_messages()


def _attach_existing_case_messages() -> None:
    """One conversation per client phone number; every case message joins it.

    A client with two cases gets one conversation, linked to their earliest case;
    each message still records its own case.
    """
    bind = op.get_bind()
    rows = bind.execute(sa.text(
        "SELECT c.id AS case_id, u.name AS client_name, p.phone AS phone "
        "FROM cases c "
        "JOIN case_client_association a ON a.case_id = c.id "
        "JOIN users u ON u.id = a.client_id "
        "JOIN client_profiles p ON p.user_id = u.id "
        "ORDER BY c.id, u.id"
    )).mappings().all()

    conversation_for_phone = {}
    seen_cases = set()
    for row in rows:
        if row["case_id"] in seen_cases:
            continue  # first client with a phone decides the case's conversation
        phone = _e164(row["phone"])
        if not phone:
            continue
        seen_cases.add(row["case_id"])
        conv_id = conversation_for_phone.get(phone)
        if conv_id is None:
            bind.execute(sa.text(
                "INSERT INTO conversations (phone, contact_name, case_id, created_at) "
                "VALUES (:phone, :name, :case_id, CURRENT_TIMESTAMP)"
            ), {"phone": phone, "name": row["client_name"], "case_id": row["case_id"]})
            conv_id = bind.execute(sa.text("SELECT id FROM conversations WHERE phone = :phone"),
                                   {"phone": phone}).scalar_one()
            conversation_for_phone[phone] = conv_id
        bind.execute(sa.text(
            "UPDATE messages SET conversation_id = :conv WHERE case_id = :case_id AND conversation_id IS NULL"
        ), {"conv": conv_id, "case_id": row["case_id"]})

    bind.execute(sa.text(
        "UPDATE conversations SET last_message_at = "
        "(SELECT MAX(m.timestamp) FROM messages m WHERE m.conversation_id = conversations.id)"
    ))


def downgrade() -> None:
    bind = op.get_bind()
    # Messages that only exist in conversations (lead texts) can't fit the old shape.
    bind.execute(sa.text("DELETE FROM messages WHERE case_id IS NULL OR sender_id IS NULL"))
    with op.batch_alter_table("messages") as batch:
        batch.drop_index("ix_messages_conversation_id")
        batch.drop_constraint("fk_messages_lead_id", type_="foreignkey")
        batch.drop_constraint("fk_messages_conversation_id", type_="foreignkey")
        batch.alter_column("sender_id", existing_type=sa.Integer(), nullable=False)
        batch.alter_column("case_id", existing_type=sa.Integer(), nullable=False)
        batch.drop_column("lead_id")
        batch.drop_column("conversation_id")
    op.drop_table("conversations")
    op.drop_table("leads")
