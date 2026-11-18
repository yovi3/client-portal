"""Leads: staff type them in for now (task 1.2); the robo bridge fills them later.

Every lead with a phone number gets its conversation right away, so it is ready
to text. A number that already has a conversation about a case or another lead
keeps that link; the response says so instead of moving it silently.
"""
import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import database, models, schemas
from ..deps import get_current_user
from ..phone import normalize_phone
from ..services import conversations
from .utils import PERSONNEL_ROLES, require_role

router = APIRouter(tags=["leads"])

LEAD_STATUSES = {"open", "signed", "closed"}


def _phone_or_400(raw: Optional[str]) -> Optional[str]:
    if raw is None or not raw.strip():
        return None
    e164 = normalize_phone(raw)
    if not e164:
        raise HTTPException(status_code=400, detail="That phone number isn't valid. Use 10 digits, like (201) 555-0123.")
    return e164


def _staff_or_400(db: Session, user_id: Optional[int]) -> Optional[int]:
    if user_id is None:
        return None
    user = db.get(models.User, user_id)
    if not user or user.role not in PERSONNEL_ROLES:
        raise HTTPException(status_code=400, detail="Leads can only be assigned to staff.")
    return user_id


def _link_conversation(db: Session, lead: models.Lead) -> schemas.Lead:
    """The lead as the API returns it, with its conversation (created if needed)."""
    out = schemas.Lead.model_validate(lead)
    if not lead.phone:
        return out
    conv = conversations.get_or_create(db, lead.phone, contact_name=lead.name, lead_id=lead.id)
    if conv.lead_id is None and conv.case_id is None:
        conv.lead_id = lead.id  # an unassigned number now belongs to this lead
    db.commit()
    out.conversation_id = conv.id
    if conv.case_id and conv.lead_id != lead.id:
        out.phone_note = "This number already has a conversation linked to a case."
    elif conv.lead_id and conv.lead_id != lead.id:
        other = db.get(models.Lead, conv.lead_id)
        out.phone_note = f"This number already has a conversation linked to lead {other.lead_number if other else conv.lead_id}."
    return out


