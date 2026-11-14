"""conversation opt-out and "not related"; carry the old SMS inbox into conversations

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-11-15 09:00:00.000000

Incoming texts now always land in the conversation for their phone number, so the
old awaiting_sms inbox stops receiving texts. Its pending texts are copied into
conversations here (and marked "moved") so nothing waiting for staff is lost.
"""
import re
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "d4e5f6a7b8c9"
down_revision: Union[str, None] = "c3d4e5f6a7b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _e164(raw):
    # Same rule as app/phone.py, copied so this migration never changes meaning.
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
    op.add_column("conversations", sa.Column("sms_opted_out", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("conversations", sa.Column("sms_opted_out_at", sa.DateTime(), nullable=True))
    op.add_column("conversations", sa.Column("dismissed_at", sa.DateTime(), nullable=True))

    bind = op.get_bind()
    # A client who already opted out keeps that on their conversation.
    for profile in bind.execute(sa.text(
        "SELECT phone, sms_opted_out_at FROM client_profiles WHERE sms_opted_out = :yes"
    ), {"yes": True}).mappings().all():
        phone = _e164(profile["phone"])
        if phone:
            bind.execute(sa.text(
                "UPDATE conversations SET sms_opted_out = :yes, sms_opted_out_at = :at WHERE phone = :p"
            ), {"yes": True, "at": profile["sms_opted_out_at"], "p": phone})

    pending = bind.execute(sa.text(
        "SELECT s.id, s.client_phone_number, s.sms_body, s.received_at, s.client_id, u.name AS client_name "
        "FROM awaiting_sms s LEFT JOIN users u ON u.id = s.client_id "
        "WHERE s.status = 'pending' ORDER BY s.received_at, s.id"
    )).mappings().all()
    for row in pending:
        phone = _e164(row["client_phone_number"])
        if not phone:
            continue
        conv = bind.execute(sa.text("SELECT id, case_id, lead_id FROM conversations WHERE phone = :p"),
                            {"p": phone}).mappings().first()
        if conv is None:
            bind.execute(sa.text(
                "INSERT INTO conversations (phone, contact_name, created_at, sms_opted_out) "
                "VALUES (:p, :n, CURRENT_TIMESTAMP, :no)"
            ), {"p": phone, "n": row["client_name"], "no": False})
            conv = bind.execute(sa.text("SELECT id, case_id, lead_id FROM conversations WHERE phone = :p"),
                                {"p": phone}).mappings().first()
        bind.execute(sa.text(
            "INSERT INTO messages (content, timestamp, is_read, message_type, channel, sms_status, "
            "conversation_id, case_id, lead_id, sender_id) "
            "VALUES (:content, :ts, :no, 'text', 'sms', 'received', :conv, :case_id, :lead_id, :sender)"
        ), {
            "content": row["sms_body"], "ts": row["received_at"], "no": False, "conv": conv["id"],
            "case_id": conv["case_id"], "lead_id": None if conv["case_id"] else conv["lead_id"],
            "sender": row["client_id"],
        })
        bind.execute(sa.text("UPDATE awaiting_sms SET status = 'moved' WHERE id = :id"), {"id": row["id"]})

    bind.execute(sa.text(
        "UPDATE conversations SET last_message_at = "
        "(SELECT MAX(m.timestamp) FROM messages m WHERE m.conversation_id = conversations.id)"
    ))


def downgrade() -> None:
    bind = op.get_bind()
    # Remove the copies this migration made, then put the texts back in the old inbox.
    for row in bind.execute(sa.text(
        "SELECT id, sms_body, received_at FROM awaiting_sms WHERE status = 'moved'"
    )).mappings().all():
        copy_id = bind.execute(sa.text(
            "SELECT id FROM messages WHERE channel = 'sms' AND sms_sid IS NULL AND content = :c "
            "AND timestamp = :ts ORDER BY id DESC LIMIT 1"
        ), {"c": row["sms_body"], "ts": row["received_at"]}).scalar()
        if copy_id is not None:
            bind.execute(sa.text("DELETE FROM messages WHERE id = :id"), {"id": copy_id})
        bind.execute(sa.text("UPDATE awaiting_sms SET status = 'pending' WHERE id = :id"), {"id": row["id"]})
    with op.batch_alter_table("conversations") as batch:
        batch.drop_column("dismissed_at")
        batch.drop_column("sms_opted_out_at")
        batch.drop_column("sms_opted_out")
