from pydantic import BaseModel, EmailStr, Field, model_validator
from typing import Optional, Any, Dict, List, Literal
from datetime import datetime

UserRole = Literal["client", "lawyer", "accounting", "other", "case manager", "admin"]

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
    street_1: Optional[str] = None
    street_2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None
    country: Optional[str] = None
    # Read-only for staff: changes only when the client texts STOP or START.
    sms_opted_out: Optional[bool] = False

    class Config:
        from_attributes = True


# =========================================================================
# USER
# =========================================================================

class UserCreate(BaseModel):
    email: EmailStr
    name: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    password: str
    role: UserRole
    profile_data: Optional[Dict[str, Any]] = None 


class UserLogin(BaseModel):
    email: EmailStr
    password: str

class User(BaseModel):
    id: int
    email: EmailStr
    name: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    role: UserRole
    auth_provider: Optional[str] = None
    azure_groups: List[str] = Field(default_factory=list)
    effective_role_source: Optional[str] = None
    last_azure_sync_at: Optional[datetime] = None
    theme: Optional[str] = "system"
    text_size: Optional[str] = "normal"

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
    lawbase_case_number: str
    case_type: Optional[str] = None
    # Legacy compatibility
    category: Optional[str] = None
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


class CaseUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    lawbase_case_number: Optional[str] = None
    case_type: Optional[str] = None
    category: Optional[str] = None
    priority: Optional[str] = None
    status: Optional[str] = None


class CaseClientMember(User):
    case_role: Optional[CaseClientRoleType] = None


class Case(CaseBase):
    id: int
    lawbase_case_number: str
    case_serial: Optional[str] = None
    clients: List[CaseClientMember] = Field(default_factory=list)
    personnel: List[User] = Field(default_factory=list)
    assigned_lawyer_id: Optional[int] = None 
    client_id: Optional[int] = None
    assigned_lawyer_user: Optional[User] = None
    client_user: Optional[User] = None
    
    priority: str | None = None
    case_type: str | None = None
    # Legacy compatibility
    category: str | None = None
    status: str | None = None
    
    unread_count: int = 0

    class Config:
        from_attributes = True


# =========================================================================
# BATCH CASE DETAILS
# =========================================================================

class BatchDetailsRequest(BaseModel):
    case_ids: List[int] = Field(default_factory=list, max_length=100)


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
    case_id: Optional[int] = None    # empty for lead texts and unassigned numbers
    sender_id: Optional[int] = None  # empty when the sender has no portal account
    is_read: bool 
    channel: str 
    message_type: str # NEW: For frontend display logic
    sms_status: Optional[str] = None
    sms_error: Optional[str] = None
    conversation_id: Optional[int] = None
    lead_id: Optional[int] = None
    
    sender_user: Optional[User] = None 
    
    # CRITICAL: Embedded Document Request Details
    document_request: Optional[DocumentRequest] = None

    class Config:
        from_attributes = True
        
# =========================================================================
# DIRECT MESSAGE SCHEMAS
# =========================================================================

class DirectMessageBase(BaseModel):
    content: str

class DirectMessage(DirectMessageBase):
    id: int
    timestamp: datetime
    sender_id: int
    receiver_id: int
    is_read: bool
    sender: Optional[User] = None

    class Config:
        from_attributes = True

class DirectConversation(BaseModel):
    user: User
    last_message: Optional[DirectMessage] = None
    unread_count: int = 0

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

class UserStatusResponse(BaseModel):
    total_unread_count: int
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


