"""Finding and creating the conversation a message belongs to.

There is one conversation per phone number. The first time the firm texts or
hears from a number, its conversation is created and linked to whatever the
message is about (a case or a lead). After that, every message with that
number joins the same conversation, and its last_message_at is kept current so
lists can show the most recent conversations first.
"""
import datetime
from typing import Optional

from sqlalchemy.orm import Session

from .. import models
from ..phone import normalize_phone


def _now() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc)


def find_by_phone(db: Session, phone: Optional[str]) -> Optional[models.Conversation]:
    e164 = normalize_phone(phone)
    if not e164:
        return None
    return db.query(models.Conversation).filter(models.Conversation.phone == e164).first()


def get_or_create(
    db: Session,
    phone: Optional[str],
    contact_name: Optional[str] = None,
    case_id: Optional[int] = None,
    lead_id: Optional[int] = None,
) -> Optional[models.Conversation]:
    """The conversation for this number, created (and linked) if it doesn't exist.

    An existing conversation keeps its links: moving a conversation between a
    lead and a case is a deliberate staff action, never a side effect.
    """
    e164 = normalize_phone(phone)
    if not e164:
        return None
    conversation = find_by_phone(db, e164)
    if conversation:
        if not conversation.contact_name and contact_name:
            conversation.contact_name = contact_name
        return conversation
    conversation = models.Conversation(
        phone=e164, contact_name=contact_name, case_id=case_id, lead_id=lead_id
    )
    db.add(conversation)
    db.flush()
    return conversation


def client_conversation_for_case(db: Session, case: Optional[models.Case]) -> Optional[models.Conversation]:
    """The conversation with the case's first client who has a phone number."""
    if not case:
        return None
    for client in case.clients or []:
        profile = client.client_profile
        if profile and normalize_phone(profile.phone):
            return get_or_create(db, profile.phone, contact_name=client.name, case_id=case.id)
    return None


def attach_message(db: Session, message: models.Message, conversation: Optional[models.Conversation] = None) -> None:
    """Put a message in its conversation and move the conversation to the top of lists.

    Without an explicit conversation, a case message joins its client's conversation.
    Commits.
    """
    if conversation is None and message.case_id:
        conversation = client_conversation_for_case(db, message.case)
    if conversation is None:
        return
    message.conversation_id = conversation.id
    stamp = message.timestamp or _now()
    if conversation.last_message_at is None or _as_utc(stamp) > _as_utc(conversation.last_message_at):
        conversation.last_message_at = stamp
    db.commit()


def _as_utc(value: datetime.datetime) -> datetime.datetime:
    # SQLite returns stored times without a time zone; treat those as UTC.
    return value if value.tzinfo else value.replace(tzinfo=datetime.timezone.utc)


def attach_all_case_messages(db: Session) -> int:
    """Attach every case message that has no conversation yet. Used by the test-data seed."""
    count = 0
    for message in db.query(models.Message).filter(
        models.Message.conversation_id.is_(None), models.Message.case_id.isnot(None)
    ).order_by(models.Message.id):
        attach_message(db, message)
        count += 1 if message.conversation_id else 0
    return count
