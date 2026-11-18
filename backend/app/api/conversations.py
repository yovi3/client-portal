"""Conversations: one per phone number, linked to a lead, a case, or neither.

Tasks 1.3 and 1.6. "Needs assigning" lists conversations linked to nothing.
Staff link each one to a lead (existing or new) or a case, or mark it "Not
related". When a lead signs, its conversation moves to the case and keeps the
lead link, so the start of the conversation stays traceable.

Texts that arrived before a link was made are logged against the new link, so
the lead's or case's history is complete.
"""
import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import database, models, schemas
from ..config import get_settings
from ..deps import get_current_user
from ..phone import normalize_phone
from ..services import conversations as conversation_service
from .utils import PERSONNEL_ROLES, require_role

router = APIRouter(tags=["conversations"])
settings = get_settings()


def _require_cases_enabled():
    if not settings.cases_enabled:
        raise HTTPException(status_code=403, detail="Cases aren't turned on yet.")


@router.get("/app-settings", response_model=schemas.AppSettings)
def app_settings(current_user: models.User = Depends(get_current_user)):
    """What the screens should show. Cases stay hidden until Phase 2."""
    return schemas.AppSettings(cases_enabled=settings.cases_enabled)


def _now() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc)


def _get_or_404(db: Session, conversation_id: int) -> models.Conversation:
    conversation = db.get(models.Conversation, conversation_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    return conversation


def _summaries(db: Session, convs: List[models.Conversation]) -> List[schemas.ConversationSummary]:
    if not convs:
        return []
    ids = [c.id for c in convs]
    counts = dict(
        db.query(models.Message.conversation_id, func.count(models.Message.id))
        .filter(models.Message.conversation_id.in_(ids))
        .group_by(models.Message.conversation_id)
        .all()
    )
    out = []
    for c in convs:
        last = (
            db.query(models.Message)
            .filter(models.Message.conversation_id == c.id)
            .order_by(models.Message.timestamp.desc(), models.Message.id.desc())
            .first()
        )
        inbound = bool(last) and (
            last.sender_id is None or (last.sender_user is not None and last.sender_user.role == "client")
        )
        out.append(schemas.ConversationSummary(
            id=c.id,
            phone=c.phone,
            contact_name=c.contact_name,
            kind=c.kind,
            lead=schemas.ConversationLead.model_validate(c.lead) if c.lead else None,
            case=schemas.ConversationCase.model_validate(c.case) if c.case else None,
            last_message=schemas.ConversationLastMessage(
                content=last.content, timestamp=last.timestamp, inbound=inbound
            ) if last else None,
            last_message_at=c.last_message_at,
            message_count=counts.get(c.id, 0),
            sms_opted_out=bool(c.sms_opted_out),
        ))
    return out


def _unassigned_query(db: Session):
    return db.query(models.Conversation).filter(
        models.Conversation.lead_id.is_(None),
        models.Conversation.case_id.is_(None),
        models.Conversation.dismissed_at.is_(None),
    )


def _log_unlinked_messages(db: Session, conversation: models.Conversation) -> None:
    """Texts that came in before the link get logged against it, so history is complete."""
    q = db.query(models.Message).filter(
        models.Message.conversation_id == conversation.id,
        models.Message.case_id.is_(None),
        models.Message.lead_id.is_(None),
    )
    if conversation.case_id:
        q.update({models.Message.case_id: conversation.case_id}, synchronize_session=False)
    elif conversation.lead_id:
        q.update({models.Message.lead_id: conversation.lead_id}, synchronize_session=False)


@router.get("/conversations/counts", response_model=schemas.ConversationCounts)
def conversation_counts(
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    require_role(current_user, PERSONNEL_ROLES)
    return schemas.ConversationCounts(unassigned=_unassigned_query(db).count())


@router.get("/conversations", response_model=List[schemas.ConversationSummary])
def list_conversations(
    kind: str = "unassigned",
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    # Every staff member sees every conversation for now; LawBase groups decide this in Phase 2 (task 2.7).
    require_role(current_user, PERSONNEL_ROLES)
    if kind == "unassigned":
        q = _unassigned_query(db)
    elif kind == "lead":
        q = db.query(models.Conversation).filter(
            models.Conversation.lead_id.isnot(None), models.Conversation.case_id.is_(None))
    elif kind == "case":
        _require_cases_enabled()
        q = db.query(models.Conversation).filter(models.Conversation.case_id.isnot(None))
    else:
        raise HTTPException(status_code=400, detail="kind must be unassigned, lead or case.")
    convs = q.order_by(models.Conversation.last_message_at.desc(), models.Conversation.id.desc()).all()
    return _summaries(db, convs)


@router.get("/conversations/lookup", response_model=schemas.ConversationLookup)
def lookup_conversation(
    phone: str,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    """New text: does this number already have a conversation, and with whom?"""
    require_role(current_user, PERSONNEL_ROLES)
    normalized = normalize_phone(phone)
    if not normalized:
        raise HTTPException(status_code=400, detail="That phone number isn't valid.")
    conversation = conversation_service.find_by_phone(db, normalized)
    if conversation and conversation.case_id and not settings.cases_enabled:
        conversation = None  # cases are hidden for now
    return schemas.ConversationLookup(conversation=_summaries(db, [conversation])[0] if conversation else None)


@router.get("/conversations/{conversation_id}", response_model=schemas.ConversationSummary)
def get_conversation(
    conversation_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    """One conversation's summary: its number, name, and what it's linked to."""
    require_role(current_user, PERSONNEL_ROLES)
    conversation = db.get(models.Conversation, conversation_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    if conversation.case_id and not settings.cases_enabled:
        raise HTTPException(status_code=403, detail="Cases are not turned on yet.")
    return _summaries(db, [conversation])[0]


@router.get("/conversations/{conversation_id}/messages", response_model=List[schemas.Message])
def conversation_messages(
    conversation_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    require_role(current_user, PERSONNEL_ROLES)
    _get_or_404(db, conversation_id)
    return (
        db.query(models.Message)
        .filter(models.Message.conversation_id == conversation_id)
        .order_by(models.Message.timestamp, models.Message.id)
        .all()
    )


@router.post("/conversations/{conversation_id}/link", response_model=schemas.ConversationSummary)
def link_conversation(
    conversation_id: int,
    payload: schemas.ConversationLinkRequest,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    require_role(current_user, PERSONNEL_ROLES)
    conversation = _get_or_404(db, conversation_id)
    chosen = [x for x in (payload.lead_id, payload.new_lead, payload.case_id) if x is not None]
    if len(chosen) != 1:
        raise HTTPException(status_code=400, detail="Choose one: an existing lead, a new lead, or a case.")
    if conversation.case_id:
        raise HTTPException(status_code=409, detail="This conversation is already linked to a case.")

    if payload.case_id is not None:
        _require_cases_enabled()
        case = db.get(models.Case, payload.case_id)
        if not case:
            raise HTTPException(status_code=404, detail="Case not found.")
        conversation.case_id = case.id
        if not conversation.contact_name and case.clients:
            conversation.contact_name = case.clients[0].name
    else:
        if conversation.lead_id:
            raise HTTPException(status_code=409, detail="This conversation is already linked to a lead.")
        if payload.new_lead is not None:
            lead = _new_lead(db, payload.new_lead, conversation.phone, current_user)
        else:
            lead = db.get(models.Lead, payload.lead_id)
            if not lead:
                raise HTTPException(status_code=404, detail="Lead not found.")
            if not lead.phone:
                lead.phone = conversation.phone  # the lead had no number; now it does
        conversation.lead_id = lead.id
        if not conversation.contact_name:
            conversation.contact_name = lead.name

    conversation.dismissed_at = None
    _log_unlinked_messages(db, conversation)
    db.commit()
    db.refresh(conversation)
    return _summaries(db, [conversation])[0]


def _new_lead(db: Session, new: schemas.NewLeadForConversation, phone: str, current_user: models.User) -> models.Lead:
    number = new.lead_number.strip()
    if db.query(models.Lead).filter(models.Lead.lead_number == number).first():
        raise HTTPException(status_code=409, detail=f"Lead {number} is already in the portal. Choose it as an existing lead.")
    if new.assigned_user_id is not None:
        staff = db.get(models.User, new.assigned_user_id)
        if not staff or staff.role not in PERSONNEL_ROLES:
            raise HTTPException(status_code=400, detail="Leads can only be assigned to staff.")
    lead = models.Lead(
        lead_number=number,
        first_name=(new.first_name or "").strip() or None,
        last_name=(new.last_name or "").strip() or None,
        phone=phone,
        assigned_user_id=new.assigned_user_id,
        created_by_user_id=current_user.id,
    )
    db.add(lead)
    db.flush()
    return lead


@router.post("/conversations/start", response_model=schemas.StartConversationResult)
def start_conversation(
    payload: schemas.StartConversationRequest,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    """New text (task 1.5): open the conversation for a number, linked to a lead, or to
    no lead at all (no_lead): anyone can be texted, and the number can be linked later.

    A number that already has a conversation opens that one rather than a second.
    """
    require_role(current_user, PERSONNEL_ROLES)
    phone = normalize_phone(payload.phone)
    if not phone:
        raise HTTPException(status_code=400, detail="That phone number isn't valid. Use 10 digits, like (201) 555-0123.")
    choices = sum([payload.lead_id is not None, payload.new_lead is not None, payload.no_lead])
    if choices != 1:
        raise HTTPException(status_code=400, detail="Choose an existing lead, add a new one, or text without a lead.")

    existing = conversation_service.find_by_phone(db, phone)
    if payload.no_lead:
        # Opens the number's conversation whatever it's linked to; a new number starts unlinked.
        conversation = existing or conversation_service.get_or_create(db, phone, contact_name=(payload.contact_name or "").strip() or None)
        if not existing and payload.contact_name and not conversation.contact_name:
            conversation.contact_name = payload.contact_name.strip()
        conversation.dismissed_at = None
        db.commit()
        db.refresh(conversation)
        return schemas.StartConversationResult(
            conversation=_summaries(db, [conversation])[0], lead_id=conversation.lead_id, existing=existing is not None,
            note="This number already has a conversation, so that one is opened." if existing else None,
        )
    if existing and (existing.lead_id or existing.case_id):
        note = None
        if payload.lead_id is not None and existing.lead_id != payload.lead_id:
            note = "This number already has a conversation, so that one is opened."
        return schemas.StartConversationResult(
            conversation=_summaries(db, [existing])[0], lead_id=existing.lead_id, existing=True, note=note
        )

    if payload.new_lead is not None:
        lead = _new_lead(db, payload.new_lead, phone, current_user)
    else:
        lead = db.get(models.Lead, payload.lead_id)
        if not lead:
            raise HTTPException(status_code=404, detail="Lead not found.")
        if not lead.phone:
            lead.phone = phone

    conversation = existing or conversation_service.get_or_create(db, phone, contact_name=lead.name, lead_id=lead.id)
    conversation.lead_id = lead.id
    conversation.dismissed_at = None
    if not conversation.contact_name:
        conversation.contact_name = lead.name
    _log_unlinked_messages(db, conversation)
    db.commit()
    db.refresh(conversation)
    return schemas.StartConversationResult(
        conversation=_summaries(db, [conversation])[0], lead_id=lead.id, existing=existing is not None
    )


@router.post("/conversations/{conversation_id}/move-to-case", response_model=schemas.ConversationSummary)
def move_lead_conversation_to_case(
    conversation_id: int,
    payload: schemas.MoveToCaseRequest,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    """The lead signed: the conversation moves to the case and the lead is marked Signed."""
    require_role(current_user, PERSONNEL_ROLES)
    _require_cases_enabled()
    conversation = _get_or_404(db, conversation_id)
    if not conversation.lead_id:
        raise HTTPException(status_code=400, detail="Only a lead's conversation can be moved to a case.")
    if conversation.case_id:
        raise HTTPException(status_code=409, detail="This conversation is already linked to a case.")
    case = db.get(models.Case, payload.case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found.")
    conversation.case_id = case.id
    if conversation.lead and conversation.lead.status == "open":
        conversation.lead.status = "signed"
    db.commit()
    db.refresh(conversation)
    return _summaries(db, [conversation])[0]


@router.post("/conversations/{conversation_id}/dismiss", response_model=schemas.ConversationSummary)
def dismiss_conversation(
    conversation_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    """"Not related": a wrong number or spam leaves Needs assigning until it texts again."""
    require_role(current_user, PERSONNEL_ROLES)
    conversation = _get_or_404(db, conversation_id)
    if conversation.lead_id or conversation.case_id:
        raise HTTPException(status_code=400, detail="Only conversations that need assigning can be marked not related.")
    conversation.dismissed_at = _now()
    db.commit()
    db.refresh(conversation)
    return _summaries(db, [conversation])[0]
