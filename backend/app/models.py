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
    hashed_password = Column(String, nullable=False)
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
    active_cases = Column(Integer, default=0)
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
    
    case_id = Column(Integer, ForeignKey("cases.id"), nullable=False)
    sender_id = Column(Integer, ForeignKey("users.id"), nullable=False)

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
# 4. AWAITING SMS
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