@router.get("/leads/staff", response_model=List[schemas.StaffSummary])
def list_assignable_staff(
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Staff a lead can be assigned to (for the form's dropdown)."""
    require_role(current_user, PERSONNEL_ROLES)
    return (
        db.query(models.User)
        .filter(models.User.role.in_(PERSONNEL_ROLES))
        .order_by(models.User.name)
        .all()
    )


def _describe(db: Session, leads: List[models.Lead]) -> List[schemas.Lead]:
    """Each lead with its conversation, latest text and any phone note, built with a few
    queries for the whole batch rather than several per lead."""
    if not leads:
        return []
    lead_ids = [l.id for l in leads]
    phones = {l.phone for l in leads if l.phone}
    convs = db.query(models.Conversation).filter(
        (models.Conversation.lead_id.in_(lead_ids)) | (models.Conversation.phone.in_(phones or {""}))
    ).all()
    by_phone = {c.phone: c for c in convs}
    conv_ids = [c.id for c in convs]
    latest_ids = (db.query(func.max(models.Message.id))
                  .filter(models.Message.conversation_id.in_(conv_ids or [0]))
                  .group_by(models.Message.conversation_id))
    last_by_conv = {m.conversation_id: m for m in db.query(models.Message).filter(models.Message.id.in_(latest_ids))}
    sender_ids = {m.sender_id for m in last_by_conv.values() if m.sender_id}
    role_by_user = dict(db.query(models.User.id, models.User.role).filter(models.User.id.in_(sender_ids))) if sender_ids else {}
    by_lead = {}
    for c in convs:
        if c.lead_id:
            by_lead.setdefault(c.lead_id, []).append(c)
    result = []
    for lead in leads:
        item = schemas.Lead.model_validate(lead)
        own = [c for c in by_lead.get(lead.id, []) if not c.case_id]
        # The conversation for the lead's current number, else its most recent one.
        conv = next((c for c in own if c.phone == lead.phone), None) or (
            max(own, key=lambda c: c.last_message_at or c.created_at) if own else None)
        # All of the lead's numbers: the default one first, then the most recently used.
        ordered = sorted(own, key=lambda c: (c is not conv, -((c.last_message_at or c.created_at).timestamp() if (c.last_message_at or c.created_at) else 0)))
        item.conversations = [schemas.LeadConversation(id=c.id, phone=c.phone, sms_opted_out=bool(c.sms_opted_out),
                                                       last_message_at=c.last_message_at) for c in ordered]
        if conv:
            item.conversation_id = conv.id
            item.conversation_phone = conv.phone
            item.sms_opted_out = bool(conv.sms_opted_out)
            item.last_message_at = conv.last_message_at
            last = last_by_conv.get(conv.id)
            if last:
                item.last_message = schemas.ConversationLastMessage(
                    content=last.content, timestamp=last.timestamp,
                    inbound=last.sender_id is None or role_by_user.get(last.sender_id) == "client",
                )
        else:
            other = by_phone.get(lead.phone) if lead.phone else None
            if other and other.case_id:
                item.phone_note = "This number already has a conversation linked to a case."
            elif other and other.lead_id:
                item.phone_note = "This number already has a conversation linked to another lead."
        result.append(item)
    return result


@router.get("/leads", response_model=List[schemas.Lead])
def list_leads(
    show: str = "active",
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Leads still being worked (show=active, the default) or every lead (show=all).
    The conversation view uses this: most recent conversation first.

    Active means open in the portal: New or In Progress in LeadBase, or typed in by hand
    and not marked signed or closed.
    """
    # Every staff member sees every lead for now; LawBase security levels decide this in task 2.7.
    require_role(current_user, PERSONNEL_ROLES)
    q = db.query(models.Lead)
    if show != "all":
        q = q.filter(models.Lead.status == "open")
    result = _describe(db, q.order_by(models.Lead.created_at.desc(), models.Lead.id.desc()).all())
    # Most recent conversation first; leads nobody has texted yet after them, newest first.
    def stamp(value):
        if value is None:
            return 0.0
        return (value if value.tzinfo else value.replace(tzinfo=datetime.timezone.utc)).timestamp()
    result.sort(key=lambda l: (l.last_message_at is not None, stamp(l.last_message_at or l.created_at)), reverse=True)
    return result


# Columns the lead list can be sorted by.
_SORTS = {
    "lead_number": lambda: [func.length(models.Lead.lead_number), models.Lead.lead_number],
    "name": lambda: [models.Lead.last_name, models.Lead.first_name],
    "type": lambda: [models.Lead.lead_type],
    "status": lambda: [models.Lead.lb_status],
    "assigned": lambda: [models.Lead.assigned_name],
    "source": lambda: [models.Lead.source],
    "created": lambda: [models.Lead.created_at],
}


@router.get("/leads/page", response_model=schemas.LeadPage)
def lead_page(
    show: str = "all",
    q: Optional[str] = None,
    sort: str = "created",
    direction: str = "desc",
    offset: int = 0,
    limit: int = 50,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    """One page of the lead list, sorted and searched on the server, so the list stays
    quick however many leads there are. The screen asks for the next page as you scroll."""
    require_role(current_user, PERSONNEL_ROLES)
    limit = max(1, min(limit, 200))
    offset = max(0, offset)
    query = db.query(models.Lead)
    if show != "all":
        query = query.filter(models.Lead.status == "open")
    text = (q or "").strip()
    if text:
        like = f"%{text}%"
        conditions = [models.Lead.lead_number.ilike(like), models.Lead.first_name.ilike(like),
                      models.Lead.last_name.ilike(like), models.Lead.assigned_name.ilike(like)]
        digits = "".join(ch for ch in text if ch.isdigit())
        if len(digits) >= 3:
            conditions.append(models.Lead.phone.like(f"%{digits}%"))
            # ...or any number the lead has a conversation with (it may differ from LeadBase's)
            conditions.append(models.Lead.id.in_(
                db.query(models.Conversation.lead_id).filter(
                    models.Conversation.lead_id.isnot(None), models.Conversation.phone.like(f"%{digits}%"))))
        # "Dana Ng" matches first and last name together
        parts = text.split()
        if len(parts) >= 2:
            conditions.append(models.Lead.first_name.ilike(f"%{parts[0]}%") & models.Lead.last_name.ilike(f"%{parts[-1]}%"))
        from sqlalchemy import or_
        query = query.filter(or_(*conditions))
    total = query.count()
    columns = _SORTS.get(sort, _SORTS["created"])()
    descending = direction != "asc"
    # Empty values (no name, no type...) always go to the end, whichever way it's sorted.
    order = []
    for c in columns:
        order += [c.is_(None).asc(), c.desc() if descending else c.asc()]
    order.append(models.Lead.id.desc() if descending else models.Lead.id.asc())  # stable paging
    leads = query.order_by(*order).offset(offset).limit(limit).all()
    return schemas.LeadPage(items=_describe(db, leads), total=total, offset=offset, limit=limit)


@router.get("/leads/{lead_id}", response_model=schemas.Lead)
def get_lead(
    lead_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    """One lead with its conversation details (for a lead opened from the lead list)."""
    require_role(current_user, PERSONNEL_ROLES)
    lead = db.get(models.Lead, lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found.")
    return _describe(db, [lead])[0]


@router.post("/leads", response_model=schemas.Lead, status_code=201)
def create_lead(
    payload: schemas.LeadCreate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    require_role(current_user, PERSONNEL_ROLES)
    number = payload.lead_number.strip()
    if db.query(models.Lead).filter(models.Lead.lead_number == number).first():
        raise HTTPException(status_code=409, detail=f"Lead {number} is already in the portal.")
    lead = models.Lead(
        lead_number=number,
        first_name=(payload.first_name or "").strip() or None,
        last_name=(payload.last_name or "").strip() or None,
        phone=_phone_or_400(payload.phone),
        assigned_user_id=_staff_or_400(db, payload.assigned_user_id),
        created_by_user_id=current_user.id,
    )
    db.add(lead)
    db.commit()
    db.refresh(lead)
    return _link_conversation(db, lead)


@router.patch("/leads/{lead_id}", response_model=schemas.Lead)
def update_lead(
    lead_id: int,
    payload: schemas.LeadUpdate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    require_role(current_user, PERSONNEL_ROLES)
    lead = db.get(models.Lead, lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found.")
    if lead.source == "lawbase":
        raise HTTPException(status_code=409, detail="This lead comes from LeadBase. Change it in LeadBase; the portal updates within a minute.")
    changes = payload.model_dump(exclude_unset=True)
    if "status" in changes and changes["status"] not in LEAD_STATUSES:
        raise HTTPException(status_code=400, detail="Status must be open, signed or closed.")
    if "phone" in changes:
        changes["phone"] = _phone_or_400(changes["phone"])
    if "assigned_user_id" in changes:
        changes["assigned_user_id"] = _staff_or_400(db, changes["assigned_user_id"])
    for field in ("first_name", "last_name"):
        if field in changes:
            changes[field] = (changes[field] or "").strip() or None
    for field, value in changes.items():
        setattr(lead, field, value)
    db.commit()
    db.refresh(lead)
    return _link_conversation(db, lead)


@router.delete("/leads/{lead_id}", status_code=204)
def delete_lead(
    lead_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Delete a lead typed in by hand. Its texts and documents are kept: its conversation
    goes back to Needs assigning, so nothing anyone sent or received is lost.

    LeadBase leads can't be deleted here; the next sync would bring them back.
    """
    require_role(current_user, PERSONNEL_ROLES)
    lead = db.get(models.Lead, lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found.")
    if lead.source == "lawbase":
        raise HTTPException(status_code=409, detail="This lead comes from LeadBase, so it can't be deleted here.")
    db.query(models.Conversation).filter(models.Conversation.lead_id == lead.id).update(
        {models.Conversation.lead_id: None}, synchronize_session=False)
    db.query(models.Message).filter(models.Message.lead_id == lead.id).update(
        {models.Message.lead_id: None}, synchronize_session=False)
    db.query(models.FileRequest).filter(models.FileRequest.lead_id == lead.id).update(
        {models.FileRequest.lead_id: None}, synchronize_session=False)
    db.delete(lead)
    db.commit()
