"""Two-way texting between staff and the people they text.

Outbound: a staff message in a case conversation is texted to the client, and its
delivery status (sending, sent, delivered, failed...) is stored on the message and
pushed live to everyone viewing the case.

Inbound: every text lands in the conversation for its phone number. A number seen
for the first time is linked to the client's case (when they have exactly one open
case) or to an open lead with that number; otherwise it waits in "Needs assigning".
STOP / START keywords update the number's opt-out flag.
"""
import asyncio
import datetime
import json
import logging
from dataclasses import dataclass
from typing import Awaitable, Callable, Optional

from sqlalchemy.orm import Session

from .. import crud, database, models, schemas
from . import conversations
from ..phone import normalize_phone
from .sms import TWILIO_ERROR_UNSUBSCRIBED, build_client_text, describe_error, send_sms
from ..config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# Carrier/CTIA opt-out and opt-in keywords (Twilio's Messaging Service replies to these itself).
OPT_OUT_KEYWORDS = {"STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "REVOKE", "OPTOUT"}
OPT_IN_KEYWORDS = {"START", "UNSTOP", "YES"}
CLOSED_CASE_STATUSES = {"closed", "archived"}

# Twilio reports statuses out of order sometimes; never move a message backwards.
_RANK = {"sending": 0, "sent": 1, "delivered": 2, "failed": 3}
_TWILIO_TO_OURS = {
    "accepted": "sending", "scheduled": "sending", "queued": "sending", "sending": "sending",
    "sent": "sent", "delivered": "delivered", "read": "delivered",
    "failed": "failed", "undelivered": "failed", "canceled": "failed",
}

Broadcast = Callable[[str, str], Awaitable[None]]
_tasks: set = set()  # keep in-flight sends alive until they finish


def _now() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc)


def status_event(message: models.Message) -> str:
    """Live update for a message that is already on screen."""
    return json.dumps({
        "type": "sms_status",
        "message_id": message.id,
        "sms_status": message.sms_status,
        "sms_error": message.sms_error,
    })


def message_event(message: models.Message) -> str:
    return schemas.Message.from_orm(message).model_dump_json()


def activity_event(conversation_id: int) -> str:
    """Tells open lists that a conversation has something new (they reload it)."""
    return json.dumps({"type": "conversation_activity", "conversation_id": conversation_id})


def rooms_for(message: models.Message) -> list:
    """Every live room that shows this message: its conversation, and its case chat."""
    rooms = []
    if message.conversation_id:
        rooms.append(f"conv_{message.conversation_id}")
    if message.case_id:
        rooms.append(f"case_{message.case_id}")
    return rooms


def set_opt_out(
    db: Session,
    conversation: Optional[models.Conversation],
    client: Optional[models.User],
    opted_out: bool,
) -> None:
    """Record STOP (True) or START (False) for a number, on its conversation and client profile."""
    stamp = _now() if opted_out else None
    changed = False
    if conversation is not None and bool(conversation.sms_opted_out) != opted_out:
        conversation.sms_opted_out, conversation.sms_opted_out_at = opted_out, stamp
        changed = True
    profile = client.client_profile if client else None
    if profile is not None and bool(profile.sms_opted_out) != opted_out:
        profile.sms_opted_out, profile.sms_opted_out_at = opted_out, stamp
        changed = True
    if changed:
        db.commit()
        logger.info("SMS opt-out set to %s for conversation %s", opted_out, conversation.id if conversation else None)


def _first_client(case: Optional[models.Case]) -> Optional[models.User]:
    return case.clients[0] if case and case.clients else None


# ---------------------------------------------------------------- outbound

@dataclass
class TextPlan:
    message_id: int
    phone: str
    body: str
    rooms: list


def prepare_client_text(db: Session, message: models.Message) -> Optional[TextPlan]:
    """Decide whether a staff message can be texted, and record why not if it can't."""
    case = crud.get_case_by_id(db, message.case_id)
    client = _first_client(case)
    profile = client.client_profile if client else None
    conversation = message.conversation

    if not profile or not profile.phone:
        message.sms_status, message.sms_error = "no_phone", "No mobile number on file for the client."
        plan = None
    elif profile.sms_opted_out or (conversation is not None and conversation.sms_opted_out):
        message.sms_status, message.sms_error = "opted_out", describe_error(TWILIO_ERROR_UNSUBSCRIBED)
        plan = None
    else:
        message.sms_status, message.sms_error = "sending", None
        sender_first = message.sender_user.first_name if message.sender_user else None
        plan = TextPlan(message.id, profile.phone, build_client_text(sender_first, message.content), rooms_for(message))
    db.commit()
    return plan


