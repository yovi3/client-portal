"""Endpoints the robo bridge calls (Phase 2). Nothing here is for people.

The bridge runs dssc.GetLeads in LBIntegrations every minute and sends the result
here. Leads are matched on LawBase's own key (PB0.Serial), so a lead is never added
twice; a lead someone typed in by hand with the same lead number is taken over by the
LawBase version. Every request must carry the bridge's secret key.
"""
import asyncio
import datetime
import hmac
from typing import List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import database, models, schemas
from ..config import get_settings
from ..phone import normalize_phone
from ..services import conversations
from ..deps import get_current_user
from .utils import PERSONNEL_ROLES, require_role

router = APIRouter(prefix="/bridge", tags=["bridge"])
# For staff: ask for a sync now and see when it finished ("Load leads" button).
staff_router = APIRouter(prefix="/lead-sync", tags=["bridge"])
settings = get_settings()

ACTIVE_LB_STATUSES = {"new", "in progress"}

# "Load leads": the bridge keeps one request open (wait_for_request). When staff ask for
# a sync, that request is answered at once and the bridge syncs straight away, instead of
# at its next minute. The portal never connects to robo; robo always connects out.
_sync_wanted = asyncio.Event()
_sync_state = {"requested_at": None, "finished_at": None, "result": None}


def require_bridge(x_bridge_key: Optional[str] = Header(default=None)) -> None:
    if not settings.bridge_api_key:
        raise HTTPException(status_code=503, detail="The bridge is not set up on this server (BRIDGE_API_KEY is empty).")
    if not x_bridge_key or not hmac.compare_digest(x_bridge_key, settings.bridge_api_key):
        raise HTTPException(status_code=401, detail="Wrong or missing bridge key.")


def portal_status(lb_status: Optional[str]) -> str:
    """LeadBase Status -> the portal's open, signed or closed."""
    value = (lb_status or "").strip().lower()
    if value in ACTIVE_LB_STATUSES:
        return "open"
    if value == "accepted":
        return "signed"
    return "closed"


def _clean(value: Optional[str]) -> Optional[str]:
    value = (value or "").strip()
    return value or None


@router.get("/wait-for-request", dependencies=[Depends(require_bridge)])
async def wait_for_request(seconds: int = 25):
    """The bridge asks "anything for me?" and the portal holds the question for up to
    `seconds`. Answered at once when someone clicks Load leads."""
    try:
        await asyncio.wait_for(_sync_wanted.wait(), timeout=max(1, min(seconds, 55)))
    except asyncio.TimeoutError:
        return {"sync": False}
    _sync_wanted.clear()
    return {"sync": True}


@router.get("/known-leads", dependencies=[Depends(require_bridge)])
def known_leads(db: Session = Depends(database.get_db)):
    """LawBase Serials the portal already has, so the bridge also fetches their current status."""
    rows = db.query(models.Lead.lawbase_serial).filter(models.Lead.lawbase_serial.isnot(None)).all()
    return {"serials": sorted(r[0] for r in rows)}


