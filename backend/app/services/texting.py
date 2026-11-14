"""Two-way texting between case staff and clients.

Outbound: a staff message in a case conversation is texted to the client, and its
delivery status (sending, sent, delivered, failed...) is stored on the message and
pushed live to everyone viewing the case.

Inbound: a client's text reply goes straight into their case conversation when they
have exactly one open case; otherwise it waits in the SMS inbox for staff to assign.
STOP / START keywords update the client's opt-out flag.
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
from .sms import TWILIO_ERROR_UNSUBSCRIBED, build_client_text, describe_error, send_sms

logger = logging.getLogger(__name__)

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


def set_opt_out(db: Session, client: Optional[models.User], opted_out: bool) -> None:
    profile = client.client_profile if client else None
    if not profile or bool(profile.sms_opted_out) == opted_out:
        return
    profile.sms_opted_out = opted_out
    profile.sms_opted_out_at = _now() if opted_out else None
    db.commit()
    logger.info("Client %s SMS opt-out set to %s", client.id, opted_out)


# ---------------------------------------------------------------- outbound

@dataclass
class TextPlan:
    message_id: int
    phone: str
    body: str
    room: str


def prepare_client_text(db: Session, message: models.Message) -> Optional[TextPlan]:
    """Decide whether a staff message can be texted, and record why not if it can't."""
    case = crud.get_case_by_id(db, message.case_id)
    client = case.clients[0] if case and case.clients else None
    profile = client.client_profile if client else None

    if not profile or not profile.phone:
        message.sms_status, message.sms_error = "no_phone", "No mobile number on file for the client."
        plan = None
    elif profile.sms_opted_out:
        message.sms_status, message.sms_error = "opted_out", describe_error(TWILIO_ERROR_UNSUBSCRIBED)
        plan = None
    else:
        message.sms_status, message.sms_error = "sending", None
        sender_first = message.sender_user.first_name if message.sender_user else None
        plan = TextPlan(message.id, profile.phone, build_client_text(sender_first, message.content), f"case_{message.case_id}")
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
                case = crud.get_case_by_id(db, message.case_id)
                set_opt_out(db, case.clients[0] if case and case.clients else None, True)
        elif result.status == "simulated":
            message.sms_status = "simulated"
        else:
            message.sms_sid = result.sid
            # A delivery report may already have moved it past "sent".
            if _RANK.get(message.sms_status, -1) < _RANK["sent"]:
                message.sms_status = "sent"
        db.commit()
        await broadcast(status_event(message), plan.room)
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
        case = crud.get_case_by_id(db, message.case_id)
        set_opt_out(db, case.clients[0] if case and case.clients else None, True)
    db.commit()
    return message


# ---------------------------------------------------------------- inbound

def handle_inbound(db: Session, from_number: str, body: str, sid: Optional[str], opt_out_type: Optional[str]):
    """Route a client's text. Returns the case Message when it went straight into a case."""
    if sid and db.query(models.Message).filter(models.Message.sms_sid == sid).first():
        return None  # Twilio retried a webhook we already handled

    client = crud.get_user_by_phone(db, from_number)
    keyword = (body or "").strip().upper()
    if (opt_out_type or "").upper() == "STOP" or keyword in OPT_OUT_KEYWORDS:
        set_opt_out(db, client, True)
    elif (opt_out_type or "").upper() == "START" or keyword in OPT_IN_KEYWORDS:
        set_opt_out(db, client, False)

    open_cases = [c for c in (client.client_cases if client else []) if (c.status or "").lower() not in CLOSED_CASE_STATUSES]
    if len(open_cases) != 1:
        # Unknown number, or a client with several open cases: staff decide in the inbox.
        # (Task 1.6 replaces this with routing by conversation.)
        crud.create_awaiting_sms(db, phone=from_number, body=body, client_id=client.id if client else None)
        return None

    message = models.Message(
        content=body,
        case_id=open_cases[0].id,
        sender_id=client.id,
        channel="sms",
        message_type="text",
        sms_status="received",
        sms_sid=sid,
    )
    db.add(message)
    db.commit()
    conversations.attach_message(
        db, message,
        conversations.get_or_create(db, from_number, contact_name=client.name, case_id=open_cases[0].id),
    )
    return crud.get_message_by_id(db, message.id)
