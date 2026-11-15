from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Boolean, Table, func, UniqueConstraint
from sqlalchemy.orm import relationship
from .database import Base
import datetime
import json

# =========================================================================
# ASSOCIATION TABLES (Many-to-Many)
# =========================================================================

# 1. Personnel (Lawyers, Accountants, etc.) assigned to a Case
case_personnel_association = Table(
    'case_personnel_association', Base.metadata,
    Column('case_id', Integer, ForeignKey('cases.id'), primary_key=True),
    Column('user_id', Integer, ForeignKey('users.id'), primary_key=True),
    Column('role', String, nullable=False) # e.g., 'lawyer', 'accountant', 'paralegal'
)

# 2. Clients assigned to a Case
case_client_association = Table(
    'case_client_association', Base.metadata,
    Column('case_id', Integer, ForeignKey('cases.id'), primary_key=True),
    Column('client_id', Integer, ForeignKey('users.id'), primary_key=True),
    Column('role_type', String, nullable=False, default='client', server_default='client')
)

# =========================================================================
# 1. CORE USER TABLE (The Authentication Hub)
# =========================================================================

class User(Base):
    """
    Central table for all users.
    """
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    first_name = Column(String, nullable=True)
    last_name = Column(String, nullable=True)
    hashed_password = Column(String, nullable=False)
    # Appearance, chosen by each person in Settings: theme is light, dark or system
    # (match the computer); text_size is normal or large.
    theme = Column(String, nullable=False, default="system", server_default="system")
    text_size = Column(String, nullable=False, default="normal", server_default="normal")
    role = Column(String, nullable=False) # 'lawyer', 'client', 'admin', 'accountant'
    aad_object_id = Column(String, unique=True, index=True, nullable=True)
    auth_provider = Column(String, nullable=False, default="local")
    last_azure_group_ids = Column(String, nullable=True)
    last_azure_sync_at = Column(DateTime, nullable=True)
    effective_role_source = Column(String, nullable=True)
    
    lawyer_profile = relationship(
        "LawyerProfile", back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    
    client_profile = relationship(
        "ClientProfile", back_populates="user", uselist=False, cascade="all, delete-orphan"
    )

    # Relationships for Cases
    # (Removed cases_as_lawyer and cases_as_client, now replaced by many-to-many below)
    
    # NEW M2M: Cases where this user is Personnel (Lawyer, Accountant, etc.)
    assigned_cases = relationship(
        "Case",
        secondary=case_personnel_association,
        back_populates="personnel"
    )

    # NEW M2M: Cases where this user is a Client
    client_cases = relationship(
        "Case",
        secondary=case_client_association,
        back_populates="clients"
    )
    
    sent_messages = relationship("Message", back_populates="sender_user")
    sent_direct_messages = relationship("DirectMessage", foreign_keys="DirectMessage.sender_id", back_populates="sender")
    received_direct_messages = relationship("DirectMessage", foreign_keys="DirectMessage.receiver_id", back_populates="receiver")
    awaiting_sms = relationship(
        "AwaitingSMS",
        back_populates="client",
        foreign_keys="AwaitingSMS.client_id",
    )

    @property
    def azure_groups(self):
        if not self.last_azure_group_ids:
            return []
        try:
            parsed = json.loads(self.last_azure_group_ids)
            if isinstance(parsed, list):
                return parsed
        except (json.JSONDecodeError, TypeError):
            pass
        return []


class RolePermission(Base):
    __tablename__ = "role_permissions"
    __table_args__ = (UniqueConstraint("role", "permission", name="uq_role_permission"),)

    id = Column(Integer, primary_key=True, index=True)
    role = Column(String, nullable=False, index=True)
    permission = Column(String, nullable=False, index=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)


class Invite(Base):
    __tablename__ = "invites"

    id = Column(Integer, primary_key=True, index=True)
    invited_email = Column(String, nullable=False, index=True)
    role = Column(String, nullable=False, default="client", server_default="client")
    token_hash = Column(String, nullable=False, unique=True, index=True)
    invited_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    expires_at = Column(DateTime, nullable=False, index=True)
    used_at = Column(DateTime, nullable=True, index=True)
    accepted_user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False, index=True)

    prefill_first_name = Column(String, nullable=True)
    prefill_last_name = Column(String, nullable=True)
    prefill_phone = Column(String, nullable=True)
    prefill_street_1 = Column(String, nullable=True)
    prefill_street_2 = Column(String, nullable=True)
    prefill_city = Column(String, nullable=True)
    prefill_state = Column(String, nullable=True)
    prefill_zip_code = Column(String, nullable=True)
    prefill_country = Column(String, nullable=True)

    invited_by_user = relationship("User", foreign_keys=[invited_by_user_id])
    accepted_user = relationship("User", foreign_keys=[accepted_user_id])

