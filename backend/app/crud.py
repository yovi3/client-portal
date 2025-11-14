from sqlalchemy.orm import Session, joinedload
from sqlalchemy import update, func, and_
from . import models, schemas, auth
from datetime import datetime, timedelta # Dodano timedelta
from typing import Optional, Any, List, Tuple
import random
import string
import secrets # Dodano secrets do generowania tokenów

# =========================================================================
# 0. HELPER FUNCTIONS
# =========================================================================

def generate_sms_tag(db: Session) -> str:
    """Generuje unikalny 4-znakowy tag SMS (np. A1B2)."""
    while True:
        # Generuj tag (Litera, Cyfra, Litera, Cyfra)
        tag = (
            random.choice(string.ascii_uppercase) +
            random.choice(string.digits) +
            random.choice(string.ascii_uppercase) +
            random.choice(string.digits)
        )
        # Sprawdź, czy tag już istnieje
        existing_case = db.query(models.Case).filter(models.Case.sms_id_tag == tag).first()
        if not existing_case:
            return tag
            
def generate_secure_token(length: int = 32) -> str:
    """Generuje bezpieczny, unikalny token dla dostępu bez logowania."""
    return secrets.token_urlsafe(length)


# =========================================================================
# 1. UNIFIED USER CRUD (Handles Lawyers and Clients)
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
    """RetrieVes a User by searching their LawyerProfile.aad_id."""
    return db.query(models.User) \
             .join(models.LawyerProfile) \
             .options(
                 joinedload(models.User.lawyer_profile),
                 joinedload(models.User.client_profile)
             )\
             .filter(models.LawyerProfile.aad_id == aad_id) \
             .first()

# NOWA FUNKCJA
def get_user_by_phone(db: Session, phone_number: str) -> Optional[models.User]:
    """Pobiera użytkownika na podstawie numeru telefonu w profilu klienta."""
    profile = db.query(models.ClientProfile)\
                .filter(models.ClientProfile.phone == phone_number)\
                .first()
    if profile:
        return get_user_by_id(db, profile.user_id)
    return None

