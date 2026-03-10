from sqlalchemy.orm import Session, joinedload
from sqlalchemy import update, func, and_, or_
from . import models, schemas, auth
from datetime import datetime, timedelta, timezone
from typing import Optional, Any, List, Tuple
import random
import string
import secrets 
import json
import hashlib
from fastapi import HTTPException # Import HTTPException for use in CRUD functions


PERSONNEL_ROLES = ('lawyer', 'accountant', 'paralegal', 'legal assistant')
STAFF_ROLES = PERSONNEL_ROLES + ('admin',)
VALID_USER_ROLES = ('client',) + STAFF_ROLES
CASE_CLIENT_ROLE_TYPES = {"client", "spouse", "legal guardian", "other"}

# =========================================================================
# 0. HELPER FUNCTIONS
# =========================================================================

def generate_sms_tag(db: Session) -> str:
    """Generates a unique 4-character SMS tag (e.g., A1B2)."""
    while True:
        tag = (
            random.choice(string.ascii_uppercase) +
            random.choice(string.digits) +
            random.choice(string.ascii_uppercase) +
            random.choice(string.digits)
        )
        existing_case = db.query(models.Case).filter(models.Case.sms_id_tag == tag).first()
        if not existing_case:
            return tag
            
def generate_secure_token(length: int = 32) -> str:
    """Generates a secure, unique token for passwordless access."""
    return secrets.token_urlsafe(length)


def generate_case_serial(db: Session, length: int = 8) -> str:
    alphabet = string.ascii_uppercase + string.digits
    while True:
        serial = "".join(secrets.choice(alphabet) for _ in range(length))
        existing_case = db.query(models.Case).filter(models.Case.case_serial == serial).first()
        if not existing_case:
            return serial


def generate_case_number(db: Session) -> int:
    """
    Generates the next unique numeric case number.
    Uses max+1 strategy with retry guard for unique conflicts.
    """
    for _ in range(10):
        max_case_number = db.query(func.max(models.Case.case_number)).scalar()
        next_number = (max_case_number or 0) + 1
        exists = db.query(models.Case.id).filter(models.Case.case_number == next_number).first()
        if not exists:
            return int(next_number)
    raise HTTPException(status_code=500, detail="Could not generate unique case number.")


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _coerce_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _normalize_phone_value(phone: Optional[str]) -> Optional[str]:
    value = (phone or "").strip()
    if not value:
        return None
    has_plus_prefix = value.startswith("+")
    digits = "".join(char for char in value if char.isdigit())
    if not digits:
        return None
    if has_plus_prefix:
        return f"+{digits}"
    return digits


def _phones_match(phone_a: Optional[str], phone_b: Optional[str]) -> bool:
    normalized_a = _normalize_phone_value(phone_a)
    normalized_b = _normalize_phone_value(phone_b)
    if not normalized_a or not normalized_b:
        return False
    if normalized_a == normalized_b:
        return True
    digits_a = normalized_a.lstrip("+")
    digits_b = normalized_b.lstrip("+")
    if digits_a == digits_b:
        return True
    if len(digits_a) >= 10 and len(digits_b) >= 10 and digits_a[-10:] == digits_b[-10:]:
        return True
    return False


# =========================================================================
# 1. UNIFIED USER CRUD
# =========================================================================

def get_user_by_email(db: Session, email: str) -> Optional[models.User]:
    """Retrieves any user (lawyer, client, or admin) by email."""
    return db.query(models.User)\
             .options(
                 joinedload(models.User.lawyer_profile),
                 joinedload(models.User.client_profile)
             )\
             .filter(models.User.email == email)\
             .first()

def get_user_by_id(db: Session, user_id: int) -> Optional[models.User]:
    """Retrieves any user by ID."""
    return db.query(models.User)\
             .options(
                 joinedload(models.User.lawyer_profile),
                 joinedload(models.User.client_profile)
             )\
             .filter(models.User.id == user_id)\
             .first()

def get_user_by_aad(db: Session, aad_id: str) -> Optional[models.User]:
    """Retrieves a user by Azure object ID, with fallback to legacy lawyer profile mapping."""
    user = db.query(models.User)\
             .options(
                 joinedload(models.User.lawyer_profile),
                 joinedload(models.User.client_profile)
             )\
             .filter(models.User.aad_object_id == aad_id)\
             .first()
    if user:
        return user

    return db.query(models.User) \
             .join(models.LawyerProfile) \
             .options(
                 joinedload(models.User.lawyer_profile),
                 joinedload(models.User.client_profile)
             )\
             .filter(models.LawyerProfile.aad_id == aad_id) \
             .first()

def get_user_by_phone(db: Session, phone_number: str) -> Optional[models.User]:
    """Retrieves a user based on the phone number in the client profile."""
    raw_phone = (phone_number or "").strip()
    normalized_phone = _normalize_phone_value(raw_phone)

    exact_candidates = [candidate for candidate in {raw_phone, normalized_phone} if candidate]
    profile = None
    if exact_candidates:
        profile = (
            db.query(models.ClientProfile)
            .filter(models.ClientProfile.phone.in_(exact_candidates))
            .first()
        )
    if not profile and normalized_phone:
        # Backward-compatible fallback for legacy formatted phone numbers.
        all_profiles = db.query(models.ClientProfile).filter(models.ClientProfile.phone.isnot(None)).all()
        profile = next(
            (candidate for candidate in all_profiles if _phones_match(candidate.phone, normalized_phone)),
            None,
        )
    if profile:
        return get_user_by_id(db, profile.user_id)
    return None

