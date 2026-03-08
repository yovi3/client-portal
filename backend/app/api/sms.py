from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session
from twilio.request_validator import RequestValidator

from .. import database, models, schemas, crud
from ..deps import get_current_user
from .utils import PERSONNEL_ROLES, require_role
from ..config import get_settings
from .ws import manager


router = APIRouter(tags=["sms"])
settings = get_settings()


@router.post("/api/twilio/webhook/sms")
async def twilio_sms_webhook(
    request: Request,
    db: Session = Depends(database.get_db),
):
    if not settings.twilio_auth_token:
        raise HTTPException(status_code=500, detail="Twilio auth token not configured")

    form_data = await request.form()
    signature = request.headers.get("X-Twilio-Signature", "")
    validator = RequestValidator(settings.twilio_auth_token)
    if not validator.validate(str(request.url), dict(form_data), signature):
        raise HTTPException(status_code=403, detail="Invalid Twilio signature")

    client_phone = form_data.get("From")
    sms_body = form_data.get("Body")
    if not client_phone or not sms_body:
        raise HTTPException(status_code=400, detail="Missing 'From' or 'Body' data")

    client = crud.get_user_by_phone(db, client_phone)
    client_id = client.id if client else None
    crud.create_awaiting_sms(db, phone=client_phone, body=sms_body, client_id=client_id)

    return Response(content="<Response></Response>", media_type="application/xml")


def _broadcast_case_message(message: models.Message):
    return schemas.Message.from_orm(message).model_dump_json()


async def _assign_inbox_sms(
    db: Session,
    sms_id: int,
    payload: schemas.AssignSMSPayload,
    current_user: models.User,
) -> models.Message:
    awaiting_sms = crud.get_awaiting_sms_by_id(db, sms_id)
    if not awaiting_sms:
        raise HTTPException(status_code=404, detail="Inbox SMS not found")
    if awaiting_sms.status == "resolved":
        raise HTTPException(status_code=400, detail="SMS already resolved")
    if not awaiting_sms.client_id:
        raise HTTPException(status_code=400, detail="Cannot assign SMS without an identified client")

    case = crud.get_case_by_client_id(db, payload.case_id, awaiting_sms.client_id)
    if not case:
        raise HTTPException(status_code=403, detail="Case not found or client is not assigned to it.")

    message_schema = schemas.MessageCreate(
        content=awaiting_sms.sms_body,
        case_id=case.id,
        sender_id=awaiting_sms.client_id,
        channel="sms",
    )
    db_message_simple = crud.create_message(db, message=message_schema)
    crud.update_awaiting_sms_status(
        db,
        sms_id,
        status="resolved",
        assigned_case_id=case.id,
        assigned_by_user_id=current_user.id,
    )
    db_message_full = crud.get_message_by_id(db, db_message_simple.id)
    if not db_message_full:
        raise HTTPException(status_code=500, detail="Failed to load assigned SMS message")

    room = f"case_{case.id}"
    await manager.broadcast(_broadcast_case_message(db_message_full), room)
    return db_message_full


@router.get("/sms/inbox", response_model=List[schemas.AwaitingSMS])
def get_sms_inbox(
    skip: int = 0,
    limit: int = 50,
    client_id: Optional[int] = None,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    require_role(current_user, PERSONNEL_ROLES)
    return crud.get_awaiting_sms(db, skip=skip, limit=limit, client_id=client_id)


@router.get("/sms/inbox/threads", response_model=List[schemas.SMSInboxThread])
def get_sms_inbox_threads(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    require_role(current_user, PERSONNEL_ROLES)
    return crud.get_sms_inbox_threads(db, skip=skip, limit=limit)


@router.post("/sms/inbox/{sms_id}/assign", response_model=schemas.Message)
async def assign_sms_inbox_message(
    sms_id: int,
    payload: schemas.AssignSMSPayload,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    require_role(current_user, PERSONNEL_ROLES)
    return await _assign_inbox_sms(db, sms_id, payload, current_user)


# Legacy aliases kept for backward compatibility
@router.get("/api/awaiting-sms", response_model=List[schemas.AwaitingSMS])
def get_awaiting_sms_route(
    skip: int = 0,
    limit: int = 20,
    client_id: Optional[int] = None,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    return get_sms_inbox(
        skip=skip,
        limit=limit,
        client_id=client_id,
        db=db,
        current_user=current_user,
    )


@router.post("/api/awaiting-sms/{sms_id}/assign", response_model=schemas.Message)
async def assign_awaiting_sms(
    sms_id: int,
    payload: schemas.AssignSMSPayload,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    require_role(current_user, PERSONNEL_ROLES)
    return await _assign_inbox_sms(db, sms_id, payload, current_user)