def create_user(db: Session, user_data: schemas.UserCreate) -> models.User:
    """
    Creates a User and the corresponding LawyerProfile or ClientProfile.
    """
    hashed_pw = auth.hash_password(user_data.password) 
    
    db_user = models.User(
        email=user_data.email,
        name=user_data.name,
        hashed_password=hashed_pw,
        role=user_data.role,
    )
    db.add(db_user)
    db.flush() 

    profile_data = user_data.profile_data or {} 
    
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
        db_profile = models.ClientProfile(
            user_id=db_user.id,
            phone=profile_data.get("phone"), # Upewnij się, że ten numer jest w E.164
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

def authenticate_user(db: Session, email: str, password: str) -> Optional[models.User]:
    """Authenticates any user type based on email and password."""
    user = get_user_by_email(db, email)
    if not user:
        return None
    if not auth.verify_password(password, user.hashed_password):
        return None
    return user

# =========================================================================
# 2. READ ACCESS FUNCTIONS (For filtering by role)
# =========================================================================

def get_lawyers(db: Session, skip: int = 0, limit: int = 100):
    """Retrieves all users with the 'lawyer' role."""
    return db.query(models.User)\
             .options(joinedload(models.User.lawyer_profile))\
             .filter(models.User.role == 'lawyer')\
             .offset(skip).limit(limit).all()

def get_clients(db: Session, skip: int = 0, limit: int = 100):
    """Retrieves all users with the 'client' role."""
    return db.query(models.User)\
             .options(joinedload(models.User.client_profile))\
             .filter(models.User.role == 'client')\
             .offset(skip).limit(limit).all()


# =========================================================================
# 3. CASE CRUD (Uses the unified User IDs)
# =========================================================================

comprehensive_case_load = [
    joinedload(models.Case.client_user)
        .joinedload(models.User.client_profile),
    joinedload(models.Case.assigned_lawyer_user)
        .joinedload(models.User.lawyer_profile)
]

def get_case_by_id(db: Session, case_id: int) -> Optional[models.Case]:
    """Pobiera pojedynczą sprawę z pełnym załadowaniem danych."""
    return db.query(models.Case)\
             .options(*comprehensive_case_load)\
             .filter(models.Case.id == case_id)\
             .first()

def get_cases(db: Session, skip: int = 0, limit: int = 100):
    """Gets all cases, loading all related user and profile data."""
    return db.query(models.Case)\
             .options(*comprehensive_case_load)\
             .offset(skip).limit(limit).all()

# ✅ MODIFIED to calculate unread count
def get_lawyer_cases(db: Session, lawyer_id: int) -> List[Tuple[models.Case, int]]:
    """
    Retrieves cases for a lawyer, loading all related data AND
    counting unread messages (not sent by this lawyer).
    """
    
    # Define the subquery to count unread messages
    unread_subquery = (
        db.query(
            models.Message.case_id,
            func.count(models.Message.id).label("unread_count")
        )
        .filter(
            models.Message.is_read == False,
            models.Message.sender_id != lawyer_id  # Count messages NOT from the lawyer
        )
        .group_by(models.Message.case_id)
        .subquery()
    )

    # Main query
    return (
        db.query(
            models.Case,
            func.coalesce(unread_subquery.c.unread_count, 0) # Get count, default to 0
        )
        .outerjoin(unread_subquery, models.Case.id == unread_subquery.c.case_id)
        .options(*comprehensive_case_load)
        .filter(models.Case.assigned_lawyer_id == lawyer_id)
        .all()
    )

# ✅ MODIFIED to calculate unread count
def get_client_cases(db: Session, client_id: int) -> List[Tuple[models.Case, int]]:
    """
    Retrieves cases for a client, loading all related data AND
    counting unread messages (not sent by this client).
    """
    
    # Define the subquery to count unread messages
    unread_subquery = (
        db.query(
            models.Message.case_id,
            func.count(models.Message.id).label("unread_count")
        )
        .filter(
            models.Message.is_read == False,
            models.Message.sender_id != client_id # Count messages NOT from the client
        )
        .group_by(models.Message.case_id)
        .subquery()
    )

    # Main query
    return (
        db.query(
            models.Case,
            func.coalesce(unread_subquery.c.unread_count, 0) # Get count, default to 0
        )
        .outerjoin(unread_subquery, models.Case.id == unread_subquery.c.case_id)
        .options(*comprehensive_case_load)
        .filter(models.Case.client_id == client_id)
        .all()
    )

# NOWA FUNKCJA
def get_active_cases_by_client_id(db: Session, client_id: int) -> List[models.Case]:
    """Zwraca listę aktywnych spraw dla klienta."""
    return db.query(models.Case)\
             .filter(models.Case.client_id == client_id, models.Case.status == 'active')\
             .all()

# NOWA FUNKCJA
def get_case_by_tag(db: Session, tag: str) -> Optional[models.Case]:
    """Znajduje sprawę na podstawie jej unikalnego tagu SMS."""
    return db.query(models.Case)\
             .options(*comprehensive_case_load)\
             .filter(models.Case.sms_id_tag == tag)\
             .first()

# ZMODYFIKOWANA FUNKCJA
def create_case(db: Session, case: schemas.CaseCreate) -> models.Case:
    db_case_data = case.model_dump()
    # Handle potential mismatch from schema
    if 'lawyer_id' in db_case_data:
        db_case_data['assigned_lawyer_id'] = db_case_data.pop('lawyer_id')
    
    # Generuj i dodaj tag SMS
    sms_tag = generate_sms_tag(db)
    db_case_data['sms_id_tag'] = sms_tag
    
    db_case = models.Case(**db_case_data)
    db.add(db_case)
    db.commit()
    db.refresh(db_case)
    
    client_profile = db.query(models.ClientProfile)\
                       .filter(models.ClientProfile.user_id == case.client_id).first()
                       
    if client_profile:
        client_profile.active_cases += 1
        db.commit()
    
    db.refresh(db_case, attribute_names=['client_user', 'assigned_lawyer_user'])
    return db_case

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
        channel=message.channel # Przekazanie kanału
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
                     .joinedload(models.User.client_profile)
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
                     .joinedload(models.User.client_profile)
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
    """
    
    # We must join Case and Message
    query = db.query(func.count(models.Message.id)).join(
        models.Case, models.Message.case_id == models.Case.id
    ).filter(
        models.Message.is_read == False,
        models.Message.sender_id != user_id # Don't count our own unread messages
    )

    # Filter cases based on the user's role
    if role == 'lawyer':
        query = query.filter(models.Case.assigned_lawyer_id == user_id)
    elif role == 'client':
        query = query.filter(models.Case.client_id == user_id)
    else:
        return 0 # Not a valid role

    count = query.scalar()
    return count if count is not None else 0

def get_unread_message_notifications(db: Session, user_id: int, role: str, limit: int = 5) -> List[Tuple[models.Message, str, str]]:
    case_filter = models.Case.assigned_lawyer_id == user_id if role == 'lawyer' else models.Case.client_id == user_id
    
    subq = (
        db.query(
            models.Message.case_id,
            func.max(models.Message.timestamp).label("latest_timestamp")
        )
        .join(models.Case, models.Message.case_id == models.Case.id)
        .filter(
            models.Message.is_read == False,
            models.Message.sender_id != user_id,
            case_filter
        )
        .group_by(models.Message.case_id)
        .subquery()
    )
    
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
# 5. NOWE FUNKCJE: Awaiting SMS CRUD
# =========================================================================

def create_awaiting_sms(db: Session, phone: str, body: str, client_id: Optional[int] = None) -> models.AwaitingSMS:
    db_awaiting = models.AwaitingSMS(
        client_phone_number=phone,
        sms_body=body,
        client_id=client_id
    )
    db.add(db_awaiting)
    db.commit()
    db.refresh(db_awaiting)
    return db_awaiting

def get_awaiting_sms(db: Session, skip: int = 0, limit: int = 20) -> List[models.AwaitingSMS]:
    """Pobiera wszystkie oczekujące wiadomości SMS."""
    return db.query(models.AwaitingSMS)\
             .options(joinedload(models.AwaitingSMS.client))\
             .filter(models.AwaitingSMS.status == 'pending')\
             .order_by(models.AwaitingSMS.received_at.desc())\
             .offset(skip).limit(limit).all()

def get_awaiting_sms_by_id(db: Session, sms_id: int) -> Optional[models.AwaitingSMS]:
    """Pobiera jedną oczekującą wiadomość SMS."""
    return db.query(models.AwaitingSMS)\
             .filter(models.AwaitingSMS.id == sms_id)\
             .first()

def update_awaiting_sms_status(db: Session, sms_id: int, status: str) -> Optional[models.AwaitingSMS]:
    """Aktualizuje status oczekującej wiadomości (np. na 'resolved')."""
    db_sms = get_awaiting_sms_by_id(db, sms_id)
    if db_sms:
        db_sms.status = status
        db.commit()
        db.refresh(db_sms)
    return db_sms

# =========================================================================
# 6. NOWE FUNKCJE: Document Request CRUD
# =========================================================================

def create_document_request(
    db: Session, 
    case_id: int, 
    request_data: schemas.DocumentRequestCreate
) -> models.DocumentRequest:
    """
    Tworzy nowe żądanie dokumentów i powiązane elementy.
    Generuje unikalny token dostępu.
    """
    
    # 1. Generowanie Tokena i daty wygaśnięcia (7 dni)
    token = generate_secure_token()
    token_expiry = datetime.utcnow() + timedelta(days=7) 

    db_request = models.DocumentRequest(
        case_id=case_id,
        lawyer_id=request_data.lawyer_id,
        access_token=token,
        token_expires_at=token_expiry,
        status="pending"
    )
    
    db.add(db_request)
    db.flush() 

    # 2. Tworzenie listy wymaganych dokumentów
    for item in request_data.required_items:
        db_doc = models.RequestedDocument(
            request_id=db_request.id,
            name=item.name,
            status="required"
        )
        db.add(db_doc)

    # 3. Dodanie wiadomości na czat (dla historii)
    chat_message_content = f"Formalne żądanie dokumentów ({len(request_data.required_items)} pozycji) zostało wysłane do klienta. {request_data.note if request_data.note else ''}"
    
    message_in = schemas.MessageCreate(
        content=chat_message_content,
        case_id=case_id,
        sender_id=request_data.lawyer_id,
        channel="portal",
        message_type="document_request"
    )
    create_message(db, message=message_in)
    
    db.commit()
    db.refresh(db_request)
    
    return db_request

def get_document_request_by_token(db: Session, token: str) -> Optional[models.DocumentRequest]:
    """Pobiera żądanie dokumentów po unikalnym tokenie i sprawdza, czy nie wygasł."""
    request = db.query(models.DocumentRequest).options(
        joinedload(models.DocumentRequest.requested_documents)
    ).filter(
        models.DocumentRequest.access_token == token,
        models.DocumentRequest.token_expires_at > datetime.utcnow()
    ).first()
    return request

def get_all_requests_by_case(db: Session, case_id: int) -> List[models.DocumentRequest]:
    """Pobiera wszystkie żądania dokumentów dla sprawy."""
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