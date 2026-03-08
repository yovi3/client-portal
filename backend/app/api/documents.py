import os
import shutil

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from typing import List
from starlette.datastructures import UploadFile

from .. import database, models, schemas, crud
from ..deps import get_current_user
from .utils import PERSONNEL_ROLES, require_role, ensure_case_access, require_admin_user
from fastapi.responses import FileResponse
from ..config import get_settings
from ..services.sms import send_sms


router = APIRouter(tags=["documents"])
settings = get_settings()
UPLOAD_DIRECTORY = "uploads"




@router.post("/cases/{case_id}/requests", response_model=schemas.DocumentRequest)
def create_doc_request(
    case_id: int,
    request_data: schemas.DocumentRequestCreate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    require_role(current_user, PERSONNEL_ROLES)
    request_data = request_data.model_copy(update={"lawyer_id": current_user.id})
    lawyer_id = current_user.id

    db_case = ensure_case_access(db, current_user, case_id)
    if not db_case:
        raise HTTPException(status_code=404, detail="Case not found")

    is_assigned = any(user.id == lawyer_id for user in db_case.personnel)
    if not is_assigned:
        raise HTTPException(status_code=403, detail="Only assigned personnel can send a request for this case.")

    db_request = crud.create_document_request(db, case_id=case_id, request_data=request_data)

    primary_client = db_case.clients[0] if db_case.clients else None
    if primary_client and primary_client.client_profile and primary_client.client_profile.phone:
        client_phone = primary_client.client_profile.phone
        link = f"{settings.client_base_url}/requests/{db_request.access_token}"
        message_body = (
            f"New documents are required for your case (#{db_case.case_number} - {db_case.title}). "
            f"Click to upload them: {link}"
        )
        send_sms(to_number=client_phone, body=message_body)
    return db_request


@router.get("/cases/{case_id}/requests", response_model=List[schemas.DocumentRequest])
def get_case_doc_requests(
    case_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    ensure_case_access(db, current_user, case_id)
    return crud.get_all_requests_by_case(db, case_id)


@router.get("/requests/{token}", response_model=schemas.DocumentRequest)
def get_doc_request_by_token(
    token: str,
    db: Session = Depends(database.get_db),
):
    db_request = crud.get_document_request_by_token(db, token)
    if not db_request:
        raise HTTPException(status_code=404, detail="Request not found or link has expired.")
    response = schemas.DocumentRequest.from_orm(db_request)
    if db_request.case:
        response.case_title = db_request.case.title
        response.client_names = [client.name for client in (db_request.case.clients or [])]
        response.personnel_names = [person.name for person in (db_request.case.personnel or [])]
    return response


MAX_UPLOAD_BYTES = 10 * 1024 * 1024
ALLOWED_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png", ".doc", ".docx"}


@router.post("/requests/{token}/upload")
async def upload_documents_for_request(
    token: str,
    request: Request,
    db: Session = Depends(database.get_db),
):
    db_request = crud.get_document_request_by_token(db, token)
    if not db_request:
        raise HTTPException(status_code=404, detail="Document request not found.")
    if db_request.status == "completed":
        raise HTTPException(status_code=400, detail="This request is already completed.")

    request_upload_dir = os.path.join(UPLOAD_DIRECTORY, str(db_request.id))
    os.makedirs(request_upload_dir, exist_ok=True)

    form_data = await request.form()
    uploaded_doc_ids = []

    for field_name, file_or_value in form_data.items():
        if not isinstance(file_or_value, UploadFile):
            continue

        file = file_or_value
        try:
            doc_id = int(field_name)
            uploaded_doc_ids.append(doc_id)
            db_doc = crud.get_requested_document_by_id(db, doc_id)
            if not db_doc or db_doc.request_id != db_request.id:
                continue

            ext = os.path.splitext(file.filename or "")[1].lower()
            if ext not in ALLOWED_EXTENSIONS:
                raise HTTPException(status_code=400, detail=f"File type not allowed: {ext}")

            file.file.seek(0, os.SEEK_END)
            size = file.file.tell()
            file.file.seek(0)
            if size > MAX_UPLOAD_BYTES:
                raise HTTPException(status_code=413, detail="File too large")

            safe_filename = os.path.basename(file.filename)
            file_path = os.path.join(request_upload_dir, f"{doc_id}_{safe_filename}")

            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)

            db_doc.status = "uploaded"
            db_doc.file_path = file_path
        except ValueError:
            continue
        finally:
            file.file.close()

    all_docs_uploaded = True
    for doc in db_request.requested_documents:
        if doc.status == "required":
            all_docs_uploaded = False
            break

    db_request.status = "completed" if all_docs_uploaded else "pending"
    db.commit()
    db.refresh(db_request)

    return {"status": "success", "uploaded_files": len(uploaded_doc_ids), "request_status": db_request.status}


@router.post("/requests/{request_id}/upload-legacy")
async def upload_documents_for_request_legacy(request_id: int):
    raise HTTPException(status_code=410, detail="Deprecated. Use /requests/{token}/upload")


@router.get("/documents/{doc_id}/download")
def download_document(
    doc_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    db_doc = crud.get_requested_document_by_id(db, doc_id)
    if not db_doc or not db_doc.file_path:
        raise HTTPException(status_code=404, detail="Document not found")

    db_request = crud.get_document_request_by_id(db, db_doc.request_id)
    if not db_request:
        raise HTTPException(status_code=404, detail="Document request not found")

    case = crud.get_case_by_id(db, db_request.case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    if current_user.role == "admin":
        pass
    elif current_user.role == "client":
        if not any(c.id == current_user.id for c in case.clients):
            raise HTTPException(status_code=403, detail="Forbidden")
    else:
        if not any(p.id == current_user.id for p in case.personnel):
            raise HTTPException(status_code=403, detail="Forbidden")

    return FileResponse(db_doc.file_path, filename=os.path.basename(db_doc.file_path))


@router.get("/documents", response_model=List[schemas.DocumentResponse])
def get_all_documents(
    user_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user.id != user_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    results = crud.get_all_user_documents(db, current_user.id, current_user.role)
    response = []
    for doc, case_title, case_id, request_date in results:
        response.append(
            schemas.DocumentResponse(
                id=doc.id,
                name=doc.name,
                status=doc.status,
                file_path=doc.file_path,
                case_title=case_title,
                case_id=case_id,
                upload_date=request_date,
            )
        )
    return response


@router.get("/admin/documents", response_model=List[schemas.DocumentResponse])
def get_all_documents_admin(
    status: str | None = None,
    search: str | None = None,
    skip: int = 0,
    limit: int = 1000,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    require_admin_user(current_user)
    results = crud.get_all_documents_admin(
        db,
        status=status,
        search_term=search,
        skip=skip,
        limit=limit,
    )
    response = []
    for doc, case_title, case_id, request_date in results:
        response.append(
            schemas.DocumentResponse(
                id=doc.id,
                name=doc.name,
                status=doc.status,
                file_path=doc.file_path,
                case_title=case_title,
                case_id=case_id,
                upload_date=request_date,
            )
        )
    return response


@router.patch("/admin/documents/{doc_id}/status", response_model=schemas.DocumentResponse)
def update_document_status_admin(
    doc_id: int,
    payload: schemas.DocumentStatusUpdate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    require_admin_user(current_user)
    updated_doc = crud.update_requested_document_status(db, doc_id=doc_id, new_status=payload.status)
    if not updated_doc:
        raise HTTPException(status_code=404, detail="Document not found")

    db_request = crud.get_document_request_by_id(db, updated_doc.request_id)
    case_title = db_request.case.title if db_request and db_request.case else "N/A"
    case_id = db_request.case_id if db_request else 0
    request_date = db_request.created_at if db_request else None
    return schemas.DocumentResponse(
        id=updated_doc.id,
        name=updated_doc.name,
        status=updated_doc.status,
        file_path=updated_doc.file_path,
        case_title=case_title,
        case_id=case_id,
        upload_date=request_date,
    )


@router.delete("/admin/documents/{doc_id}/file", status_code=204)
def delete_document_file_admin(
    doc_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    require_admin_user(current_user)
    existing = crud.get_requested_document_by_id(db, doc_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Document not found")

    file_path = existing.file_path
    updated_doc = crud.clear_requested_document_file(db, doc_id)
    if not updated_doc:
        raise HTTPException(status_code=404, detail="Document not found")

    if file_path and os.path.exists(file_path):
        try:
            os.remove(file_path)
        except OSError:
            pass

    return None