def create_user(db: Session, user_data: schemas.UserCreate) -> models.User:
    """
    Creates a User and the corresponding LawyerProfile or ClientProfile.
    """
    raw_password = user_data.password or secrets.token_urlsafe(24)
    hashed_pw = auth.hash_password(raw_password)
    profile_data = user_data.profile_data or {}
    
    db_user = models.User(
        email=user_data.email,
        name=user_data.name,
        hashed_password=hashed_pw,
        role=user_data.role,
        aad_object_id=profile_data.get("aad_object_id"),
        auth_provider=profile_data.get("auth_provider", "local"),
        last_azure_group_ids=profile_data.get("last_azure_group_ids"),
        last_azure_sync_at=profile_data.get("last_azure_sync_at"),
        effective_role_source=profile_data.get("effective_role_source"),
    )
    db.add(db_user)
    db.flush() 

    if user_data.role == 'lawyer':
        db_profile = models.LawyerProfile(
            user_id=db_user.id,
            bar_number=profile_data.get("bar_number", f"TEMP-{db_user.id}"),
            specialty=profile_data.get("specialty"),
            firm_name=profile_data.get("firm_name"),
            hourly_rate=profile_data.get("hourly_rate")
        )
        if "aad_id" in profile_data:
             db_profile.aad_id = profile_data["aad_id"]

    elif user_data.role == 'client':
        normalized_phone = _normalize_phone_value(profile_data.get("phone"))
        db_profile = models.ClientProfile(
            user_id=db_user.id,
            phone=normalized_phone,
            address=profile_data.get("address")
        )
    else:
        db_profile = None

    if db_profile:
        db.add(db_profile)
        
    db.commit()
    db.refresh(db_user)
    
    if db_user.role == 'lawyer':
        db.refresh(db_user, attribute_names=['lawyer_profile'])
    elif db_user.role == 'client':
        db.refresh(db_user, attribute_names=['client_profile'])
        
    return db_user


def _ensure_profile_for_role(db: Session, user: models.User, aad_id: Optional[str] = None) -> None:
    if user.role == 'lawyer':
        if not user.lawyer_profile:
            db.add(
                models.LawyerProfile(
                    user_id=user.id,
                    bar_number=f"TEMP-{user.id}",
                    aad_id=aad_id,
                )
            )
        elif aad_id and user.lawyer_profile.aad_id != aad_id:
            user.lawyer_profile.aad_id = aad_id
    elif user.role == 'client':
        if not user.client_profile:
            db.add(models.ClientProfile(user_id=user.id))


def upsert_azure_user(
    db: Session,
    aad_object_id: str,
    email: str,
    name: str,
    resolved_role: Optional[str],
    group_ids: List[str],
    role_source: Optional[str],
    fallback_role: str = "client",
) -> models.User:
    user = get_user_by_aad(db, aad_object_id)
    if not user and email:
        user = get_user_by_email(db, email)

    serialized_groups = json.dumps(sorted(set(group_ids)))
    now = datetime.now(timezone.utc)

    if user:
        user.email = email or user.email
        user.name = name or user.name
        if resolved_role:
            user.role = resolved_role
            user.effective_role_source = role_source or "azure_group_map"
        user.aad_object_id = aad_object_id
        user.auth_provider = "azure"
        user.last_azure_group_ids = serialized_groups
        user.last_azure_sync_at = now
        _ensure_profile_for_role(db, user, aad_object_id)
        db.commit()
        db.refresh(user)
        return get_user_by_id(db, user.id)

    final_role = resolved_role or fallback_role or "client"
    final_role_source = role_source or "azure_fallback"

    profile_data: dict[str, Any] = {
        "aad_object_id": aad_object_id,
        "auth_provider": "azure",
        "last_azure_group_ids": serialized_groups,
        "last_azure_sync_at": now,
        "effective_role_source": final_role_source,
    }
    if final_role == "lawyer":
        profile_data["bar_number"] = f"AAD-{aad_object_id[:8]}"
        profile_data["aad_id"] = aad_object_id

    user_data = schemas.UserCreate(
        email=email,
        name=name or email,
        password=secrets.token_urlsafe(24),
        role=final_role,
        profile_data=profile_data,
    )
    return create_user(db, user_data)

def authenticate_user(db: Session, email: str, password: str) -> Optional[models.User]:
    """Authenticates any user type based on email and password."""
    user = get_user_by_email(db, email)
    if not user:
        return None
    if not auth.verify_password(password, user.hashed_password):
        return None
    return user

# =========================================================================
# 2. READ ACCESS FUNCTIONS (UPDATED FOR SEARCH)
# =========================================================================


def get_lawyers_and_personnel(db: Session, search_term: Optional[str] = None, skip: int = 0, limit: int = 100):
    """Retrieves all users with 'lawyer', 'accountant', 'paralegal', or 'legal assistant' roles."""
    query = db.query(models.User)\
             .options(joinedload(models.User.lawyer_profile))\
             .filter(models.User.role.in_(['lawyer', 'accountant', 'paralegal', 'legal assistant']))
             
    if search_term:
        search_like = f"%{search_term}%"
        query = query.filter(models.User.name.ilike(search_like))
        
    return query.offset(skip).limit(limit).all()

def get_all_clients(db: Session, search_term: Optional[str] = None, skip: int = 0, limit: int = 100):
    """Retrieves all users with the 'client' role with optional search."""
    query = db.query(models.User)\
             .options(joinedload(models.User.client_profile))\
             .filter(models.User.role == 'client')
             
    if search_term:
        search_like = f"%{search_term}%"
        query = query.filter(models.User.name.ilike(search_like) | models.User.email.ilike(search_like))
        
    return query.offset(skip).limit(limit).all()


