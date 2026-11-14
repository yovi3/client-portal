"""Document links to a phone number (tasks 1.7 to 1.12).

Requests: staff ask a lead for documents; the secure link goes out as a text in the
lead's conversation. The person opens it without logging in and uploads photos or PDFs.
Sends (task 1.10): staff send documents the other way; the person downloads them
from the same kind of link, and each download is recorded.
Every step is recorded: when the link was sent, each time it was opened, each file
uploaded, each download by staff, and any extension or revocation. Links expire
after 7 days by default; staff can extend or revoke them.
"""
import datetime
import os
import secrets
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from .. import crud, database, models, schemas
from ..config import get_settings
from ..deps import get_current_user
from ..services import conversations, texting
from ..services.storage import MAX_UPLOAD_BYTES, UploadRejected, save_request_upload
from .utils import PERSONNEL_ROLES, require_role
from .ws import STAFF_ACTIVITY_ROOM, manager

router = APIRouter(tags=["file-requests"])
settings = get_settings()


def _now() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc)


def _utc(value: Optional[datetime.datetime]) -> Optional[datetime.datetime]:
    # SQLite gives back times without a zone; they are stored in UTC.
    if value is None:
        return None
    return value if value.tzinfo else value.replace(tzinfo=datetime.timezone.utc)


def _link(req: models.FileRequest) -> str:
    return f"{settings.client_base_url.rstrip('/')}/u/{req.token}"


def _state(req: models.FileRequest) -> str:
    """waiting, partly, complete, expired or revoked.

    For a request, "complete" means every document arrived; for sent documents,
    that the person downloaded every file.
    """
    if req.revoked_at:
        return "revoked"
    if req.completed_at:
        return "complete"
    if _utc(req.expires_at) <= _now():
        return "expired"
    if req.direction == "send":
        return "partly" if any(e.kind == "recipient_downloaded" for e in req.events) else "waiting"
    return "partly" if any(i.received_at for i in req.items) else "waiting"


def _event(db: Session, req: models.FileRequest, kind: str, user: Optional[models.User] = None,
           detail: Optional[str] = None, file: Optional[models.RequestFile] = None):
    db.add(models.FileRequestEvent(request_id=req.id, kind=kind, user_id=user.id if user else None,
                                   file_id=file.id if file else None, detail=(detail or None) and detail[:300]))


def _visitor(request: Request) -> str:
    """Who opened or uploaded: address and browser, for the trail."""
    forwarded = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
    address = forwarded or (request.client.host if request.client else "unknown")
    agent = request.headers.get("user-agent", "")
    if "iPhone" in agent:
        device = "iPhone"
    elif "Android" in agent:
        device = "Android"
    elif "Windows" in agent:
        device = "Windows"
    elif "Macintosh" in agent:
        device = "Mac"
    else:
        device = "browser"
    return f"{device}, {address}"


def _file_out(f: models.RequestFile, events) -> schemas.RequestFileOut:
    downloads = [e for e in events if e.kind == "recipient_downloaded" and e.file_id == f.id]
    return schemas.RequestFileOut(
        id=f.id, item_id=f.item_id, original_name=f.original_name, content_type=f.content_type,
        size_bytes=f.size_bytes, uploaded_at=f.uploaded_at, download_count=len(downloads),
        last_downloaded_at=downloads[-1].at if downloads else None,
    )


def _staff_view(db: Session, req: models.FileRequest) -> schemas.FileRequestOut:
    opens = [e for e in req.events if e.kind == "opened"]
    message = db.get(models.Message, req.message_id) if req.message_id else None
    return schemas.FileRequestOut(
        id=req.id,
        direction=req.direction,
        state=_state(req),
        link=_link(req),
        note=req.note,
        created_at=req.created_at,
        created_by=req.created_by.name if req.created_by else None,
        sent_status=message.sms_status if message else None,
        sent_error=message.sms_error if message else None,
        expires_at=req.expires_at,
        revoked_at=req.revoked_at,
        completed_at=req.completed_at,
        open_count=len(opens),
        first_opened_at=opens[0].at if opens else None,
        last_opened_at=opens[-1].at if opens else None,
        items=[
            schemas.FileRequestItemOut(id=i.id, name=i.name, received_at=i.received_at,
                                       files=[_file_out(f, req.events) for f in i.files])
            for i in req.items
        ],
        files=[_file_out(f, req.events) for f in req.files if f.item_id is None] if req.direction == "send" else [],
        events=[schemas.FileRequestEventOut(kind=e.kind, at=e.at, who=e.user.name if e.user else None, detail=e.detail)
                for e in req.events],
    )


