from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session
from typing import List, Optional

from .. import database, models, schemas, crud
from ..deps import get_current_user
from .utils import PERSONNEL_ROLES, require_role, require_admin_user


router = APIRouter(tags=["users"])
SUPPORTED_ROLES = set(crud.get_supported_roles())




@router.get("/users/{user_id}/unread-count", response_model=schemas.UnreadCountResponse)
def get_total_unread_count_route(
    user_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user.id != user_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    if current_user.role not in ['client', 'lawyer', 'accountant', 'paralegal', 'legal assistant', 'admin']:
        raise HTTPException(status_code=400, detail="Invalid role specified.")

    count = crud.get_total_unread_count(db, user_id=current_user.id, role=current_user.role)
    return schemas.UnreadCountResponse(total_unread_count=count)


@router.get("/users/{user_id}/notifications", response_model=schemas.NotificationResponse)
def get_user_notifications(
    user_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user.id != user_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    if current_user.role not in ['client', 'lawyer', 'accountant', 'paralegal', 'legal assistant', 'admin']:
        raise HTTPException(status_code=400, detail="Invalid role specified.")

    db_notifications = crud.get_unread_message_notifications(db, user_id=current_user.id, role=current_user.role)
    notifications_list = []
    for message, case_title, sender_name in db_notifications:
        snippet = (message.content[:40] + '...') if len(message.content) > 40 else message.content
        notifications_list.append(
            schemas.Notification(
                message_id=message.id,
                content_snippet=snippet,
                timestamp=message.timestamp,
                case_id=message.case_id,
                case_title=case_title,
                sender_name=sender_name,
            )
        )
    return schemas.NotificationResponse(notifications=notifications_list)


@router.get("/users/azure-sync", response_model=List[schemas.AzureUserSync])
def get_azure_sync_users(
    limit: int = 200,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    require_role(current_user, PERSONNEL_ROLES)
    return crud.get_azure_synced_users(db, limit=limit)


@router.get("/roles", response_model=List[str])
def get_supported_roles_route(
    current_user: models.User = Depends(get_current_user),
):
    require_admin_user(current_user)
    return crud.get_supported_roles()


@router.get("/roles/permissions", response_model=List[schemas.RolePermission])
def list_role_permissions_route(
    role: Optional[str] = None,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    require_admin_user(current_user)
    normalized_role = (role or "").strip().lower() or None
    if normalized_role and normalized_role not in SUPPORTED_ROLES:
        raise HTTPException(status_code=400, detail="Invalid role specified.")
    return crud.get_role_permissions(db, role=normalized_role)


@router.post("/roles/permissions", response_model=schemas.RolePermission)
def create_role_permission_route(
    payload: schemas.RolePermissionCreate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    require_admin_user(current_user)
    return crud.create_role_permission(db, role=payload.role, permission=payload.permission)


@router.delete("/roles/permissions/{permission_id}", status_code=204)
def delete_role_permission_route(
    permission_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    require_admin_user(current_user)
    deleted = crud.delete_role_permission(db, permission_id=permission_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Role permission not found.")
    return Response(status_code=204)


@router.get("/users", response_model=List[schemas.User])
def list_users_route(
    search: Optional[str] = None,
    role: Optional[str] = None,
    skip: int = 0,
    limit: int = 200,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    require_admin_user(current_user)
    if role and role not in SUPPORTED_ROLES:
        raise HTTPException(status_code=400, detail="Invalid role specified.")
    return crud.get_users(db, search_term=search, role=role, skip=skip, limit=limit)


@router.post("/users", response_model=schemas.User)
def create_user_route(
    user_data: schemas.UserCreate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    require_admin_user(current_user)
    normalized_role = (user_data.role or "").strip().lower()
    if normalized_role not in SUPPORTED_ROLES:
        raise HTTPException(status_code=400, detail="Invalid role specified.")
    existing = crud.get_user_by_email(db, user_data.email)
    if existing:
        raise HTTPException(status_code=409, detail="User with this email already exists.")

    create_payload = user_data.model_copy(update={"role": normalized_role})
    return crud.create_user(db, create_payload)


@router.patch("/users/{user_id}/role", response_model=schemas.User)
def update_user_role_route(
    user_id: int,
    role_data: schemas.UserRoleUpdate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    require_admin_user(current_user)
    updated_user = crud.update_user_role(
        db,
        user_id=user_id,
        new_role=role_data.role,
        acting_user_id=current_user.id,
    )
    if not updated_user:
        raise HTTPException(status_code=404, detail="User not found")
    return updated_user


@router.delete("/users/{user_id}", status_code=204)
def delete_user_route(
    user_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    require_admin_user(current_user)
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="You cannot delete your own account.")
    deleted = crud.delete_user(db, user_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="User not found")
    return Response(status_code=204)