# =========================================================================
# 2. PROFILE TABLES
# =========================================================================

class LawyerProfile(Base):
    __tablename__ = "lawyer_profiles"
    user_id = Column(Integer, ForeignKey("users.id"), primary_key=True)
    bar_number = Column(String, unique=True, nullable=False)
    specialty = Column(String)
    firm_name = Column(String)
    hourly_rate = Column(Integer, default=250)
    aad_id = Column(String, unique=True, nullable=True)
    user = relationship("User", back_populates="lawyer_profile")

class ClientProfile(Base):
    __tablename__ = "client_profiles"
    user_id = Column(Integer, ForeignKey("users.id"), primary_key=True)
    phone = Column(String, index=True) 
    address = Column(String)
    street_1 = Column(String, nullable=True)
    street_2 = Column(String, nullable=True)
    city = Column(String, nullable=True)
    state = Column(String, nullable=True)
    zip_code = Column(String, nullable=True)
    country = Column(String, nullable=True)
    active_cases = Column(Integer, default=0)
    # Set when the client texts STOP (or similar); cleared when they text START.
    sms_opted_out = Column(Boolean, default=False, nullable=False, server_default="0")
    sms_opted_out_at = Column(DateTime, nullable=True)
    joined_date = Column(DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc))
    user = relationship("User", back_populates="client_profile")

# =========================================================================
# 3. INTERACTION TABLES (Case and Message)
# =========================================================================

class Case(Base):
    """
    Represents a legal case.
    """
    __tablename__ = "cases"
    
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True)
    description = Column(String)
    status = Column(String, default="active")
    priority = Column(String, default="medium")
    category = Column(String, default="General")
    case_type = Column(String, default="General")
    lawbase_case_number = Column(String, unique=True, index=True, nullable=True)
    case_number = Column(Integer, unique=True, index=True, nullable=False)
    case_serial = Column(String(8), unique=True, index=True, nullable=False)
    # Deprecated: retained only for migration/backward compatibility
    sms_id_tag = Column(String(10), unique=True, index=True, nullable=True)
    
    # --- REMOVED: assigned_lawyer_id and client_id foreign keys ---
    
    # NEW M2M: Personnel assigned to the case
    personnel = relationship(
        "User",
        secondary=case_personnel_association,
        back_populates="assigned_cases",
        # Explicitly filter by user roles that represent personnel
        primaryjoin="Case.id == case_personnel_association.c.case_id",
        secondaryjoin="case_personnel_association.c.user_id == User.id"
    )

    # NEW M2M: Clients assigned to the case
    clients = relationship(
        "User",
        secondary=case_client_association,
        back_populates="client_cases",
        primaryjoin="Case.id == case_client_association.c.case_id",
        secondaryjoin="case_client_association.c.client_id == User.id",
        # Ensure only users with role='client' are added here if possible, 
        # though enforcement is best done in CRUD logic.
    )
    
    messages = relationship("Message", back_populates="case")
    document_requests = relationship("DocumentRequest", back_populates="case", order_by="DocumentRequest.created_at.desc()")