def get_users(
    db: Session,
    search_term: Optional[str] = None,
    role: Optional[str] = None,
    skip: int = 0,
    limit: int = 200,
):
    query = db.query(models.User).options(
        joinedload(models.User.lawyer_profile),
        joinedload(models.User.client_profile),
    )

    if role:
        query = query.filter(models.User.role == role)

    if search_term:
        search_like = f"%{search_term}%"
        query = query.filter(
            or_(
                models.User.name.ilike(search_like),
                models.User.email.ilike(search_like),
            )
        )

    return query.order_by(models.User.id.asc()).offset(skip).limit(limit).all()


def get_supported_roles() -> List[str]:
    return list(VALID_USER_ROLES)


def get_role_permissions(db: Session, role: Optional[str] = None) -> List[models.RolePermission]:
    query = db.query(models.RolePermission)
    if role:
        query = query.filter(models.RolePermission.role == role)
    return query.order_by(models.RolePermission.role.asc(), models.RolePermission.permission.asc()).all()


def role_has_permission(db: Session, role: str, permission: str) -> bool:
    normalized_role = (role or "").strip().lower()
    normalized_permission = (permission or "").strip().lower()
    if not normalized_role or not normalized_permission:
        return False
    return (
        db.query(models.RolePermission.id)
        .filter(
            models.RolePermission.role == normalized_role,
            models.RolePermission.permission == normalized_permission,
        )
        .first()
        is not None
    )


