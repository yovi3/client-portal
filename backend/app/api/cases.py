from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session
from typing import List, Optional

from .. import database, models, schemas, crud
from ..deps import get_current_user
from .utils import PERSONNEL_ROLES, require_role, ensure_case_access


router = APIRouter(tags=["cases"])


def _to_case_schema(
    db: Session,
    case: models.Case,
    unread_count: int = 0,
    current_user: models.User | None = None,
) -> schemas.Case:
    client_roles = crud.get_case_client_roles_map(db=db, case_id=case.id)
    for client in case.clients:
        setattr(client, "case_role", client_roles.get(client.id, "client"))

    case_schema = schemas.Case.from_orm(case)
    case_schema.unread_count = unread_count
    case_schema.client_id = case.clients[0].id if case.clients else None
    case_schema.client_user = case.clients[0] if case.clients else None

    assigned_lawyer = next((person for person in case.personnel if person.role == "lawyer"), None)
    if not assigned_lawyer and case.personnel:
        assigned_lawyer = case.personnel[0]
    case_schema.assigned_lawyer_id = assigned_lawyer.id if assigned_lawyer else None
    case_schema.assigned_lawyer_user = assigned_lawyer

    if current_user and current_user.role == "client":
        case_schema.client_id = current_user.id
    if not current_user or current_user.role != "admin":
        case_schema.case_serial = None

    return case_schema