class Message(Base):
    """
    Represents a message sent within a case.
    """
    __tablename__ = "messages"
    
    id = Column(Integer, primary_key=True, index=True)
    content = Column(String, nullable=False)
    timestamp = Column(DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc))
    is_read = Column(Boolean, default=False)
    
    message_type = Column(String, default='text')
    
    channel = Column(String, default="portal", nullable=False)

    # Text-message delivery for this message (None = not texted).
    # Outbound: sending, sent, delivered, failed, opted_out, no_phone, simulated.
    # Inbound texts from a client: received.
    sms_status = Column(String, nullable=True)
    sms_sid = Column(String, unique=True, index=True, nullable=True)  # Twilio SM... id
    sms_error = Column(String, nullable=True)  # plain-language reason when it failed

    # The thread this message belongs to (one per phone number).
    conversation_id = Column(Integer, ForeignKey("conversations.id"), nullable=True, index=True)
    # The matter it is logged against. A message can belong to a case, a lead, or
    # (for a text from an unknown number) neither yet.
    case_id = Column(Integer, ForeignKey("cases.id"), nullable=True)
    lead_id = Column(Integer, ForeignKey("leads.id"), nullable=True)
    # Empty for a text from someone who has no portal account (a lead, an unknown number).
    sender_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    conversation = relationship("Conversation", back_populates="messages")
    lead = relationship("Lead")
    case = relationship("Case", back_populates="messages")
    sender_user = relationship("User", back_populates="sent_messages")
    
    document_request = relationship(
        "DocumentRequest", 
        back_populates="chat_message",
        uselist=False,
        cascade="all, delete-orphan",
        primaryjoin="Message.id == DocumentRequest.message_id" 
    )

# =========================================================================
# 4. DIRECT MESSAGES (user-to-user, not tied to a case)
# =========================================================================

class Lead(Base):
    """A LeadBase lead. Typed in by staff for now; filled in by the robo bridge later."""
    __tablename__ = "leads"

    id = Column(Integer, primary_key=True, index=True)
    lead_number = Column(String, unique=True, index=True, nullable=False)  # LeadBase lead ID
    first_name = Column(String, nullable=True)
    last_name = Column(String, nullable=True)
    phone = Column(String, index=True, nullable=True)  # E.164
    status = Column(String, nullable=False, default="open", server_default="open")  # open, signed, closed
    assigned_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    # Filled by the robo bridge from LeadBase (PB0 and PB2). Empty for leads typed in by hand.
    lawbase_serial = Column(Integer, unique=True, index=True, nullable=True)  # PB0.Serial, LawBase's own key
    source = Column(String, nullable=False, default="manual", server_default="manual")  # manual or lawbase
    lead_type = Column(String, nullable=True)        # AUTO, W/C, FALLDOWN...
    lb_status = Column(String, nullable=True)        # LeadBase Status: New, In Progress, Accepted, Rejected, Closed
    lb_current_status = Column(String, nullable=True)  # LeadBase Current Status (the reason)
    security_level = Column(Integer, nullable=True)  # PB0.Security, decides who may see it (task 2.7)
    assigned_login = Column(String, nullable=True)   # LawBase login of the assigned person
    assigned_name = Column(String, nullable=True)
    email = Column(String, nullable=True)
    language = Column(String, nullable=True)
    synced_at = Column(DateTime, nullable=True)
    created_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc))

    assigned_user = relationship("User", foreign_keys=[assigned_user_id])

    @property
    def name(self):
        return " ".join(p for p in [self.first_name, self.last_name] if p) or None