def prepare_conversation_text(db: Session, message: models.Message, conversation: models.Conversation) -> Optional[TextPlan]:
    """A staff message in a lead (or any) conversation is texted to that conversation's number."""
    if conversation.sms_opted_out:
        message.sms_status, message.sms_error = "opted_out", describe_error(TWILIO_ERROR_UNSUBSCRIBED)
        plan = None
    else:
        message.sms_status, message.sms_error = "sending", None
        sender_first = message.sender_user.first_name if message.sender_user else None
        plan = TextPlan(message.id, conversation.phone, build_client_text(sender_first, message.content), rooms_for(message))
    db.commit()
    return plan


def start_delivery(plan: TextPlan, broadcast: Broadcast) -> None:
    """Send in the background so the conversation never waits on Twilio."""
    task = asyncio.create_task(_deliver(plan, broadcast))
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)


async def _deliver(plan: TextPlan, broadcast: Broadcast) -> None:
    result = await asyncio.to_thread(send_sms, plan.phone, plan.body)
    db = database.SessionLocal()
    try:
        message = db.get(models.Message, plan.message_id)
        if not message:
            return
        if result.status == "failed":
            message.sms_status, message.sms_error = "failed", result.error_text
            if result.error_code == TWILIO_ERROR_UNSUBSCRIBED:
                set_opt_out(db, message.conversation, _first_client(message.case), True)
        elif result.status == "simulated":
            message.sms_status = "simulated"
        else:
            message.sms_sid = result.sid
            # A delivery report may already have moved it past "sent".
            if _RANK.get(message.sms_status, -1) < _RANK["sent"]:
                message.sms_status = "sent"
        db.commit()
        for room in plan.rooms:
            await broadcast(status_event(message), room)
    except Exception:
        logger.exception("Could not record SMS result for message %s", plan.message_id)
    finally:
        db.close()


def apply_status_report(db: Session, sid: str, twilio_status: str, error_code=None) -> Optional[models.Message]:
    """Twilio delivery report -> message status. Returns the message if it changed."""
    message = db.query(models.Message).filter(models.Message.sms_sid == sid).first()
    new_status = _TWILIO_TO_OURS.get((twilio_status or "").lower())
    if not message or not new_status:
        return None
    if _RANK.get(new_status, -1) <= _RANK.get(message.sms_status, -1):
        return None
    message.sms_status = new_status
    message.sms_error = describe_error(error_code) if new_status == "failed" else None
    if new_status == "failed" and str(error_code) == str(TWILIO_ERROR_UNSUBSCRIBED):
        set_opt_out(db, message.conversation, _first_client(message.case), True)
    db.commit()
    return message


# ---------------------------------------------------------------- inbound

def handle_inbound(db: Session, from_number: str, body: str, sid: Optional[str], opt_out_type: Optional[str]):
    """File an incoming text into its number's conversation. Returns the new Message, or None for a repeat."""
    if sid and db.query(models.Message).filter(models.Message.sms_sid == sid).first():
        return None  # Twilio retried a webhook we already handled

    phone = normalize_phone(from_number) or (from_number or "").strip()
    client = crud.get_user_by_phone(db, from_number)
    conversation = conversations.find_by_phone(db, phone)
    if conversation is None:
        # First text from this number: link it if it is obviously about one thing.
        open_cases = [c for c in (client.client_cases if client else [])
                      if (c.status or "").lower() not in CLOSED_CASE_STATUSES]
        if not settings.cases_enabled:
            open_cases = []  # cases are hidden: a client's number waits in Needs assigning
        lead = None
        if len(open_cases) != 1:
            lead = (db.query(models.Lead)
                    .filter(models.Lead.phone == phone, models.Lead.status == "open")
                    .order_by(models.Lead.id.desc()).first())
        conversation = conversations.get_or_create(
            db, phone,
            contact_name=client.name if client else (lead.name if lead else None),
            case_id=open_cases[0].id if len(open_cases) == 1 else None,
            lead_id=lead.id if lead else None,
        )

    keyword = (body or "").strip().upper()
    if (opt_out_type or "").upper() == "STOP" or keyword in OPT_OUT_KEYWORDS:
        set_opt_out(db, conversation, client, True)
    elif (opt_out_type or "").upper() == "START" or keyword in OPT_IN_KEYWORDS:
        set_opt_out(db, conversation, client, False)

    if conversation.dismissed_at is not None:
        conversation.dismissed_at = None  # a new text brings a "Not related" number back

    message = models.Message(
        content=body,
        conversation_id=conversation.id,
        case_id=conversation.case_id,
        lead_id=None if conversation.case_id else conversation.lead_id,
        sender_id=client.id if client else None,
        channel="sms",
        message_type="text",
        sms_status="received",
        sms_sid=sid,
    )
    db.add(message)
    db.commit()
    conversations.attach_message(db, message, conversation)
    return crud.get_message_by_id(db, message.id)