def _get_request(db: Session, request_id: int) -> models.FileRequest:
    req = db.get(models.FileRequest, request_id)
    if not req:
        raise HTTPException(status_code=404, detail="Request not found.")
    return req


# ---------------------------------------------------------------- staff

@router.get("/conversations/{conversation_id}/file-requests", response_model=List[schemas.FileRequestOut])
def list_file_requests(
    conversation_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    require_role(current_user, PERSONNEL_ROLES)
    reqs = (db.query(models.FileRequest).filter(models.FileRequest.conversation_id == conversation_id)
            .order_by(models.FileRequest.created_at.desc(), models.FileRequest.id.desc()).all())
    return [_staff_view(db, r) for r in reqs]


@router.post("/conversations/{conversation_id}/file-requests", response_model=schemas.FileRequestOut, status_code=201)
async def create_file_request(
    conversation_id: int,
    payload: schemas.FileRequestCreate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Create the request and text the link to the conversation's number."""
    require_role(current_user, PERSONNEL_ROLES)
    conversation = db.get(models.Conversation, conversation_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    names = [n.strip()[:100] for n in payload.items if n and n.strip()]
    if not names:
        raise HTTPException(status_code=400, detail="List at least one document to ask for.")

    req = models.FileRequest(
        token=secrets.token_urlsafe(24),
        conversation_id=conversation.id,
        lead_id=None if conversation.case_id else conversation.lead_id,
        case_id=conversation.case_id,
        note=(payload.note or "").strip() or None,
        created_by_user_id=current_user.id,
        expires_at=_now() + datetime.timedelta(days=payload.expires_in_days),
    )
    req.items = [models.FileRequestItem(name=n, position=i) for i, n in enumerate(names)]
    db.add(req)
    db.flush()

    ask = req.note or "Please upload"
    content = f"{ask}: {', '.join(names)}. Secure link, valid until {_until(req)}: {_link(req)}"
    message = models.Message(
        content=content,
        conversation_id=conversation.id,
        case_id=conversation.case_id,
        lead_id=req.lead_id,
        sender_id=current_user.id,
        channel="sms",
        message_type="file_request",
    )
    db.add(message)
    db.flush()
    req.message_id = message.id
    _event(db, req, "sent", current_user, f"{len(names)} document(s), valid {payload.expires_in_days} days")
    db.commit()
    await _text_the_link(db, conversation, message)
    db.refresh(req)
    return _staff_view(db, req)


async def _text_the_link(db: Session, conversation: models.Conversation, message: models.Message) -> None:
    """File the message in the conversation, show it live, and text it."""
    conversations.attach_message(db, message, conversation)
    full = crud.get_message_by_id(db, message.id)
    plan = texting.prepare_conversation_text(db, full, conversation)
    db.refresh(full)
    for room in texting.rooms_for(full):
        await manager.broadcast(texting.message_event(full), room)
    await manager.broadcast(texting.activity_event(conversation.id), STAFF_ACTIVITY_ROOM)
    if plan:
        texting.start_delivery(plan, manager.broadcast)


def _until(req: models.FileRequest) -> str:
    local_expiry = _utc(req.expires_at).astimezone()
    return f"{local_expiry:%b} {local_expiry.day}"


@router.post("/conversations/{conversation_id}/file-sends", response_model=schemas.FileRequestOut, status_code=201)
async def send_files(
    conversation_id: int,
    files: List[UploadFile] = File(...),
    note: Optional[str] = Form(default=None),
    expires_in_days: int = Form(default=7),
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Send documents (task 1.10): a texted link where the person downloads them."""
    require_role(current_user, PERSONNEL_ROLES)
    conversation = db.get(models.Conversation, conversation_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    if not files or len(files) > 20:
        raise HTTPException(status_code=400, detail="Choose between 1 and 20 files to send.")
    if not 1 <= expires_in_days <= 60:
        raise HTTPException(status_code=400, detail="A link can last between 1 and 60 days.")

    req = models.FileRequest(
        token=secrets.token_urlsafe(24),
        direction="send",
        conversation_id=conversation.id,
        lead_id=None if conversation.case_id else conversation.lead_id,
        case_id=conversation.case_id,
        note=(note or "").strip()[:300] or None,
        created_by_user_id=current_user.id,
        expires_at=_now() + datetime.timedelta(days=expires_in_days),
    )
    db.add(req)
    db.flush()
    saved_paths = []
    try:
        for upload in files:
            try:
                saved = save_request_upload(upload.file, req.id)
            except UploadRejected as rejected:
                raise HTTPException(status_code=rejected.status,
                                    detail=f"{upload.filename}: {rejected.message}")
            finally:
                await upload.close()
            saved_paths.append(saved.path)
            name = os.path.basename(upload.filename or "") or f"document{saved.kind.ext}"
            db.add(models.RequestFile(
                request_id=req.id, item_id=None, original_name=name[:200], stored_path=saved.path,
                content_type=saved.kind.content_type, size_bytes=saved.size, sha256=saved.sha256, uploaded_at=_now(),
            ))
    except HTTPException:
        db.rollback()
        for path in saved_paths:  # nothing half-sent stays on disk
            if os.path.exists(path):
                os.remove(path)
        raise

    db.flush()
    names = [f.filename for f in files]
    ask = req.note or "Here are your documents"
    content = f"{ask}: {', '.join(os.path.basename(n or '') for n in names)}. Secure link, valid until {_until(req)}: {_link(req)}"
    message = models.Message(
        content=content, conversation_id=conversation.id, case_id=conversation.case_id, lead_id=req.lead_id,
        sender_id=current_user.id, channel="sms", message_type="file_send",
    )
    db.add(message)
    db.flush()
    req.message_id = message.id
    _event(db, req, "sent", current_user, f"{len(files)} file(s) to download, valid {expires_in_days} days")
    db.commit()
    await _text_the_link(db, conversation, message)
    db.refresh(req)
    return _staff_view(db, req)


@router.post("/file-requests/{request_id}/extend", response_model=schemas.FileRequestOut)
def extend_file_request(
    request_id: int,
    payload: schemas.FileRequestExtend,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Keep the link working longer: N more days from now (or from the current expiry, if later)."""
    require_role(current_user, PERSONNEL_ROLES)
    req = _get_request(db, request_id)
    if req.revoked_at:
        raise HTTPException(status_code=400, detail="This link was revoked. Send a new request instead.")
    start = max(_now(), _utc(req.expires_at))
    req.expires_at = start + datetime.timedelta(days=payload.days)
    _event(db, req, "extended", current_user, f"now valid until {req.expires_at:%b} {req.expires_at.day}")
    db.commit()
    db.refresh(req)
    return _staff_view(db, req)


@router.post("/file-requests/{request_id}/revoke", response_model=schemas.FileRequestOut)
def revoke_file_request(
    request_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Stop the link working at once (sent to the wrong number, no longer needed)."""
    require_role(current_user, PERSONNEL_ROLES)
    req = _get_request(db, request_id)
    if not req.revoked_at:
        req.revoked_at = _now()
        _event(db, req, "revoked", current_user)
        db.commit()
        db.refresh(req)
    return _staff_view(db, req)


@router.get("/request-files/{file_id}/download")
def download_request_file(
    file_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    require_role(current_user, PERSONNEL_ROLES)
    f = db.get(models.RequestFile, file_id)
    if not f or not os.path.exists(f.stored_path):
        raise HTTPException(status_code=404, detail="File not found.")
    _event(db, f.request, "downloaded", current_user, f.original_name, file=f)
    db.commit()
    return FileResponse(f.stored_path, media_type=f.content_type, filename=f.original_name)


# ---------------------------------------------------------------- public (the link itself)

def _public_request(db: Session, token: str) -> models.FileRequest:
    req = db.query(models.FileRequest).filter(models.FileRequest.token == token).first()
    if not req:
        raise HTTPException(status_code=404, detail="This link isn't valid. Check that it was copied completely.")
    return req


@router.get("/public/file-requests/{token}", response_model=schemas.PublicFileRequest)
def open_file_request(token: str, request: Request, db: Session = Depends(database.get_db)):
    """The upload page loads this. Every load is recorded as an "opened" event."""
    req = _public_request(db, token)
    state = _state(req)
    public_state = {"waiting": "open", "partly": "open"}.get(state, state)
    _event(db, req, "opened" if public_state in ("open", "complete") else f"opened_{public_state}", detail=_visitor(request))
    db.commit()
    lead = req.lead
    first_name = lead.first_name if lead and lead.first_name else (
        (req.conversation.contact_name or "").split(" ")[0] or None)
    counts = {}
    for f in req.files:
        counts[f.item_id] = counts.get(f.item_id, 0) + 1
    return schemas.PublicFileRequest(
        firm_name=settings.sms_sender_name,
        first_name=first_name,
        note=req.note,
        state=public_state,
        can_upload=public_state in ("open", "complete"),
        expires_at=req.expires_at,
        max_file_mb=MAX_UPLOAD_BYTES // (1024 * 1024),
        direction=req.direction,
        items=[schemas.PublicFileRequestItem(id=i.id, name=i.name, file_count=counts.get(i.id, 0)) for i in req.items],
        files=[schemas.PublicSentFile(id=f.id, name=f.original_name, size_bytes=f.size_bytes, content_type=f.content_type)
               for f in req.files if f.item_id is None] if req.direction == "send" else [],
    )


@router.get("/public/file-requests/{token}/files/{file_id}")
def download_sent_file(token: str, file_id: int, request: Request, db: Session = Depends(database.get_db)):
    """The person downloads a document the firm sent. Each download is recorded."""
    req = _public_request(db, token)
    if req.direction != "send":
        raise HTTPException(status_code=404, detail="File not found.")
    state = _state(req)
    if state in ("revoked", "expired"):
        raise HTTPException(status_code=410, detail="This link is no longer active. Text us and we'll send a new one.")
    f = next((x for x in req.files if x.id == file_id and x.item_id is None), None)
    if not f or not os.path.exists(f.stored_path):
        raise HTTPException(status_code=404, detail="File not found.")
    _event(db, req, "recipient_downloaded", detail=f"{f.original_name}, {_visitor(request)}", file=f)
    db.flush()
    db.refresh(req)
    downloaded = {e.file_id for e in req.events if e.kind == "recipient_downloaded"}
    if not req.completed_at and all(x.id in downloaded for x in req.files if x.item_id is None):
        req.completed_at = _now()
        _event(db, req, "completed")
    db.commit()
    return FileResponse(f.stored_path, media_type=f.content_type, filename=f.original_name)


@router.post("/public/file-requests/{token}/items/{item_id}/files", status_code=201)
async def upload_to_file_request(
    token: str,
    item_id: int,
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(database.get_db),
):
    """One file per call, so the page can show progress for each."""
    req = _public_request(db, token)
    state = _state(req)
    if state == "revoked":
        raise HTTPException(status_code=410, detail="This link was turned off by the firm. Text us and we'll send a new one.")
    if state == "expired":
        raise HTTPException(status_code=410, detail="This link has expired. Text us and we'll send a new one.")
    if req.direction != "request":
        raise HTTPException(status_code=400, detail="This link is for downloading documents, not uploading.")
    item = next((i for i in req.items if i.id == item_id), None)
    if not item:
        raise HTTPException(status_code=404, detail="That document isn't part of this request.")
    try:
        saved = save_request_upload(file.file, req.id)
    except UploadRejected as rejected:
        raise HTTPException(status_code=rejected.status, detail=rejected.message)
    finally:
        await file.close()

    original = os.path.basename(file.filename or "") or f"{item.name}{saved.kind.ext}"
    now = _now()
    new_file = models.RequestFile(
        request_id=req.id, item_id=item.id, original_name=original[:200], stored_path=saved.path,
        content_type=saved.kind.content_type, size_bytes=saved.size, sha256=saved.sha256, uploaded_at=now,
    )
    db.add(new_file)
    if not item.received_at:
        item.received_at = now
    db.flush()
    _event(db, req, "uploaded", detail=f"{item.name}: {original[:120]} ({saved.size // 1024} KB), {_visitor(request)}",
           file=new_file)
    if not req.completed_at and all(i.received_at for i in req.items):
        req.completed_at = now
        _event(db, req, "completed")

    # A note in the conversation, so staff see the upload where they work.
    note = models.Message(
        content=f"Uploaded {item.name}: {original[:120]}",
        conversation_id=req.conversation_id,
        case_id=req.case_id,
        lead_id=req.lead_id,
        sender_id=None,
        channel="portal",
        message_type="file_upload",
    )
    db.add(note)
    db.commit()
    conversations.attach_message(db, note, req.conversation)
    full = crud.get_message_by_id(db, note.id)
    for room in texting.rooms_for(full):
        await manager.broadcast(texting.message_event(full), room)
    await manager.broadcast(texting.activity_event(req.conversation_id), STAFF_ACTIVITY_ROOM)
    return {"status": "received", "item_id": item.id, "complete": req.completed_at is not None}
