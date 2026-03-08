from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session
from typing import List, Optional

from .. import database, models, schemas, crud
from ..deps import get_current_user
from .utils import PERSONNEL_ROLES, require_role


router = APIRouter(tags=["clients"])


@router.get("/clients", response_model=List[schemas.User])
def get_clients_route(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    require_role(current_user, PERSONNEL_ROLES)
    return crud.get_all_clients(db, skip=skip, limit=limit)


@router.get("/clients/{client_id}", response_model=schemas.User)
def get_client_route(
    client_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    require_role(current_user, PERSONNEL_ROLES)
    client = crud.get_user_by_id(db, client_id)
    if not client or client.role != "client":
        raise HTTPException(status_code=404, detail="Client not found")
    return client


@router.post("/clients", response_model=schemas.User)
def create_client_route(
    client_data: schemas.UserCreate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    require_role(current_user, PERSONNEL_ROLES)
    client_data.role = "client"
    return crud.create_user(db, client_data)


@router.put("/clients/{client_id}", response_model=schemas.User)
def update_client_route(
    client_id: int,
    client_data: schemas.ClientUpdate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    require_role(current_user, PERSONNEL_ROLES)
    updated_client = crud.update_client(db, client_id, client_data)
    if not updated_client:
        raise HTTPException(status_code=404, detail="Client not found")
    return updated_client


@router.delete("/clients/{client_id}", status_code=204)
def delete_client_route(
    client_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    require_role(current_user, PERSONNEL_ROLES)
    success = crud.delete_user(db, client_id)
    if not success:
        raise HTTPException(status_code=404, detail="Client not found")
    return Response(status_code=204)


@router.get("/available-clients", response_model=List[schemas.User])
def get_available_clients_route(
    search: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    require_role(current_user, PERSONNEL_ROLES)
    return crud.get_all_clients(db, search_term=search, skip=skip, limit=limit)


@router.get("/available-personnel", response_model=List[schemas.User])
def get_available_personnel_route(
    search: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    require_role(current_user, PERSONNEL_ROLES)
    return crud.get_lawyers_and_personnel(db, search_term=search, skip=skip, limit=limit)
