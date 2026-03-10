import secrets
import requests
import hashlib
import base64
import logging
import re

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
GRAPH_MEMBER_OF_URL = "https://graph.microsoft.com/v1.0/me/memberOf?$select=id,displayName"
logger = logging.getLogger(__name__)


def _normalize_group_key(group_key: str) -> str:
    return (group_key or "").strip().lower()


UUID_PATTERN = re.compile(
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$"
)


def _looks_like_uuid(value: str) -> bool:
    return bool(UUID_PATTERN.match((value or "").strip()))


def _contains_name_based_groups(values: list[str]) -> bool:
    return any(value and not _looks_like_uuid(value) for value in values)


def _resolve_role_from_groups(group_identifiers: list[str]) -> tuple[str | None, str | None]:
    normalized_identifiers = {_normalize_group_key(group_id) for group_id in group_identifiers}
    normalized_role_map = {
        _normalize_group_key(group_id): role
        for group_id, role in settings.azure_group_role_map.items()
    }
    matches = {normalized_role_map.get(group_id) for group_id in normalized_identifiers}
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


def _fetch_graph_group_names(access_token: str | None) -> list[str]:
    if not access_token:
        return []
    try:
        response = requests.get(
            GRAPH_MEMBER_OF_URL,
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=10,
        )
        response.raise_for_status()
        data = response.json()
        values = data.get("value", [])
        if not isinstance(values, list):
            return []
        names: list[str] = []
        for value in values:
            if not isinstance(value, dict):
                continue
            display_name = value.get("displayName")
            if display_name:
                names.append(str(display_name))
        return names
    except Exception as exc:
        logger.warning("Failed to fetch Azure group names from Graph: %s", exc)
    return []


def _extract_group_ids(payload: dict, access_token: str | None) -> list[str]:
    token_groups = payload.get("groups")
    if isinstance(token_groups, list):
        return [str(group_id) for group_id in token_groups]

    claim_names = payload.get("_claim_names") or {}
    if isinstance(claim_names, dict) and "groups" in claim_names:
        return _fetch_graph_group_ids(access_token)

    return _fetch_graph_group_ids(access_token)


def _extract_group_identifiers(payload: dict, access_token: str | None) -> tuple[list[str], list[str]]:
    group_ids = _extract_group_ids(payload, access_token)
    # Fetch group names only when config seems to rely on names.
    configured_group_keys = list(settings.azure_group_role_map.keys()) + list(settings.azure_allowed_group_ids)
    requires_name_lookup = any(key and not _looks_like_uuid(key) for key in configured_group_keys)
    group_names = _fetch_graph_group_names(access_token) if requires_name_lookup else []
    combined = list(dict.fromkeys([*group_ids, *group_names]))
    return group_ids, combined


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
    response.delete_cookie(
        settings.auth_cookie_name, 
        path="/",
        samesite="none" if settings.environment == "production" else "lax",
        secure=True if settings.environment == "production" else settings.cookie_secure,
    )
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
    try:
        token_resp.raise_for_status()
    except requests.exceptions.HTTPError as e:
        logger.error(f"Azure Token Exchange Error: {token_resp.text}")
        raise HTTPException(status_code=400, detail=f"Azure Token Exchange Error: {token_resp.text}")
    
    token_data = token_resp.json()
    try:
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
        token_tenant_id = payload.get("tid")
        if not aad_id or not email:
            raise HTTPException(status_code=401, detail="Azure token missing oid or email")
        if settings.azure_tenant_id and token_tenant_id != settings.azure_tenant_id:
            raise HTTPException(status_code=403, detail="Tenant is not allowed.")

        group_ids, group_identifiers = _extract_group_identifiers(payload, access_token)
        configured_allowed_groups = list(set(settings.azure_allowed_group_ids) or set(settings.azure_group_role_map.keys()))
        normalized_allowed_groups = {
            _normalize_group_key(group_id)
            for group_id in configured_allowed_groups
            if _normalize_group_key(group_id)
        }
        if not normalized_allowed_groups:
            raise HTTPException(status_code=500, detail="Azure allowed groups are not configured.")
        normalized_user_groups = {_normalize_group_key(group_id) for group_id in group_identifiers}
        uses_name_based_allowed_groups = _contains_name_based_groups(configured_allowed_groups)
        received_name_based_groups = _contains_name_based_groups(group_identifiers)
        if uses_name_based_allowed_groups and not received_name_based_groups:
            raise HTTPException(
                status_code=403,
                detail=(
                    "Access denied. Portal allowlist uses Entra group names, but this login returned only group IDs "
                    "(or no groups). Configure AZURE_GROUP_ROLE_MAP / AZURE_ALLOWED_GROUP_IDS with Entra group "
                    "Object IDs, or grant Microsoft Graph GroupMember.Read.All consent."
                ),
            )
        if not normalized_user_groups.intersection(normalized_allowed_groups):
            raise HTTPException(
                status_code=403,
                detail=(
                    "Access denied. Your Microsoft account is not assigned to this portal. "
                    "Please ask your administrator to add you to DSS-CP-Admin or DSS-CP-User."
                ),
            )
        resolved_role, role_source = _resolve_role_from_groups(group_identifiers)
        if not resolved_role:
            using_name_based_mapping = any(
                key and not _looks_like_uuid(key)
                for key in settings.azure_group_role_map.keys()
            )
            if using_name_based_mapping:
                raise HTTPException(
                    status_code=403,
                    detail=(
                        "Access denied. Group-name mapping is configured, but Microsoft Graph group-name access "
                        "is not available for this app. Ask your admin to grant GroupMember.Read.All consent "
                        "or switch AZURE_GROUP_ROLE_MAP keys to Entra group object IDs."
                    ),
                )
            raise HTTPException(
                status_code=403,
                detail=(
                    "Access denied. Your Microsoft group is recognized, but no portal role is configured. "
                    "Please ask an administrator to map your Entra group to a portal role."
                ),
            )

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

        response = RedirectResponse(url=settings.azure_post_login_redirect_url)
        set_auth_cookie(response, user)
        response.delete_cookie(OAUTH_STATE_COOKIE, path="/")
        response.delete_cookie(OAUTH_NONCE_COOKIE, path="/")
        response.delete_cookie(OAUTH_VERIFIER_COOKIE, path="/")
        return response
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error during Azure user processing/upsert: {str(e)}")
        raise HTTPException(status_code=400, detail=f"User Processing Error: {str(e)}")
