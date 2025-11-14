from pydantic import BaseModel, EmailStr, Field
from typing import Optional, Any, Dict, List
from datetime import datetime

# =========================================================================
# USER PROFILES
# =========================================================================

class LawyerProfileBase(BaseModel):
    bar_number: str
    specialty: Optional[str] = None
    firm_name: Optional[str] = None
    hourly_rate: Optional[int] = 250
    aad_id: Optional[str] = None

    class Config:
        from_attributes = True


class ClientProfileBase(BaseModel):
    # IMPORTANT: Must be in E.164 format, e.g., +48123456789
    phone: Optional[str] = None 
    address: Optional[str] = None 

    class Config:
        from_attributes = True


# =========================================================================
# USER
# =========================================================================

class UserCreate(BaseModel):
    email: EmailStr
    name: str 
    password: str
    role: str 
    profile_data: Optional[Dict[str, Any]] = None 


class UserLogin(BaseModel):
    email: EmailStr
    password: str

class User(BaseModel):
    id: int
    email: EmailStr
    name: str 
    role: str 

    lawyer_profile: Optional[LawyerProfileBase] = None
    client_profile: Optional[ClientProfileBase] = None

    class Config:
        from_attributes = True


# =========================================================================
# CASE
# =========================================================================

class CaseBase(BaseModel):
    title: str
    description: Optional[str] = None


class CaseCreate(CaseBase):
    client_id: int
    assigned_lawyer_id: int 


class Case(CaseBase):
    id: int
    assigned_lawyer_id: int 
    client_id: int
    
    sms_id_tag: str # NEW FIELD

    client_user: Optional[User] = None
    assigned_lawyer_user: Optional[User] = None
    
    unread_count: int = 0  # Added field

    class Config:
        from_attributes = True


# =========================================================================
# DOCUMENT REQUESTS (Required for Message Schema)
# =========================================================================

class RequestedDocumentBase(BaseModel):
    name: str # e.g., "ID Card"

class RequestedDocumentCreate(RequestedDocumentBase):
    pass
    
class RequestedDocument(RequestedDocumentBase):
    id: int
    status: str
    file_id: Optional[int] = None
    
    file_path: Optional[str] = None
    
    class Config:
        from_attributes = True


class DocumentRequestCreate(BaseModel):
    # List of required document names/actions
    required_items: List[RequestedDocumentCreate]
    lawyer_id: int
    note: Optional[str] = None # Optional note/instructions
    deadline: Optional[datetime] = None # NEW: Deadline field

class DocumentRequest(BaseModel):
    id: int
    case_id: int
    lawyer_id: int
    status: str
    created_at: datetime
    token_expires_at: datetime 
    # CRITICAL: Relationship to documents
    requested_documents: List[RequestedDocument] 
    
    # NEW: Deadline field
    deadline: Optional[datetime] = None

    # NEW: Access Token (used for link generation, can be exposed via Message)
    access_token: Optional[str] = None 

    class Config:
        from_attributes = True
        
# =========================================================================
# MESSAGE (Integrated Document Request Data)
# =========================================================================

class MessageBase(BaseModel):
    content: str


class MessageCreate(MessageBase):
    case_id: int
    sender_id: int
    channel: Optional[str] = "portal"
    message_type: str = "text" # Added default value


class Message(MessageBase):
    id: int
    timestamp: datetime
    case_id: int
    sender_id: int
    is_read: bool 
    channel: str 
    message_type: str # NEW: For frontend display logic
    
    sender_user: Optional[User] = None 
    
    # CRITICAL: Embedded Document Request Details (If message_type is 'document_request', these are populated via the relationship)
    # The frontend uses the existence of these fields (or document_request object) to render the special box.
    document_request: Optional[DocumentRequest] = None

    class Config:
        from_attributes = True
        
# =========================================================================
# OTHER UTILITY SCHEMAS
# =========================================================================
        
class MarkReadPayload(BaseModel):
    reader_id: int
    
class UnreadCountResponse(BaseModel):
    total_unread_count: int
    
class Notification(BaseModel):
    message_id: int
    content_snippet: str
    timestamp: datetime
    case_id: int
    case_title: str
    sender_name: str
    
    class Config:
        from_attributes = True

class NotificationResponse(BaseModel):
    notifications: List[Notification]

# Awaiting SMS & Assignment
class AwaitingSMSBase(BaseModel):
    client_phone_number: str
    sms_body: str
    status: str
    received_at: datetime
    client_id: Optional[int] = None

class AwaitingSMS(AwaitingSMSBase):
    id: int
    client: Optional[User] = None
    
    class Config:
        from_attributes = True
        
class AssignSMSPayload(BaseModel):
    case_id: int

# Schema for Link (used in SMS)
class DocumentRequestLink(BaseModel):
    link: str
    token: str