@router.get("/cases", response_model=List[schemas.Case])
def get_cases(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user.role == "admin":
        all_cases = crud.get_cases(db, skip=skip, limit=limit)
        return [_to_case_schema(db, case, 0, current_user) for case in all_cases]
    if current_user.role in PERSONNEL_ROLES:
        results = crud.get_lawyer_cases(db, current_user.id)
        return [_to_case_schema(db, case, count, current_user) for case, count in results]
    if current_user.role == "client":
        results = crud.get_client_cases(db, current_user.id)
        return [_to_case_schema(db, case, count, current_user) for case, count in results]
    return []


@router.get("/lawyers/{lawyer_id}/cases", response_model=List[schemas.Case])
def get_lawyer_cases(
    lawyer_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user.id != lawyer_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    results = crud.get_lawyer_cases(db, lawyer_id)
    return [_to_case_schema(db, case, count, current_user) for case, count in results]


@router.get("/clients/{client_id}/cases", response_model=List[schemas.Case])
def get_client_cases_route(
    client_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user.id != client_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    results = crud.get_client_cases(db, client_id)
    return [_to_case_schema(db, case, count, current_user) for case, count in results]


@router.post("/cases", response_model=schemas.Case)
def create_case(
    case: schemas.CaseCreate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    require_role(current_user, PERSONNEL_ROLES)
    # Auto-assign creator only for non-admin personnel roles.
    if current_user.role != "admin" and current_user.id not in case.personnel_ids:
        case = case.model_copy(update={"personnel_ids": case.personnel_ids + [current_user.id]})
    client_assignments = list(case.client_assignments or [])
    if not client_assignments and case.client_ids:
        client_assignments = [schemas.CaseClientAssignmentIn(user_id=client_id, role_type="client") for client_id in case.client_ids]
        case = case.model_copy(update={"client_assignments": client_assignments})

    primary_client_id = client_assignments[0].user_id if client_assignments else None
    primary_client = crud.get_user_by_id(db, primary_client_id) if primary_client_id else None
    if not primary_client or primary_client.role != "client":
        raise HTTPException(status_code=404, detail=f"Primary Client ID {primary_client_id} not found or not a client.")

    db_case = crud.create_case(db, case)
    return _to_case_schema(db, db_case, 0, current_user)


@router.post("/cases/{case_id}/personnel", response_model=schemas.User)
def add_personnel_to_case(
    case_id: int,
    user_id: int,
    role: str,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    require_role(current_user, PERSONNEL_ROLES)
    ensure_case_access(db, current_user, case_id)
    db_case = crud.get_case_by_id(db, case_id)
    if not db_case:
        raise HTTPException(status_code=404, detail="Case not found")

    personnel_user = crud.get_user_by_id(db, user_id)
    if not personnel_user or personnel_user.role not in ['lawyer', 'accountant', 'paralegal', 'legal assistant']:
        raise HTTPException(status_code=400, detail=f"User ID {user_id} is not valid personnel.")

    if any(p.id == user_id for p in db_case.personnel):
        return personnel_user

    stmt = models.case_personnel_association.insert().values(
        case_id=db_case.id,
        user_id=personnel_user.id,
        role=role,
    )
    db.execute(stmt)
    db.commit()
    return crud.get_user_by_id(db, user_id)


@router.delete("/cases/{case_id}/personnel/{user_id}", status_code=204)
def remove_personnel_from_case(
    case_id: int,
    user_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    require_role(current_user, PERSONNEL_ROLES)
    ensure_case_access(db, current_user, case_id)
    db_case = crud.get_case_by_id(db, case_id)
    if not db_case:
        raise HTTPException(status_code=404, detail="Case not found")

    stmt = models.case_personnel_association.delete().where(
        models.case_personnel_association.c.case_id == case_id,
        models.case_personnel_association.c.user_id == user_id,
    )
    db.execute(stmt)
    db.commit()
    return Response(status_code=204)


@router.post("/cases/{case_id}/clients", response_model=schemas.User)
def add_client_to_case(
    case_id: int,
    user_id: int,
    role_type: str = "client",
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    require_role(current_user, PERSONNEL_ROLES)
    ensure_case_access(db, current_user, case_id)
    client_user = crud.add_client_to_case(db, case_id=case_id, user_id=user_id, role_type=role_type)
    if not client_user:
        raise HTTPException(status_code=404, detail="Case not found")
    return client_user


@router.patch("/cases/{case_id}/clients/{user_id}/role", response_model=schemas.User)
def update_case_client_role(
    case_id: int,
    user_id: int,
    payload: schemas.CaseClientRoleUpdate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    require_role(current_user, PERSONNEL_ROLES)
    ensure_case_access(db, current_user, case_id)
    updated = crud.update_case_client_role(db, case_id=case_id, user_id=user_id, role_type=payload.role_type)
    if not updated:
        raise HTTPException(status_code=404, detail="Client assignment not found")
    client_user = crud.get_user_by_id(db, user_id)
    if not client_user:
        raise HTTPException(status_code=404, detail="Client not found")
    return client_user


@router.delete("/cases/{case_id}/clients/{user_id}", status_code=204)
def remove_client_from_case(
    case_id: int,
    user_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    require_role(current_user, PERSONNEL_ROLES)
    ensure_case_access(db, current_user, case_id)
    db_case = crud.get_case_by_id(db, case_id)
    if not db_case:
        raise HTTPException(status_code=404, detail="Case not found")

    client_user = crud.get_user_by_id(db, user_id)
    if not client_user:
        raise HTTPException(status_code=404, detail="User not found")

    if client_user in db_case.clients:
        db_case.clients.remove(client_user)
        if client_user.client_profile and client_user.client_profile.active_cases > 0:
            client_user.client_profile.active_cases -= 1
        db.commit()

    return Response(status_code=204)


@router.get("/cases/{case_id}/messages", response_model=List[schemas.Message])
def get_messages_for_case(
    case_id: int,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    ensure_case_access(db, current_user, case_id)
    return crud.get_case_messages(db, case_id=case_id, skip=skip, limit=limit)


@router.post("/cases/{case_id}/read")
def mark_case_as_read(
    case_id: int,
    payload: schemas.MarkReadPayload,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    ensure_case_access(db, current_user, case_id)
    updated_count = crud.mark_messages_as_read(db, case_id=case_id, reader_id=current_user.id)
    return {"status": "success", "updated_messages": updated_count}


@router.get("/cases/check-sms-tag")
def check_sms_tag(
    tag: str,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    require_role(current_user, PERSONNEL_ROLES)
    exists = db.query(models.Case).filter(models.Case.sms_id_tag == tag).first()
    return {"available": exists is None}


@router.get("/cases/{id}", response_model=schemas.Case)
def get_case_detail(
    id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    db_case = ensure_case_access(db, current_user, id)
    return _to_case_schema(db, db_case, 0, current_user)
