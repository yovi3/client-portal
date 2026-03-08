from fastapi import Cookie, Header, HTTPException, Depends
from sqlalchemy.orm import Session
from jose import JWTError

from . import database, crud
from .auth import decode_access_token
from .config import get_settings


settings = get_settings()


def _get_token_from_request(
    authorization: str | None = Header(None),
    access_token: str | None = Cookie(None, alias=settings.auth_cookie_name),
) -> str:
    if authorization and authorization.startswith("Bearer "):
        return authorization.split(" ", 1)[1]
    if access_token:
        return access_token
    raise HTTPException(status_code=401, detail="Not authenticated")


def get_current_user(
    token: str = Depends(_get_token_from_request),
    db: Session = Depends(database.get_db),
):
    try:
        payload = decode_access_token(token)
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
        user = crud.get_user_by_id(db, int(user_id))
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
