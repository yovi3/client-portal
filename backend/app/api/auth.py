import secrets
import requests
import hashlib
import base64
import logging

from fastapi import APIRouter, Depends, HTTPException, Response, Cookie
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from .. import auth, crud, models, schemas, database
from ..config import get_settings
from ..deps import get_current_user
from .utils import set_auth_cookie, OAUTH_STATE_COOKIE, OAUTH_NONCE_COOKIE


router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()
OAUTH_VERIFIER_COOKIE = "oauth_verifier"
AZURE_SCOPE = "openid profile email User.Read offline_access"
GRAPH_MEMBER_GROUPS_URL = "https://graph.microsoft.com/v1.0/me/getMemberGroups"
logger = logging.getLogger(__name__)


def _resolve_role_from_groups(group_ids: list[str]) -> tuple[str | None, str | None]:
    matches = {settings.azure_group_role_map.get(group_id) for group_id in group_ids}
    matches = {role for role in matches if role}
    for role in settings.azure_role_priority:
        if role in matches:
            return role, "azure_group_map"
    return None, None


def _fetch_graph_group_ids(access_token: str | None) -> list[str]:
    if not access_token:
        return []
    try:
        response = requests.post(
            GRAPH_MEMBER_GROUPS_URL,
            headers={"Authorization": f"Bearer {access_token}"},
            json={"securityEnabledOnly": False},
            timeout=10,
        )
        response.raise_for_status()
        data = response.json()
        values = data.get("value", [])
        if isinstance(values, list):
            return [str(value) for value in values]
    except Exception as exc:
        logger.warning("Failed to fetch Azure groups from Graph: %s", exc)
    return []


def _extract_group_ids(payload: dict, access_token: str | None) -> list[str]:
    token_groups = payload.get("groups")
    if isinstance(token_groups, list):
        return [str(group_id) for group_id in token_groups]

    claim_names = payload.get("_claim_names") or {}
    if isinstance(claim_names, dict) and "groups" in claim_names:
        return _fetch_graph_group_ids(access_token)

    return _fetch_graph_group_ids(access_token)


@router.post("/login", response_model=schemas.User)
def auth_login(
    credentials: schemas.UserLogin,
    response: Response,
    db: Session = Depends(database.get_db),
):
    user = crud.authenticate_user(db, credentials.email, credentials.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    if not user.auth_provider:
        user.auth_provider = "local"
    if not user.effective_role_source:
        user.effective_role_source = "local"
    db.commit()
    db.refresh(user)
    set_auth_cookie(response, user)
    return user


@router.post("/logout")
def auth_logout(response: Response):
    response.delete_cookie(settings.auth_cookie_name, path="/")
    return {"status": "ok"}


@router.get("/me", response_model=schemas.User)
def auth_me(current_user: models.User = Depends(get_current_user)):
    return current_user


@router.get("/azure/start")
def azure_start():
    state = secrets.token_urlsafe(32)
    nonce = secrets.token_urlsafe(32)
    verifier = secrets.token_urlsafe(64)
    challenge = base64.urlsafe_b64encode(
        hashlib.sha256(verifier.encode("utf-8")).digest()
    ).decode("utf-8").rstrip("=")

    auth_url = (
        f"https://login.microsoftonline.com/{settings.azure_tenant_id}/oauth2/v2.0/authorize"
        f"?client_id={settings.azure_client_id}"
        f"&response_type=code"
        f"&redirect_uri={settings.azure_redirect_uri}"
        f"&scope={AZURE_SCOPE.replace(' ', '%20')}"
        f"&response_mode=query"
        f"&state={state}"
        f"&nonce={nonce}"
        f"&code_challenge_method=S256"
        f"&code_challenge={challenge}"
    )

    response = RedirectResponse(url=auth_url)
    response.set_cookie(
        OAUTH_STATE_COOKIE, state, httponly=True, samesite="lax", secure=settings.cookie_secure, max_age=600, path="/"
    )
    response.set_cookie(
        OAUTH_NONCE_COOKIE, nonce, httponly=True, samesite="lax", secure=settings.cookie_secure, max_age=600, path="/"
    )
    response.set_cookie(
        OAUTH_VERIFIER_COOKIE, verifier, httponly=True, samesite="lax", secure=settings.cookie_secure, max_age=600, path="/"
    )
    return response


@router.get("/azure/callback")
def azure_callback(
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    error_description: str | None = None,
    oauth_state: str | None = Cookie(None, alias=OAUTH_STATE_COOKIE),
    oauth_nonce: str | None = Cookie(None, alias=OAUTH_NONCE_COOKIE),
    oauth_verifier: str | None = Cookie(None, alias=OAUTH_VERIFIER_COOKIE),
    db: Session = Depends(database.get_db),
):
    if error:
        raise HTTPException(status_code=400, detail=error_description or error)
    if not code or not state:
        raise HTTPException(status_code=400, detail="Missing authorization code or state")
    if not oauth_state or state != oauth_state:
        raise HTTPException(status_code=400, detail="Invalid OAuth state")
    if not oauth_verifier:
        raise HTTPException(status_code=400, detail="Missing PKCE verifier")

    token_url = f"https://login.microsoftonline.com/{settings.azure_tenant_id}/oauth2/v2.0/token"
    data = {
        "client_id": settings.azure_client_id,
        "client_secret": settings.azure_client_secret,
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": settings.azure_redirect_uri,
        "scope": AZURE_SCOPE,
        "code_verifier": oauth_verifier,
    }
    token_resp = requests.post(token_url, data=data, timeout=10)
    token_resp.raise_for_status()
    token_data = token_resp.json()
    id_token = token_data.get("id_token")
    access_token = token_data.get("access_token")
    if not id_token:
        raise HTTPException(status_code=401, detail="Missing id_token from Azure")

    payload = auth.verify_azure_token(id_token)
    token_nonce = payload.get("nonce")
    if oauth_nonce and token_nonce and oauth_nonce != token_nonce:
        raise HTTPException(status_code=401, detail="Invalid token nonce")

    aad_id = payload.get("oid")
    email = payload.get("preferred_username") or payload.get("email")
    name = payload.get("name") or email
    if not aad_id or not email:
        raise HTTPException(status_code=401, detail="Azure token missing oid or email")

    group_ids = _extract_group_ids(payload, access_token)
    resolved_role, role_source = _resolve_role_from_groups(group_ids)
    user = crud.upsert_azure_user(
        db=db,
        aad_object_id=aad_id,
        email=email,
        name=name or email,
        resolved_role=resolved_role,
        group_ids=group_ids,
        role_source=role_source,
        fallback_role=settings.azure_fallback_role or "client",
    )

    response = RedirectResponse(url=f"{settings.client_base_url}/dashboard")
    set_auth_cookie(response, user)
    response.delete_cookie(OAUTH_STATE_COOKIE, path="/")
    response.delete_cookie(OAUTH_NONCE_COOKIE, path="/")
    response.delete_cookie(OAUTH_VERIFIER_COOKIE, path="/")
    return response
