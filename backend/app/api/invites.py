from typing import List, Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import crud, database, models, schemas
from ..config import get_settings
from ..deps import get_current_user
from .utils import require_permission


router = APIRouter(prefix="/invites", tags=["invites"])
settings = get_settings()


def _invite_url(token: str) -> str:
    base = settings.client_base_url.rstrip("/")
    return f"{base}/invite?token={token}"


@router.post("", response_model=schemas.InviteCreateResponse)
def create_invite_route(
    payload: schemas.InviteCreate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    require_permission(db, current_user, settings.invite_manage_permission)
    invite, token = crud.create_invite(
        db=db,
        email=payload.email,
        invited_by_user_id=current_user.id,
        expires_days=settings.invite_expiry_days,
        first_name=payload.first_name,
        last_name=payload.last_name,
        phone=payload.phone,
        address=payload.address,
    )
    return schemas.InviteCreateResponse(
        invite=schemas.Invite(**crud.serialize_invite(invite)),
        invite_url=_invite_url(token),
    )


@router.get("", response_model=List[schemas.Invite])
def list_invites_route(
    status: Optional[schemas.InviteStatus] = None,
    skip: int = 0,
    limit: int = 200,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    require_permission(db, current_user, settings.invite_manage_permission)
    invites = crud.list_invites(db, status=status, skip=skip, limit=limit)
    return [schemas.Invite(**crud.serialize_invite(invite)) for invite in invites]


@router.get("/preview", response_model=schemas.InvitePreview)
def invite_preview_route(
    token: str,
    db: Session = Depends(database.get_db),
):
    invite = crud.get_valid_invite_by_token(db, token)
    return schemas.InvitePreview(
        invited_email=invite.invited_email,
        role=invite.role,
        expires_at=invite.expires_at,
        required_fields=["first_name", "last_name", "phone", "address", "password"],
        first_name=invite.prefill_first_name,
        last_name=invite.prefill_last_name,
        phone=invite.prefill_phone,
        address=invite.prefill_address,
    )


@router.post("/accept", response_model=schemas.User)
def accept_invite_route(
    payload: schemas.InviteAccept,
    db: Session = Depends(database.get_db),
):
    user = crud.accept_invite(
        db=db,
        token=payload.token,
        first_name=payload.first_name,
        last_name=payload.last_name,
        phone=payload.phone,
        address=payload.address,
        password=payload.password,
    )
    return user
