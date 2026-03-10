from fastapi import HTTPException, Response
from sqlalchemy.orm import Session

from .. import auth, crud, models
from ..config import get_settings


settings = get_settings()

PERSONNEL_ROLES = {"lawyer", "accountant", "paralegal", "legal assistant", "admin"}
OAUTH_STATE_COOKIE = "oauth_state"
OAUTH_NONCE_COOKIE = "oauth_nonce"


def require_role(user: models.User, allowed_roles: set[str]):
    if user.role not in allowed_roles:
        raise HTTPException(status_code=403, detail="Forbidden")

def require_admin_user(user: models.User):
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin role required.")


def require_permission(db: Session, user: models.User, permission: str):
    if not crud.role_has_permission(db, user.role, permission):
        raise HTTPException(status_code=403, detail="Forbidden")


def ensure_case_access(db: Session, user: models.User, case_id: int) -> models.Case:
    case = crud.get_case_by_id(db, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    if user.role == "admin":
        return case
    if user.role == "client":
        if any(c.id == user.id for c in case.clients):
            return case
        raise HTTPException(status_code=403, detail="Forbidden")
    if user.role in PERSONNEL_ROLES:
        if any(p.id == user.id for p in case.personnel):
            return case
        raise HTTPException(status_code=403, detail="Forbidden")
    raise HTTPException(status_code=403, detail="Forbidden")


def set_auth_cookie(response: Response, user: models.User):
    token = auth.create_access_token({"sub": str(user.id), "role": user.role})
    max_age = settings.access_token_expire_minutes * 60
    response.set_cookie(
        settings.auth_cookie_name,
        token,
        httponly=True,
        samesite="none" if settings.environment == "production" else "lax",
        secure=True if settings.environment == "production" else settings.cookie_secure,
        max_age=max_age,
        path="/",
    )