@router.post("/leads", response_model=schemas.BridgeLeadResult, dependencies=[Depends(require_bridge)])
def receive_leads(batch: schemas.BridgeLeadBatch, db: Session = Depends(database.get_db)):
    now = datetime.datetime.now(datetime.timezone.utc)
    staff_by_email = {
        (u.email or "").lower(): u
        for u in db.query(models.User).filter(models.User.role.in_(PERSONNEL_ROLES)).all()
        if u.email
    }
    result = dict(created=0, updated=0, merged_with_typed_in=0, unchanged=0, conversations_created=0)
    skipped: List[str] = []

    for item in batch.leads:
        number = item.lead_number.strip()
        lead = db.query(models.Lead).filter(models.Lead.lawbase_serial == item.serial).first()
        kind = "updated"
        if lead is None:
            lead = (db.query(models.Lead)
                    .filter(models.Lead.lead_number == number, models.Lead.lawbase_serial.is_(None)).first())
            kind = "merged_with_typed_in" if lead else "created"
        if lead is None:
            lead = models.Lead(lead_number=number, created_at=now)
            db.add(lead)

        phone = normalize_phone(item.phone) if item.phone else None
        if item.phone and not phone:
            skipped.append(f"Lead {number}: phone '{item.phone}' isn't a valid number, so it can't be texted.")
        assigned = staff_by_email.get((item.assigned_email or "").lower()) if item.assigned_email else None

        new_values = dict(
            lawbase_serial=item.serial,
            source="lawbase",
            lead_number=number,
            lead_type=_clean(item.lead_type),
            lb_status=_clean(item.status),
            lb_current_status=_clean(item.current_status),
            status=portal_status(item.status),
            security_level=item.security_level,
            assigned_login=_clean(item.assigned_login),
            assigned_name=_clean(item.assigned_name),
            assigned_user_id=assigned.id if assigned else None,
            first_name=_clean(item.first_name),
            last_name=_clean(item.last_name),
            phone=phone,
            email=_clean(item.email),
            language=_clean(item.language),
        )
        changed = any(getattr(lead, k) != v for k, v in new_values.items())
        for k, v in new_values.items():
            setattr(lead, k, v)
        if changed or kind != "updated":
            lead.synced_at = now
            result[kind if kind != "updated" else "updated"] += 1
        else:
            result["unchanged"] += 1
        db.flush()

        # A lead with a mobile number is ready to text: make sure its conversation exists.
        if phone:
            existing = conversations.find_by_phone(db, phone)
            conv = conversations.get_or_create(db, phone, contact_name=lead.name, lead_id=lead.id)
            if existing is None:
                result["conversations_created"] += 1
            elif conv.lead_id is None and conv.case_id is None:
                conv.lead_id = lead.id  # a number waiting in Needs assigning now belongs to this lead
                conv.dismissed_at = None
                # Its earlier texts are logged on the lead too, so the lead's history is complete.
                db.query(models.Message).filter(
                    models.Message.conversation_id == conv.id,
                    models.Message.lead_id.is_(None),
                    models.Message.case_id.is_(None),
                ).update({models.Message.lead_id: lead.id}, synchronize_session=False)
            if not conv.contact_name:
                conv.contact_name = lead.name

    db.commit()
    outcome = schemas.BridgeLeadResult(received=len(batch.leads), skipped=skipped, **result)
    _sync_state["finished_at"] = now
    _sync_state["result"] = outcome.model_dump(exclude={"skipped"})
    return outcome


def _iso(value):
    return value.isoformat() if value else None


@staff_router.post("/request")
async def request_sync(current_user: models.User = Depends(get_current_user)):
    """Staff: load leads from LawBase now rather than at the next minute."""
    require_role(current_user, PERSONNEL_ROLES)
    _sync_state["requested_at"] = datetime.datetime.now(datetime.timezone.utc)
    _sync_wanted.set()
    return {"requested_at": _iso(_sync_state["requested_at"])}


@staff_router.get("/status")
def sync_status(current_user: models.User = Depends(get_current_user)):
    """When leads were last loaded from LawBase, and what changed."""
    require_role(current_user, PERSONNEL_ROLES)
    return {"requested_at": _iso(_sync_state["requested_at"]), "finished_at": _iso(_sync_state["finished_at"]),
            "result": _sync_state["result"]}


# ---------------------------------------------------------------------------------------
# Staff logins (task 2.6) and texts into LeadBase's SMS History (task 2.9)
# ---------------------------------------------------------------------------------------

@router.post("/staff", dependencies=[Depends(require_bridge)])
def receive_staff(batch: schemas.BridgeStaffBatch, db: Session = Depends(database.get_db)):
    """LawBase's active users (from dssc.GetStaff). Each portal staff member is matched to
    their LawBase login by email; that login is the "Posted By" on texts they send."""
    by_email = {(m.email or "").strip().lower(): m for m in batch.staff if m.email}
    matched = changed = 0
    for user in db.query(models.User).filter(models.User.role.in_(PERSONNEL_ROLES)).all():
        member = by_email.get((user.email or "").strip().lower())
        login = member.login.strip() if member else None
        if member:
            matched += 1
        if user.lawbase_login != login:
            user.lawbase_login = login
            changed += 1
    db.commit()
    return {"received": len(batch.staff), "matched": matched, "changed": changed}


