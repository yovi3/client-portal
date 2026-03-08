from pydantic import BaseModel, EmailStr, Field, model_validator
from typing import Optional, Any, Dict, List, Literal
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
    auth_provider: Optional[str] = None
    azure_groups: List[str] = Field(default_factory=list)
    effective_role_source: Optional[str] = None
    last_azure_sync_at: Optional[datetime] = None

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


CaseClientRoleType = Literal["client", "spouse", "legal guardian", "other"]


class CaseClientAssignmentIn(BaseModel):
    user_id: int
    role_type: CaseClientRoleType = "client"


class CaseCreate(CaseBase):
    client_assignments: List[CaseClientAssignmentIn] | None = None
    # Legacy compatibility
    client_ids: List[int] | None = None
    personnel_ids: List[int] = Field(..., min_length=1)

    @model_validator(mode="after")
    def validate_clients_presence(self):
        has_assignments = bool(self.client_assignments and len(self.client_assignments) > 0)
        has_legacy_ids = bool(self.client_ids and len(self.client_ids) > 0)
        if not has_assignments and not has_legacy_ids:
            raise ValueError("Case must include at least one client assignment or client_id.")
        return self


class CaseClientMember(User):
    case_role: Optional[CaseClientRoleType] = None


class Case(CaseBase):
    id: int
    case_number: int
    case_serial: Optional[str] = None
    clients: List[CaseClientMember] = Field(default_factory=list)
    personnel: List[User] = Field(default_factory=list)
    assigned_lawyer_id: Optional[int] = None 
    client_id: Optional[int] = None
    assigned_lawyer_user: Optional[User] = None
    client_user: Optional[User] = None
    
    priority: str | None = None
    category: str | None = None
    status: str | None = None
    
    unread_count: int = 0

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
    lawyer_id: Optional[int] = None # Set server-side from auth context
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
    note: Optional[str] = None

    # NEW: Access Token (used for link generation, can be exposed via Message)
    access_token: Optional[str] = None 
    case_title: Optional[str] = None
    client_names: List[str] = Field(default_factory=list)
    personnel_names: List[str] = Field(default_factory=list)

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
    
    # CRITICAL: Embedded Document Request Details
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
    assigned_case_id: Optional[int] = None
    assigned_by_user_id: Optional[int] = None
    assigned_at: Optional[datetime] = None

class AwaitingSMS(AwaitingSMSBase):
    id: int
    client: Optional[User] = None
    
    class Config:
        from_attributes = True
        
class AssignSMSPayload(BaseModel):
    case_id: int


class SMSInboxThread(BaseModel):
    client_id: Optional[int] = None
    client_phone_number: str
    pending_count: int
    last_received_at: datetime
    client_name: Optional[str] = None

# Schema for Link (used in SMS)
class DocumentRequestLink(BaseModel):
    link: str
    token: str
    
# In schemas.py

class DocumentResponse(BaseModel):
    id: int
    name: str           # The name of the file/document requirement
    status: str         # 'uploaded' or 'reviewed'
    file_path: Optional[str] = None
    case_title: str     # Context for the user
    case_id: int        # For linking back to the case
    upload_date: Optional[datetime] = None # Using request creation date as proxy

    class Config:
        from_attributes = True
        
class ClientUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    address: Optional[str] = None


class UserRoleUpdate(BaseModel):
    role: str


class CaseClientRoleUpdate(BaseModel):
    role_type: CaseClientRoleType


class DocumentStatusUpdate(BaseModel):
    status: str


class AzureUserSync(BaseModel):
    id: int
    name: str
    email: EmailStr
    role: str
    aad_object_id: Optional[str] = None
    effective_role_source: Optional[str] = None
    last_azure_sync_at: Optional[datetime] = None
    azure_groups: List[str] = []

    class Config:
        from_attributes = True


class RolePermissionCreate(BaseModel):
    role: str
    permission: str


class RolePermission(BaseModel):
    id: int
    role: str
    permission: str
    created_at: datetime

    class Config:
        from_attributes = True