class Conversation(Base):
    """Every text thread is with one phone number.

    It is linked to the matter it is about: a case, a lead, or neither yet
    ("Needs assigning"). When a lead signs, case_id is set and lead_id stays,
    so the history of how the conversation started is kept.
    """
    __tablename__ = "conversations"

    id = Column(Integer, primary_key=True, index=True)
    phone = Column(String, unique=True, index=True, nullable=False)  # E.164
    contact_name = Column(String, nullable=True)
    lead_id = Column(Integer, ForeignKey("leads.id"), nullable=True, index=True)
    case_id = Column(Integer, ForeignKey("cases.id"), nullable=True, index=True)
    created_at = Column(DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc))
    last_message_at = Column(DateTime, nullable=True, index=True)
    # The number texted STOP. Kept here because leads and unknown numbers have no profile.
    sms_opted_out = Column(Boolean, default=False, nullable=False, server_default="0")
    sms_opted_out_at = Column(DateTime, nullable=True)
    # Staff marked it "Not related" (wrong number, spam). A new text brings it back.
    dismissed_at = Column(DateTime, nullable=True)

    lead = relationship("Lead")
    case = relationship("Case")
    messages = relationship("Message", back_populates="conversation")

    @property
    def kind(self):
        """Which list it shows in: case, lead, or unassigned."""
        if self.case_id:
            return "case"
        if self.lead_id:
            return "lead"
        return "unassigned"


class FileRequest(Base):
    """A request for documents, sent to a phone number as a secure upload link.

    The link (token) works without a login, expires (7 days by default), and can be
    extended or revoked by staff. Every send, open, upload and download is recorded
    in FileRequestEvent so staff can see exactly what happened and when.
    """
    __tablename__ = "file_requests"

    id = Column(Integer, primary_key=True, index=True)
    token = Column(String, unique=True, index=True, nullable=False)
    # "request": the firm asks for documents (they upload). "send": the firm sends
    # documents (they download). Same link, expiry and tracking either way.
    direction = Column(String, nullable=False, default="request", server_default="request")
    conversation_id = Column(Integer, ForeignKey("conversations.id"), nullable=False, index=True)
    lead_id = Column(Integer, ForeignKey("leads.id"), nullable=True, index=True)
    case_id = Column(Integer, ForeignKey("cases.id"), nullable=True, index=True)
    message_id = Column(Integer, ForeignKey("messages.id"), nullable=True)  # the text that carried the link
    note = Column(String, nullable=True)
    created_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc))
    expires_at = Column(DateTime, nullable=False)
    revoked_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)  # every item has at least one file

    conversation = relationship("Conversation")
    lead = relationship("Lead")
    created_by = relationship("User", foreign_keys=[created_by_user_id])
    items = relationship("FileRequestItem", back_populates="request", cascade="all, delete-orphan",
                         order_by="FileRequestItem.position")
    files = relationship("RequestFile", back_populates="request", cascade="all, delete-orphan",
                         order_by="RequestFile.uploaded_at")
    events = relationship("FileRequestEvent", back_populates="request", cascade="all, delete-orphan",
                          order_by="FileRequestEvent.at")


