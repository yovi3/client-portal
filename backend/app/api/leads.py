"""Leads: staff type them in for now (task 1.2); the robo bridge fills them later.

Every lead with a phone number gets its conversation right away, so it is ready
to text. A number that already has a conversation about a case or another lead
keeps that link; the response says so instead of moving it silently.
"""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
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


@router.get("/leads", response_model=List[schemas.Lead])
def list_leads(
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    # Every staff member sees every lead for now; LawBase groups decide this in Phase 2 (task 2.7).
    require_role(current_user, PERSONNEL_ROLES)
    leads = db.query(models.Lead).order_by(models.Lead.created_at.desc(), models.Lead.id.desc()).all()
    convs = db.query(models.Conversation).all()
    by_phone = {c.phone: c for c in convs}
    result = []
    for lead in leads:
        item = schemas.Lead.model_validate(lead)
        conv = by_phone.get(lead.phone) if lead.phone else None
        if conv and conv.lead_id == lead.id:
            item.conversation_id = conv.id
        elif conv and conv.case_id:
            item.phone_note = "This number already has a conversation linked to a case."
        elif conv and conv.lead_id:
            item.phone_note = "This number already has a conversation linked to another lead."
        result.append(item)
    return result


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