# Portal text status -> LeadBase SMS History status. Texts blocked by STOP were never sent,
# so they aren't written at all.
_LB_STATUS = {"sending": "Sent", "sent": "Sent", "delivered": "Delivered", "failed": "Failed", "received": "Read"}


def _sms_history_since() -> Optional[datetime.datetime]:
    value = settings.sms_history_since
    if not value:
        return None
    try:
        when = datetime.datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return when if when.tzinfo else when.replace(tzinfo=datetime.timezone.utc)


def _as_utc(value: datetime.datetime) -> datetime.datetime:
    return value if value.tzinfo else value.replace(tzinfo=datetime.timezone.utc)


@router.get("/sms-pending", response_model=List[schemas.BridgeSmsItem], dependencies=[Depends(require_bridge)])
def sms_pending(limit: int = 100, db: Session = Depends(database.get_db)):
    """Texts in LeadBase leads' conversations that aren't in LeadBase's SMS History yet,
    or whose delivery status changed since they were written. Empty unless switched on
    (SMS_HISTORY_ENABLED) with a start moment (SMS_HISTORY_SINCE)."""
    since = _sms_history_since()
    if not settings.sms_history_enabled or since is None:
        return []
    q = (db.query(models.Message, models.Conversation, models.Lead)
         .join(models.Conversation, models.Conversation.id == models.Message.conversation_id)
         .join(models.Lead, models.Lead.id == models.Conversation.lead_id)
         .filter(models.Lead.lawbase_serial.isnot(None),
                 models.Message.channel == "sms",
                 models.Message.message_type != "file_upload",
                 # times are stored as UTC without a zone
                 models.Message.timestamp >= since.astimezone(datetime.timezone.utc).replace(tzinfo=None)))
    if settings.sms_history_only_leads:
        q = q.filter(models.Lead.lead_number.in_(settings.sms_history_only_leads))
    items: List[schemas.BridgeSmsItem] = []
    for message, conversation, lead in q.order_by(models.Message.id).limit(5000):
        portal_status = message.sms_status
        if portal_status == "simulated" and settings.sms_history_include_simulated:
            portal_status = "sent"
        status = _LB_STATUS.get(portal_status or "")
        if status is None:
            continue  # simulated (not allowed), opted out, or not a text
        if message.lb_sms_serial and message.lb_sms_status == status:
            continue  # already in LeadBase, unchanged
        incoming = message.sender_id is None
        sender = None if incoming else db.get(models.User, message.sender_id)
        login = (sender.lawbase_login if sender else None) or "DSSCONNECT"
        items.append(schemas.BridgeSmsItem(
            message_id=message.id,
            serial=message.lb_sms_serial,
            case_serial=lead.lawbase_serial,
            date_utc=_as_utc(message.timestamp),
            direction="Incoming" if incoming else "Outgoing",
            post_by="DSSCONNECT" if incoming else login,
            phone="".join(ch for ch in conversation.phone if ch.isdigit())[-10:],
            message=message.content,
            status=status,
            source=f"DSSConnect:{'IN' if incoming else login}"[:50],
        ))
        if len(items) >= max(1, min(limit, 500)):
            break
    return items


@router.post("/sms-done", dependencies=[Depends(require_bridge)])
def sms_done(batch: schemas.BridgeSmsDoneBatch, db: Session = Depends(database.get_db)):
    """The bridge reports each text it wrote: its SMS History row and the status written."""
    saved = 0
    for result in batch.results:
        message = db.get(models.Message, result.message_id)
        if not message or result.error or not result.serial:
            continue
        message.lb_sms_serial = result.serial
        message.lb_sms_status = result.status
        saved += 1
    db.commit()
    return {"saved": saved}