class FileRequestItem(Base):
    """One document asked for ("Insurance card"). It can receive several files (front and back)."""
    __tablename__ = "file_request_items"

    id = Column(Integer, primary_key=True, index=True)
    request_id = Column(Integer, ForeignKey("file_requests.id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    position = Column(Integer, nullable=False, default=0)
    received_at = Column(DateTime, nullable=True)  # first file arrived

    request = relationship("FileRequest", back_populates="items")
    files = relationship("RequestFile", back_populates="item")


class RequestFile(Base):
    """A file someone uploaded through a request link. Stored under a random name."""
    __tablename__ = "request_files"

    id = Column(Integer, primary_key=True, index=True)
    request_id = Column(Integer, ForeignKey("file_requests.id"), nullable=False, index=True)
    item_id = Column(Integer, ForeignKey("file_request_items.id"), nullable=True, index=True)
    original_name = Column(String, nullable=False)
    stored_path = Column(String, nullable=False)
    content_type = Column(String, nullable=False)
    size_bytes = Column(Integer, nullable=False)
    sha256 = Column(String, nullable=False)
    uploaded_at = Column(DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc))

    request = relationship("FileRequest", back_populates="files")
    item = relationship("FileRequestItem", back_populates="files")


class FileRequestEvent(Base):
    """What happened to a request: sent, opened, uploaded, downloaded, extended, revoked."""
    __tablename__ = "file_request_events"

    id = Column(Integer, primary_key=True, index=True)
    request_id = Column(Integer, ForeignKey("file_requests.id"), nullable=False, index=True)
    kind = Column(String, nullable=False)
    at = Column(DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc), index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # staff member, when staff did it
    file_id = Column(Integer, ForeignKey("request_files.id"), nullable=True)  # the file, for uploads and downloads
    detail = Column(String, nullable=True)  # file name, new expiry, browser, address

    request = relationship("FileRequest", back_populates="events")
    user = relationship("User")


class DirectMessage(Base):
    __tablename__ = "direct_messages"

    id = Column(Integer, primary_key=True, index=True)
    content = Column(String, nullable=False)
    timestamp = Column(DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc))
    is_read = Column(Boolean, default=False)

    sender_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    receiver_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    sender = relationship("User", foreign_keys=[sender_id], back_populates="sent_direct_messages")
    receiver = relationship("User", foreign_keys=[receiver_id], back_populates="received_direct_messages")


# =========================================================================
# 5. AWAITING SMS
# =========================================================================

class AwaitingSMS(Base):
    __tablename__ = "awaiting_sms"
    
    id = Column(Integer, primary_key=True, index=True)
    client_phone_number = Column(String, index=True, nullable=False)
    sms_body = Column(String, nullable=False)
    received_at = Column(DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc))
    
    status = Column(String, default="pending", index=True)
    
    client_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    assigned_case_id = Column(Integer, ForeignKey("cases.id"), nullable=True)
    assigned_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    assigned_at = Column(DateTime, nullable=True)

    client = relationship(
        "User",
        back_populates="awaiting_sms",
        foreign_keys=[client_id],
    )
    assigned_case = relationship("Case", foreign_keys=[assigned_case_id])
    assigned_by_user = relationship("User", foreign_keys=[assigned_by_user_id])

# =========================================================================
# 5. DOCUMENT REQUEST TABLES
# =========================================================================

class DocumentRequest(Base):
    __tablename__ = "document_requests"

    id = Column(Integer, primary_key=True, index=True)
    case_id = Column(Integer, ForeignKey("cases.id"), nullable=False)
    lawyer_id = Column(Integer, ForeignKey("users.id"), nullable=False) # Keep single tracking lawyer for SMS responsibility
    
    message_id = Column(Integer, ForeignKey("messages.id"), unique=True, nullable=True) 
    deadline = Column(DateTime, nullable=True) 
    note = Column(String, nullable=True)

    access_token = Column(String, unique=True, index=True, nullable=False)
    token_expires_at = Column(DateTime, nullable=False) 
    
    status = Column(String, default="pending", nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc))

    # Relationships
    case = relationship("Case", back_populates="document_requests")
    requested_documents = relationship("RequestedDocument", back_populates="request", cascade="all, delete-orphan")
    lawyer = relationship("User", foreign_keys=[lawyer_id])
    
    chat_message = relationship("Message", back_populates="document_request", uselist=False)


class RequestedDocument(Base):
    __tablename__ = "requested_documents"
    
    id = Column(Integer, primary_key=True, index=True)
    request_id = Column(Integer, ForeignKey("document_requests.id"), nullable=False)
    
    name = Column(String, nullable=False)
    status = Column(String, default="required", nullable=False) 

    file_id = Column(Integer, nullable=True) 
    file_path = Column(String, nullable=True)
    
    request = relationship("DocumentRequest", back_populates="requested_documents")