class PaginatedDocumentsResponse(BaseModel):
    items: List[DocumentResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


class ClientUpdate(BaseModel):
    name: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    street_1: Optional[str] = None
    street_2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None
    country: Optional[str] = None


class UserRoleUpdate(BaseModel):
    role: str


class CaseClientRoleUpdate(BaseModel):
    role_type: CaseClientRoleType


class DocumentStatusUpdate(BaseModel):
    status: str


class AzureUserSync(BaseModel):
    id: int
    name: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: EmailStr
    role: UserRole
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


InviteRole = UserRole
InviteStatus = Literal["pending", "used", "expired"]


class InviteCreate(BaseModel):
    email: EmailStr
    role: InviteRole
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    street_1: Optional[str] = None
    street_2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None
    country: Optional[str] = None


class Invite(BaseModel):
    id: int
    invited_email: EmailStr
    role: InviteRole
    invited_by_user_id: int
    expires_at: datetime
    used_at: Optional[datetime] = None
    accepted_user_id: Optional[int] = None
    created_at: datetime
    status: InviteStatus

    prefill_first_name: Optional[str] = None
    prefill_last_name: Optional[str] = None
    prefill_phone: Optional[str] = None
    prefill_street_1: Optional[str] = None
    prefill_street_2: Optional[str] = None
    prefill_city: Optional[str] = None
    prefill_state: Optional[str] = None
    prefill_zip_code: Optional[str] = None
    prefill_country: Optional[str] = None

    class Config:
        from_attributes = True


class InviteCreateResponse(BaseModel):
    invite: Invite
    invite_url: str


class InvitePreview(BaseModel):
    invited_email: EmailStr
    role: InviteRole
    expires_at: datetime
    required_fields: List[str]
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    street_1: Optional[str] = None
    street_2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None
    country: Optional[str] = None


class InviteAccept(BaseModel):
    token: str
    first_name: str
    last_name: str
    phone: str
    street_1: str
    street_2: Optional[str] = None
    city: str
    state: str
    zip_code: str
    country: str
    password: str


# ========================================================
# Leads (LeadBase leads; typed in by staff until the robo bridge fills them)
# ========================================================

class StaffSummary(BaseModel):
    id: int
    name: Optional[str] = None

    class Config:
        from_attributes = True


class LeadCreate(BaseModel):
    lead_number: str = Field(min_length=1, max_length=50)
    first_name: Optional[str] = Field(default=None, max_length=100)
    last_name: Optional[str] = Field(default=None, max_length=100)
    phone: Optional[str] = Field(default=None, max_length=40)
    assigned_user_id: Optional[int] = None


class LeadUpdate(BaseModel):
    first_name: Optional[str] = Field(default=None, max_length=100)
    last_name: Optional[str] = Field(default=None, max_length=100)
    phone: Optional[str] = Field(default=None, max_length=40)
    assigned_user_id: Optional[int] = None
    status: Optional[str] = None


class Lead(BaseModel):
    id: int
    lead_number: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    name: Optional[str] = None
    phone: Optional[str] = None
    status: str
    assigned_user: Optional[StaffSummary] = None
    created_at: Optional[datetime] = None
    conversation_id: Optional[int] = None
    # Set when the phone number already belongs to a conversation about something else.
    phone_note: Optional[str] = None
    last_message: Optional["ConversationLastMessage"] = None
    last_message_at: Optional[datetime] = None
    sms_opted_out: bool = False
    source: str = "manual"
    lead_type: Optional[str] = None
    lb_status: Optional[str] = None
    lb_current_status: Optional[str] = None
    assigned_name: Optional[str] = None
    language: Optional[str] = None
    synced_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ========================================================
# Conversations (one per phone number; linked to a lead, a case, or neither)
# ========================================================

class ConversationLead(BaseModel):
    id: int
    lead_number: str
    name: Optional[str] = None
    status: str

    class Config:
        from_attributes = True


class ConversationCase(BaseModel):
    id: int
    title: Optional[str] = None
    lawbase_case_number: Optional[str] = None

    class Config:
        from_attributes = True


class ConversationLastMessage(BaseModel):
    content: str
    timestamp: Optional[datetime] = None
    inbound: bool


class ConversationSummary(BaseModel):
    id: int
    phone: str
    contact_name: Optional[str] = None
    kind: str  # case, lead or unassigned
    lead: Optional[ConversationLead] = None
    case: Optional[ConversationCase] = None
    last_message: Optional[ConversationLastMessage] = None
    last_message_at: Optional[datetime] = None
    message_count: int = 0
    sms_opted_out: bool = False


class ConversationCounts(BaseModel):
    unassigned: int


class NewLeadForConversation(BaseModel):
    lead_number: str = Field(min_length=1, max_length=50)
    first_name: Optional[str] = Field(default=None, max_length=100)
    last_name: Optional[str] = Field(default=None, max_length=100)
    assigned_user_id: Optional[int] = None


class ConversationLinkRequest(BaseModel):
    """Exactly one of: an existing lead, a new lead, or a case."""
    lead_id: Optional[int] = None
    new_lead: Optional[NewLeadForConversation] = None
    case_id: Optional[int] = None


class MoveToCaseRequest(BaseModel):
    case_id: int


class AppSettings(BaseModel):
    cases_enabled: bool


class StartConversationRequest(BaseModel):
    """New text: a phone number plus an existing lead or a new one."""
    phone: str = Field(min_length=1, max_length=40)
    lead_id: Optional[int] = None
    new_lead: Optional[NewLeadForConversation] = None


class StartConversationResult(BaseModel):
    conversation: ConversationSummary
    lead_id: Optional[int] = None
    existing: bool = False   # the number already had a conversation
    note: Optional[str] = None


Lead.model_rebuild()


# ========================================================
# Document requests to a phone number (tasks 1.7 to 1.9)
# ========================================================

class FileRequestCreate(BaseModel):
    items: List[str] = Field(min_length=1, max_length=20)
    note: Optional[str] = Field(default=None, max_length=300)
    expires_in_days: int = Field(default=7, ge=1, le=60)


class FileRequestExtend(BaseModel):
    days: int = Field(default=7, ge=1, le=60)


class RequestFileOut(BaseModel):
    id: int
    item_id: Optional[int] = None
    original_name: str
    content_type: str
    size_bytes: int
    uploaded_at: Optional[datetime] = None
    # For sent documents: how often the person downloaded this file.
    download_count: int = 0
    last_downloaded_at: Optional[datetime] = None


class FileRequestItemOut(BaseModel):
    id: int
    name: str
    received_at: Optional[datetime] = None
    files: List[RequestFileOut] = []


class FileRequestEventOut(BaseModel):
    kind: str
    at: Optional[datetime] = None
    who: Optional[str] = None
    detail: Optional[str] = None


class FileRequestOut(BaseModel):
    """What staff see: the request (or sent documents), its state, and its full trail."""
    id: int
    direction: str = "request"  # request: they upload; send: they download
    state: str  # waiting, partly, complete, expired, revoked
    link: str
    note: Optional[str] = None
    created_at: Optional[datetime] = None
    created_by: Optional[str] = None
    sent_status: Optional[str] = None
    sent_error: Optional[str] = None
    expires_at: datetime
    revoked_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    open_count: int = 0
    first_opened_at: Optional[datetime] = None
    last_opened_at: Optional[datetime] = None
    items: List[FileRequestItemOut] = []
    files: List[RequestFileOut] = []  # sent documents
    events: List[FileRequestEventOut] = []


class PublicSentFile(BaseModel):
    id: int
    name: str
    size_bytes: int
    content_type: str


class PublicFileRequestItem(BaseModel):
    id: int
    name: str
    file_count: int


class PublicFileRequest(BaseModel):
    """What the person with the link sees. No last name, phone or case details."""
    firm_name: str
    first_name: Optional[str] = None
    note: Optional[str] = None
    state: str  # open, complete, expired, revoked
    can_upload: bool
    expires_at: datetime
    max_file_mb: int
    direction: str = "request"
    items: List[PublicFileRequestItem] = []
    files: List[PublicSentFile] = []


class AppearanceUpdate(BaseModel):
    theme: Optional[Literal["light", "dark", "system"]] = None
    text_size: Optional[Literal["normal", "large"]] = None


# ========================================================
# Robo bridge (Phase 2)
# ========================================================

class BridgeLead(BaseModel):
    """One lead as dssc.GetLeads returns it."""
    serial: int
    lead_number: str = Field(min_length=1, max_length=50)
    lead_type: Optional[str] = None
    status: Optional[str] = None
    current_status: Optional[str] = None
    security_level: Optional[int] = None
    assigned_login: Optional[str] = None
    assigned_name: Optional[str] = None
    assigned_email: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    language: Optional[str] = None


class BridgeLeadBatch(BaseModel):
    leads: List[BridgeLead] = Field(max_length=5000)


class BridgeLeadResult(BaseModel):
    received: int
    created: int
    updated: int
    merged_with_typed_in: int
    unchanged: int
    conversations_created: int
    skipped: List[str] = []