def create_role_permission(
    db: Session,
    role: str,
    permission: str,
) -> models.RolePermission:
    normalized_role = (role or "").strip().lower()
    normalized_permission = (permission or "").strip().lower()
    if normalized_role not in VALID_USER_ROLES:
        raise HTTPException(status_code=400, detail="Invalid role specified.")
    if not normalized_permission:
        raise HTTPException(status_code=400, detail="Permission is required.")

    existing = (
        db.query(models.RolePermission)
        .filter(
            models.RolePermission.role == normalized_role,
            models.RolePermission.permission == normalized_permission,
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="Permission already exists for this role.")

    record = models.RolePermission(role=normalized_role, permission=normalized_permission)
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def delete_role_permission(db: Session, permission_id: int) -> bool:
    record = db.query(models.RolePermission).filter(models.RolePermission.id == permission_id).first()
    if not record:
        return False
    db.delete(record)
    db.commit()
    return True


def _hash_invite_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _invite_status(invite: models.Invite, now: Optional[datetime] = None) -> str:
    timestamp = _coerce_utc(now) if now else _utc_now()
    if invite.used_at:
        return "used"
    if _coerce_utc(invite.expires_at) <= timestamp:
        return "expired"
    return "pending"


def serialize_invite(invite: models.Invite) -> dict[str, Any]:
    return {
        "id": invite.id,
        "invited_email": invite.invited_email,
        "role": invite.role,
        "invited_by_user_id": invite.invited_by_user_id,
        "expires_at": invite.expires_at,
        "used_at": invite.used_at,
        "accepted_user_id": invite.accepted_user_id,
        "created_at": invite.created_at,
        "status": _invite_status(invite),
        "prefill_first_name": invite.prefill_first_name,
        "prefill_last_name": invite.prefill_last_name,
        "prefill_phone": invite.prefill_phone,
        "prefill_address": invite.prefill_address,
    }


def create_invite(
    db: Session,
    email: str,
    invited_by_user_id: int,
    expires_days: int,
    first_name: Optional[str] = None,
    last_name: Optional[str] = None,
    phone: Optional[str] = None,
    address: Optional[str] = None,
) -> Tuple[models.Invite, str]:
    normalized_email = (email or "").strip().lower()
    if not normalized_email:
        raise HTTPException(status_code=400, detail="Email is required.")
    if get_user_by_email(db, normalized_email):
        raise HTTPException(status_code=409, detail="User with this email already exists.")

    raw_token = secrets.token_urlsafe(48)
    token_hash = _hash_invite_token(raw_token)
    now = _utc_now()
    expires_at = now + timedelta(days=max(1, expires_days))

    invite = models.Invite(
        invited_email=normalized_email,
        role="client",
        token_hash=token_hash,
        invited_by_user_id=invited_by_user_id,
        expires_at=expires_at,
        prefill_first_name=(first_name or "").strip() or None,
        prefill_last_name=(last_name or "").strip() or None,
        prefill_phone=(phone or "").strip() or None,
        prefill_address=(address or "").strip() or None,
    )
    db.add(invite)
    db.commit()
    db.refresh(invite)
    return invite, raw_token


def list_invites(
    db: Session,
    status: Optional[str] = None,
    skip: int = 0,
    limit: int = 200,
) -> List[models.Invite]:
    query = db.query(models.Invite)
    now = _utc_now()
    normalized_status = (status or "").strip().lower()
    if normalized_status == "pending":
        query = query.filter(models.Invite.used_at.is_(None), models.Invite.expires_at > now)
    elif normalized_status == "used":
        query = query.filter(models.Invite.used_at.isnot(None))
    elif normalized_status == "expired":
        query = query.filter(models.Invite.used_at.is_(None), models.Invite.expires_at <= now)
    elif normalized_status:
        raise HTTPException(status_code=400, detail="Invalid invite status.")
    return query.order_by(models.Invite.created_at.desc(), models.Invite.id.desc()).offset(skip).limit(limit).all()


def get_invite_by_token(db: Session, token: str) -> Optional[models.Invite]:
    token_hash = _hash_invite_token(token)
    return db.query(models.Invite).filter(models.Invite.token_hash == token_hash).first()


def get_valid_invite_by_token(db: Session, token: str) -> models.Invite:
    invite = get_invite_by_token(db, token)
    if not invite:
        raise HTTPException(status_code=404, detail="Invite not found.")
    if invite.used_at:
        raise HTTPException(status_code=400, detail="Invite already used.")
    if _coerce_utc(invite.expires_at) <= _utc_now():
        raise HTTPException(status_code=400, detail="Invite expired.")
    return invite


def accept_invite(
    db: Session,
    token: str,
    first_name: str,
    last_name: str,
    phone: str,
    address: str,
    password: str,
) -> models.User:
    invite = get_valid_invite_by_token(db, token)

    existing = get_user_by_email(db, invite.invited_email)
    if existing:
        raise HTTPException(status_code=409, detail="User with this email already exists.")

    full_name = f"{(first_name or '').strip()} {(last_name or '').strip()}".strip()
    if not full_name:
        raise HTTPException(status_code=400, detail="First name and last name are required.")

    user = create_user(
        db,
        schemas.UserCreate(
            email=invite.invited_email,
            name=full_name,
            password=password,
            role="client",
            profile_data={
                "phone": (phone or "").strip(),
                "address": (address or "").strip(),
                "auth_provider": "local",
                "effective_role_source": "invite",
            },
        ),
    )
    invite.used_at = _utc_now()
    invite.accepted_user_id = user.id
    db.commit()
    db.refresh(user)
    return user


def update_user_role(
    db: Session,
    user_id: int,
    new_role: str,
    acting_user_id: Optional[int] = None,
) -> Optional[models.User]:
    normalized_role = (new_role or "").strip().lower()
    if normalized_role not in VALID_USER_ROLES:
        raise HTTPException(status_code=400, detail="Invalid role specified.")

    user = get_user_by_id(db, user_id)
    if not user:
        return None

    if acting_user_id is not None and user.id == acting_user_id:
        raise HTTPException(status_code=400, detail="You cannot change your own role.")

    if user.role == normalized_role:
        return user

    personnel_assignment_count = (
        db.query(models.case_personnel_association)
        .filter(models.case_personnel_association.c.user_id == user.id)
        .count()
    )
    client_assignment_count = (
        db.query(models.case_client_association)
        .filter(models.case_client_association.c.client_id == user.id)
        .count()
    )

    if normalized_role == "client" and personnel_assignment_count > 0:
        raise HTTPException(
            status_code=409,
            detail="Remove this user from personnel case assignments before setting role to client.",
        )

    if normalized_role in STAFF_ROLES and client_assignment_count > 0:
        raise HTTPException(
            status_code=409,
            detail="Remove this user from client case assignments before setting a personnel/admin role.",
        )

    user.role = normalized_role
    user.effective_role_source = "manual_admin"
    _ensure_profile_for_role(db, user, user.aad_object_id)
    db.commit()
    db.refresh(user)
    return get_user_by_id(db, user.id)


# =========================================================================
# 3. CASE CRUD (UPDATED FOR M2M)
# =========================================================================

comprehensive_case_load = [
    joinedload(models.Case.clients).joinedload(models.User.client_profile),
    joinedload(models.Case.personnel).joinedload(models.User.lawyer_profile)
]

def _get_user_case_association(role: str):
    if role == 'client':
        return models.case_client_association, models.case_client_association.c.client_id
    elif role in PERSONNEL_ROLES or role == 'admin':
        return models.case_personnel_association, models.case_personnel_association.c.user_id
    return None, None


def _normalize_case_client_role(role_type: str | None) -> str:
    normalized = (role_type or "client").strip().lower()
    if normalized not in CASE_CLIENT_ROLE_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid client case role: {role_type}")
    return normalized


def get_case_client_roles_map(db: Session, case_id: int) -> dict[int, str]:
    rows = (
        db.query(
            models.case_client_association.c.client_id,
            models.case_client_association.c.role_type,
        )
        .filter(models.case_client_association.c.case_id == case_id)
        .all()
    )
    return {client_id: role_type for client_id, role_type in rows}

def get_case_by_id(db: Session, case_id: int) -> Optional[models.Case]:
    """Retrieves a single case with full data loading."""
    return db.query(models.Case)\
             .options(*comprehensive_case_load)\
             .filter(models.Case.id == case_id)\
             .first()

def get_cases(db: Session, skip: int = 0, limit: int = 100):
    """Gets all cases, loading all related user and profile data."""
    return db.query(models.Case)\
             .options(*comprehensive_case_load)\
             .offset(skip).limit(limit).all()

# ✅ MODIFIED for M2M
def get_lawyer_cases(db: Session, lawyer_id: int) -> List[Tuple[models.Case, int]]:
    """
    Retrieves cases for a lawyer where they are assigned personnel, 
    counting unread messages (not sent by this lawyer).
    """
    
    # 1. Subquery to find cases assigned to this lawyer
    association_table, user_id_column = _get_user_case_association('lawyer')
    assigned_cases_subquery = db.query(association_table.c.case_id).filter(
        user_id_column == lawyer_id
    ).subquery()
    
    # 2. Subquery to count unread messages in those cases
    unread_subquery = (
        db.query(
            models.Message.case_id,
            func.count(models.Message.id).label("unread_count")
        )
        .filter(
            models.Message.is_read == False,
            models.Message.sender_id != lawyer_id,  # Count messages NOT from the lawyer
            models.Message.case_id.in_(assigned_cases_subquery)
        )
        .group_by(models.Message.case_id)
        .subquery()
    )

    # 3. Main query
    return (
        db.query(
            models.Case,
            func.coalesce(unread_subquery.c.unread_count, 0)
        )
        .join(assigned_cases_subquery, models.Case.id == assigned_cases_subquery.c.case_id)
        .outerjoin(unread_subquery, models.Case.id == unread_subquery.c.case_id)
        .options(*comprehensive_case_load)
        .all()
    )

# ✅ MODIFIED for M2M
def get_client_cases(db: Session, client_id: int) -> List[Tuple[models.Case, int]]:
    """
    Retrieves cases for a client, counting unread messages (not sent by this client).
    """
    
    # 1. Subquery to find cases assigned to this client
    association_table, user_id_column = _get_user_case_association('client')
    assigned_cases_subquery = db.query(association_table.c.case_id).filter(
        user_id_column == client_id
    ).subquery()
    
    # 2. Subquery to count unread messages in those cases
    unread_subquery = (
        db.query(
            models.Message.case_id,
            func.count(models.Message.id).label("unread_count")
        )
        .filter(
            models.Message.is_read == False,
            models.Message.sender_id != client_id, # Count messages NOT from the client
            models.Message.case_id.in_(assigned_cases_subquery)
        )
        .group_by(models.Message.case_id)
        .subquery()
    )

    # 3. Main query
    return (
        db.query(
            models.Case,
            func.coalesce(unread_subquery.c.unread_count, 0)
        )
        .join(assigned_cases_subquery, models.Case.id == assigned_cases_subquery.c.case_id)
        .outerjoin(unread_subquery, models.Case.id == unread_subquery.c.case_id)
        .options(*comprehensive_case_load)
        .all()
    )

# NOWA FUNKCJA - Używa M2M
def get_active_cases_by_client_id(db: Session, client_id: int) -> List[models.Case]:
    """Returns a list of active cases for a client."""
    
    # Select cases where the client_id is present in the association table
    return db.query(models.Case)\
             .join(models.case_client_association)\
             .filter(
                 models.case_client_association.c.client_id == client_id, 
                 models.Case.status == 'active'
             )\
             .all()

# NOWA FUNKCJA - Używa M2M
def get_case_by_client_id(db: Session, case_id: int, client_id: int) -> Optional[models.Case]:
    """Ensures a case exists AND the client is assigned to it."""
    return db.query(models.Case)\
             .join(models.case_client_association)\
             .filter(
                 models.Case.id == case_id,
                 models.case_client_association.c.client_id == client_id
             )\
             .first()

# ZMODYFIKOWANA FUNKCJA
def create_case(db: Session, case: schemas.CaseCreate) -> models.Case:
    client_assignments = list(case.client_assignments or [])
    if not client_assignments:
        client_assignments = [
            schemas.CaseClientAssignmentIn(user_id=client_id, role_type="client")
            for client_id in (case.client_ids or [])
        ]

    if not client_assignments:
        raise HTTPException(status_code=400, detail="Case must include at least one client assignment.")

    # 1. Prepare base data
    db_case = models.Case(
        title=case.title,
        description=case.description,
        case_number=generate_case_number(db),
        case_serial=generate_case_serial(db),
        sms_id_tag=generate_sms_tag(db),
    )
    db.add(db_case)
    db.flush()
    
    # 2. Assign Clients (M2M)
    for client_assignment in client_assignments:
        client_user = get_user_by_id(db, client_assignment.user_id)
        if client_user and client_user.role == 'client':
            role_type = _normalize_case_client_role(client_assignment.role_type)
            db.execute(
                models.case_client_association.insert().values(
                    case_id=db_case.id,
                    client_id=client_user.id,
                    role_type=role_type,
                )
            )
        else:
            raise HTTPException(
                status_code=400,
                detail=f"User ID {client_assignment.user_id} is not a valid client.",
            )

    # 3. Assign Personnel (M2M)
    # This requires manually inserting into the association table to set the 'role'
    for personnel_id in case.personnel_ids:
        personnel_user = get_user_by_id(db, personnel_id)
        if personnel_user and personnel_user.role in PERSONNEL_ROLES:
            # Use Core SQL approach to insert into the association table
            stmt = models.case_personnel_association.insert().values(
                case_id=db_case.id,
                user_id=personnel_user.id,
                role=personnel_user.role # Store the role at assignment time
            )
            db.execute(stmt)
        else:
            raise HTTPException(status_code=400, detail=f"User ID {personnel_id} is not valid personnel.")

    db.commit()
    db.refresh(db_case)
    
    # Refresh to ensure relationships are loaded
    db.refresh(db_case, attribute_names=['clients', 'personnel'])
    
    # 4. Increment active_cases counter only after successful commit
    for client_assignment in client_assignments:
        client_user = get_user_by_id(db, client_assignment.user_id)
        if client_user and client_user.client_profile:
            client_user.client_profile.active_cases += 1
    db.commit()

    
    return db_case


def add_client_to_case(
    db: Session,
    case_id: int,
    user_id: int,
    role_type: str = "client",
) -> Optional[models.User]:
    db_case = get_case_by_id(db, case_id)
    if not db_case:
        return None

    client_user = get_user_by_id(db, user_id)
    if not client_user or client_user.role != "client":
        raise HTTPException(status_code=400, detail=f"User ID {user_id} is not a valid client.")

    normalized_role = _normalize_case_client_role(role_type)
    existing = (
        db.query(models.case_client_association)
        .filter(
            models.case_client_association.c.case_id == case_id,
            models.case_client_association.c.client_id == user_id,
        )
        .first()
    )

    if existing:
        db.execute(
            models.case_client_association.update()
            .where(
                models.case_client_association.c.case_id == case_id,
                models.case_client_association.c.client_id == user_id,
            )
            .values(role_type=normalized_role)
        )
    else:
        db.execute(
            models.case_client_association.insert().values(
                case_id=case_id,
                client_id=user_id,
                role_type=normalized_role,
            )
        )
        if client_user.client_profile:
            client_user.client_profile.active_cases += 1

    db.commit()
    return client_user


def update_case_client_role(
    db: Session,
    case_id: int,
    user_id: int,
    role_type: str,
) -> bool:
    normalized_role = _normalize_case_client_role(role_type)
    result = db.execute(
        models.case_client_association.update()
        .where(
            models.case_client_association.c.case_id == case_id,
            models.case_client_association.c.client_id == user_id,
        )
        .values(role_type=normalized_role)
    )
    db.commit()
    return bool(result.rowcount)

# =========================================================================
# 4. MESSAGE CRUD (Simplified Sender ID)
# =========================================================================

# ZMODYFIKOWANA FUNKCJA
def create_message(db: Session, message: schemas.MessageCreate) -> models.Message:
    """
    Creates a message using only the sender_id.
    """
    db_message = models.Message(
        content=message.content,
        case_id=message.case_id,
        sender_id=message.sender_id,
        channel=message.channel, 
        message_type=message.message_type # Added type
    )
    db.add(db_message)
    db.commit()
    db.refresh(db_message)
    return db_message

def get_message_by_id(db: Session, message_id: int) -> Optional[models.Message]:
    """Retrieves a single message by ID, fully loading sender and profile data."""
    return db.query(models.Message) \
             .options(
                 joinedload(models.Message.sender_user)
                     .joinedload(models.User.lawyer_profile),
                 joinedload(models.Message.sender_user)
                     .joinedload(models.User.client_profile),
                 joinedload(models.Message.document_request)
                     .joinedload(models.DocumentRequest.requested_documents)
             ) \
             .filter(models.Message.id == message_id) \
             .first()

def get_case_messages(db: Session, case_id: int, skip: int = 0, limit: int = 100):
    """Retrieves messages for a case, eagerly loading sender information."""
    return db.query(models.Message)\
             .options(
                 joinedload(models.Message.sender_user)
                     .joinedload(models.User.lawyer_profile),
                 joinedload(models.Message.sender_user)
                     .joinedload(models.User.client_profile),
                 joinedload(models.Message.document_request)
                     .joinedload(models.DocumentRequest.requested_documents)
             )\
             .filter(models.Message.case_id == case_id)\
             .order_by(models.Message.timestamp.asc())\
             .offset(skip).limit(limit).all()
             
def mark_messages_as_read(db: Session, case_id: int, reader_id: int) -> int:
    """
    Marks all unread messages in a case as read, for a specific reader.
    Returns the number of messages updated.
    """
    
    stmt = (
        update(models.Message)
        .where(
            models.Message.case_id == case_id,
            models.Message.is_read == False,
            models.Message.sender_id != reader_id
        )
        .values(is_read=True)
    )
    
    result = db.execute(stmt)
    db.commit()
    
    return result.rowcount

def get_total_unread_count(db: Session, user_id: int, role: str) -> int:
    """
    Calculates the total number of unread messages for a user across all their cases.
    (MODIFIED for M2M relationships)
    """
    
    query = db.query(func.count(models.Message.id)).join(
        models.Case, models.Message.case_id == models.Case.id
    ).filter(
        models.Message.is_read == False,
        models.Message.sender_id != user_id
    )

    # Filter cases based on the user's role using the association tables
    association_table, user_id_column = _get_user_case_association(role)
    if not association_table is not None:
        return 0
        
    query = query.join(association_table, association_table.c.case_id == models.Case.id).filter(
        user_id_column == user_id
    )

    count = query.scalar()
    return count if count is not None else 0

def get_unread_message_notifications(db: Session, user_id: int, role: str, limit: int = 5) -> List[Tuple[models.Message, str, str]]:
    
    # 1. Determine the correct association table for filtering
    association_table, user_id_column = _get_user_case_association(role)
    if association_table is None or user_id_column is None:
        return []
    
    # 2. Subquery to find the latest unread message timestamp per case, filtered by assignment
    subq = (
        db.query(
            models.Message.case_id,
            func.max(models.Message.timestamp).label("latest_timestamp")
        )
        .join(models.Case, models.Message.case_id == models.Case.id)
        .join(association_table, models.Case.id == association_table.c.case_id) # Direct join on case ID
        .filter(
            models.Message.is_read == False,
            models.Message.sender_id != user_id,
            user_id_column == user_id # Filter assignment
        )
        .group_by(models.Message.case_id)
        .subquery()
    )
    
    # 3. Main query to fetch the messages and related data
    results = (
        db.query(
            models.Message,
            models.Case.title,
            models.User.name.label("sender_name")
        )
        .join(subq, and_(
            models.Message.case_id == subq.c.case_id,
            models.Message.timestamp == subq.c.latest_timestamp
        ))
        .join(models.Case, models.Message.case_id == models.Case.id)
        .join(models.User, models.Message.sender_id == models.User.id)
        .order_by(models.Message.timestamp.desc())
        .limit(limit)
        .all()
    )
    
    return results

# =========================================================================
# 5. AWAITING SMS CRUD
# =========================================================================

def create_awaiting_sms(db: Session, phone: str, body: str, client_id: Optional[int] = None) -> models.AwaitingSMS:
    normalized_phone = _normalize_phone_value(phone) or (phone or "").strip()
    db_awaiting = models.AwaitingSMS(
        client_phone_number=normalized_phone,
        sms_body=body,
        client_id=client_id
    )
    db.add(db_awaiting)
    db.commit()
    db.refresh(db_awaiting)
    return db_awaiting

def get_awaiting_sms(
    db: Session,
    skip: int = 0,
    limit: int = 20,
    client_id: Optional[int] = None,
) -> List[models.AwaitingSMS]:
    """Retrieves pending SMS inbox messages, optionally filtered by client."""
    query = (
        db.query(models.AwaitingSMS)
        .options(joinedload(models.AwaitingSMS.client))
        .filter(models.AwaitingSMS.status == "pending")
    )
    if client_id is not None:
        query = query.filter(models.AwaitingSMS.client_id == client_id)
    return query.order_by(models.AwaitingSMS.received_at.desc()).offset(skip).limit(limit).all()

def get_awaiting_sms_by_id(db: Session, sms_id: int) -> Optional[models.AwaitingSMS]:
    """Retrieves one pending SMS message."""
    return db.query(models.AwaitingSMS)\
             .filter(models.AwaitingSMS.id == sms_id)\
             .first()

def update_awaiting_sms_status(
    db: Session,
    sms_id: int,
    status: str,
    assigned_case_id: Optional[int] = None,
    assigned_by_user_id: Optional[int] = None,
) -> Optional[models.AwaitingSMS]:
    """Updates the status of a pending SMS (e.g., to 'resolved')."""
    db_sms = get_awaiting_sms_by_id(db, sms_id)
    if db_sms:
        db_sms.status = status
        if assigned_case_id is not None:
            db_sms.assigned_case_id = assigned_case_id
            db_sms.assigned_at = datetime.now(timezone.utc)
        if assigned_by_user_id is not None:
            db_sms.assigned_by_user_id = assigned_by_user_id
        db.commit()
        db.refresh(db_sms)
    return db_sms


def get_sms_inbox_threads(
    db: Session,
    skip: int = 0,
    limit: int = 100,
) -> List[schemas.SMSInboxThread]:
    results = (
        db.query(
            models.AwaitingSMS.client_id,
            models.AwaitingSMS.client_phone_number,
            func.count(models.AwaitingSMS.id).label("pending_count"),
            func.max(models.AwaitingSMS.received_at).label("last_received_at"),
            models.User.name.label("client_name")
        )
        .outerjoin(models.User, models.AwaitingSMS.client_id == models.User.id)
        .filter(models.AwaitingSMS.status == "pending")
        .group_by(models.AwaitingSMS.client_id, models.AwaitingSMS.client_phone_number, models.User.name)
        .order_by(func.max(models.AwaitingSMS.received_at).desc())
        .offset(skip)
        .limit(limit)
        .all()
    )

    return [
        schemas.SMSInboxThread(
            client_id=r.client_id,
            client_phone_number=r.client_phone_number,
            pending_count=r.pending_count,
            last_received_at=r.last_received_at,
            client_name=r.client_name,
        )
        for r in results
    ]


def reconcile_pending_sms_client_matches(db: Session) -> int:
    """Best-effort backfill: link pending SMS rows to clients by phone."""
    pending_unknown = (
        db.query(models.AwaitingSMS)
        .filter(models.AwaitingSMS.status == "pending", models.AwaitingSMS.client_id.is_(None))
        .all()
    )
    updated = 0
    for row in pending_unknown:
        matched_user = get_user_by_phone(db, row.client_phone_number)
        if matched_user:
            row.client_id = matched_user.id
            updated += 1
    if updated:
        db.commit()
    return updated

# =========================================================================
# 6. DOCUMENT REQUEST CRUD
# =========================================================================

def create_document_request(
    db: Session, 
    case_id: int, 
    request_data: schemas.DocumentRequestCreate
) -> models.DocumentRequest:
    """
    Creates a new document request and associated elements.
    Generates a unique access token.
    """
    if not request_data.lawyer_id:
        raise HTTPException(status_code=400, detail="Lawyer ID missing")
    
    # 1. Generating Token and expiry date (7 days)
    token = generate_secure_token()
    token_expiry = datetime.now(timezone.utc) + timedelta(days=7) 

    db_request = models.DocumentRequest(
        case_id=case_id,
        lawyer_id=request_data.lawyer_id,
        access_token=token,
        token_expires_at=token_expiry,
        status="pending",
        deadline=request_data.deadline,
        note=request_data.note,
    )
    
    db.add(db_request)
    db.flush() 

    # 2. Creating the list of required documents
    for item in request_data.required_items:
        db_doc = models.RequestedDocument(
            request_id=db_request.id,
            name=item.name,
            status="required"
        )
        db.add(db_doc)

    # 3. Adding a message to the chat (for history)
    chat_message_content = f"Formal document request ({len(request_data.required_items)} items) sent to client(s). {request_data.note if request_data.note else ''}"
    
    message_in = schemas.MessageCreate(
        content=chat_message_content,
        case_id=case_id,
        sender_id=request_data.lawyer_id,
        channel="portal",
        message_type="document_request"
    )
    # Crucial: Must use the updated create_message that accepts message_type
    chat_message = create_message(db, message=message_in)
    db_request.message_id = chat_message.id
    
    db.commit()
    db.refresh(db_request)
    
    return db_request

def get_document_request_by_token(db: Session, token: str) -> Optional[models.DocumentRequest]:
    """Retrieves a document request by unique token and checks for expiry."""
    request = db.query(models.DocumentRequest).options(
        joinedload(models.DocumentRequest.requested_documents),
        joinedload(models.DocumentRequest.case).joinedload(models.Case.clients),
        joinedload(models.DocumentRequest.case).joinedload(models.Case.personnel),
    ).filter(
        models.DocumentRequest.access_token == token,
        models.DocumentRequest.token_expires_at > datetime.now(timezone.utc)
    ).first()
    return request

def get_all_requests_by_case(db: Session, case_id: int) -> List[models.DocumentRequest]:
    """Retrieves all document requests for a case."""
    return db.query(models.DocumentRequest).filter(
        models.DocumentRequest.case_id == case_id
    ).options(
        joinedload(models.DocumentRequest.requested_documents)
    ).all()
    
def get_document_request_by_id(db: Session, request_id: int):
    """
    Retrieves a DocumentRequest by its primary key (ID).
    """
    return db.query(models.DocumentRequest).filter(models.DocumentRequest.id == request_id).first()


def get_requested_document_by_id(db: Session, doc_id: int):
    """
    Retrieves a single RequestedDocument by its primary key (ID).
    """
    return db.query(models.RequestedDocument).filter(models.RequestedDocument.id == doc_id).first()

# In crud.py

def get_all_user_documents(db: Session, user_id: int, role: str) -> List[Any]:
    """
    Fetches all uploaded documents accessible to a specific user based on case assignments.
    """
    # 1. Start with the base query: RequestedDocument -> DocumentRequest -> Case
    query = db.query(
        models.RequestedDocument,
        models.Case.title.label("case_title"),
        models.Case.id.label("case_id"),
        models.DocumentRequest.created_at.label("request_date")
    ).join(
        models.DocumentRequest, models.RequestedDocument.request_id == models.DocumentRequest.id
    ).join(
        models.Case, models.DocumentRequest.case_id == models.Case.id
    ).filter(
        # Only fetch files that actually exist
        models.RequestedDocument.status.in_(['uploaded', 'reviewed']),
        models.RequestedDocument.file_path.isnot(None)
    )

    # 2. Filter by Access Rights (User must be assigned to the case)
    if role in STAFF_ROLES:
        # Filter for cases where this user is personnel
        query = query.join(
            models.case_personnel_association, 
            models.Case.id == models.case_personnel_association.c.case_id
        ).filter(
            models.case_personnel_association.c.user_id == user_id
        )
    elif role == 'client':
        # Filter for cases where this user is a client
        query = query.join(
            models.case_client_association, 
            models.Case.id == models.case_client_association.c.case_id
        ).filter(
            models.case_client_association.c.client_id == user_id
        )
    else:
        # Invalid role or admin (return empty for safety)
        return []

    return query.all()


def get_all_documents_admin(
    db: Session,
    status: Optional[str] = None,
    search_term: Optional[str] = None,
    skip: int = 0,
    limit: int = 1000,
) -> List[Any]:
    query = (
        db.query(
            models.RequestedDocument,
            models.Case.title.label("case_title"),
            models.Case.id.label("case_id"),
            models.DocumentRequest.created_at.label("request_date"),
        )
        .join(models.DocumentRequest, models.RequestedDocument.request_id == models.DocumentRequest.id)
        .join(models.Case, models.DocumentRequest.case_id == models.Case.id)
    )

    if status:
        query = query.filter(models.RequestedDocument.status == status)

    if search_term:
        search_like = f"%{search_term}%"
        query = query.filter(
            or_(
                models.RequestedDocument.name.ilike(search_like),
                models.Case.title.ilike(search_like),
            )
        )

    return (
        query.order_by(models.DocumentRequest.created_at.desc(), models.RequestedDocument.id.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


def update_requested_document_status(
    db: Session,
    doc_id: int,
    new_status: str,
) -> Optional[models.RequestedDocument]:
    valid_statuses = {"required", "uploaded", "reviewed"}
    status = (new_status or "").strip().lower()
    if status not in valid_statuses:
        raise HTTPException(status_code=400, detail="Invalid document status.")

    document = get_requested_document_by_id(db, doc_id)
    if not document:
        return None

    if status in {"uploaded", "reviewed"} and not document.file_path:
        raise HTTPException(
            status_code=409,
            detail="Cannot set uploaded/reviewed status when no file is attached.",
        )

    if status == "required":
        document.file_path = None

    document.status = status
    db.commit()
    db.refresh(document)
    return document


def clear_requested_document_file(db: Session, doc_id: int) -> Optional[models.RequestedDocument]:
    document = get_requested_document_by_id(db, doc_id)
    if not document:
        return None

    document.file_path = None
    document.status = "required"
    db.commit()
    db.refresh(document)
    return document

def update_client(db: Session, client_id: int, client_update: schemas.ClientUpdate):
    """Updates a client's core info and profile data."""
    user = get_user_by_id(db, client_id)
    if not user or user.role != 'client':
        return None
    
    # Update Core User fields
    if client_update.name:
        user.name = client_update.name
    if client_update.email:
        user.email = client_update.email
        
    # Update Profile fields
    if user.client_profile:
        if client_update.phone:
            user.client_profile.phone = _normalize_phone_value(client_update.phone)
        if client_update.address:
            user.client_profile.address = client_update.address
            
    db.commit()
    db.refresh(user)
    return user

def delete_user(db: Session, user_id: int):
    """Deletes a user and their profile."""
    user = get_user_by_id(db, user_id)
    if user:
        db.delete(user)
        db.commit()
        return True
    return False


def get_azure_synced_users(db: Session, limit: int = 200) -> List[models.User]:
    return (
        db.query(models.User)
        .options(
            joinedload(models.User.lawyer_profile),
            joinedload(models.User.client_profile),
        )
        .filter(models.User.aad_object_id.isnot(None))
        .order_by(models.User.last_azure_sync_at.desc(), models.User.id.desc())
        .limit(limit)
        .all()
    )
