from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Boolean, Enum, func
from sqlalchemy.orm import relationship, backref
from .database import Base
import datetime

# =========================================================================
# 1. CORE USER TABLE (The Authentication Hub)
# =========================================================================

class User(Base):
    """
    Central table for all users (lawyers, clients, admins).
    Handles authentication and common fields.
    """
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(String, nullable=False) # 'lawyer', 'client', 'admin'
    
    # Relationships for linking to profile tables (one-to-one)
    lawyer_profile = relationship(
        "LawyerProfile", 
        back_populates="user", 
        uselist=False,
        cascade="all, delete-orphan"
    )
    
    client_profile = relationship(
        "ClientProfile", 
        back_populates="user", 
        uselist=False,
        cascade="all, delete-orphan"
    )

    # Relationships for the Case/Message tables (many-to-one)
    cases_as_lawyer = relationship(
        "Case", 
        foreign_keys="[Case.assigned_lawyer_id]", 
        back_populates="assigned_lawyer_user"
    )
    cases_as_client = relationship(
        "Case", 
        foreign_keys="[Case.client_id]", 
        back_populates="client_user"
    )
    sent_messages = relationship("Message", back_populates="sender_user")
    
    # Relationship for AwaitingSMS
    awaiting_sms = relationship("AwaitingSMS", back_populates="client")

# =========================================================================
# 2. PROFILE TABLES (The Unique Data)
# =========================================================================

class LawyerProfile(Base):
    """
    Holds data unique to lawyers (one-to-one relationship with User).
    """
    __tablename__ = "lawyer_profiles"
    
    user_id = Column(Integer, ForeignKey("users.id"), primary_key=True)
    
    bar_number = Column(String, unique=True, nullable=False)
    specialty = Column(String)
    firm_name = Column(String)
    hourly_rate = Column(Integer, default=250)
    aad_id = Column(String, unique=True, nullable=True)
    
    user = relationship("User", back_populates="lawyer_profile")

class ClientProfile(Base):
    """
    Holds data unique to clients (one-to-one relationship with User).
    """
    __tablename__ = "client_profiles"
    
    user_id = Column(Integer, ForeignKey("users.id"), primary_key=True)
    
    phone = Column(String, index=True) 
    address = Column(String)
    active_cases = Column(Integer, default=0)
    joined_date = Column(DateTime, default=datetime.datetime.utcnow)

    user = relationship("User", back_populates="client_profile")

# =========================================================================
# 3. INTERACTION TABLES (Case and Message)
# =========================================================================

class Case(Base):
    """
    Represents a legal case, linking one lawyer and one client (both are Users).
    """
    __tablename__ = "cases"
    
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True)
    description = Column(String)
    status = Column(String, default="active")
    priority = Column(String, default="medium")
    category = Column(String, default="General")
    
    sms_id_tag = Column(String(10), unique=True, index=True, nullable=False)
    
    assigned_lawyer_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    client_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    assigned_lawyer_user = relationship(
        "User", 
        foreign_keys=[assigned_lawyer_id], 
        back_populates="cases_as_lawyer"
    )
    client_user = relationship(
        "User", 
        foreign_keys=[client_id], 
        back_populates="cases_as_client"
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
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)
    is_read = Column(Boolean, default=False)
    
    # ✅ FIX 1: The column for message type
    message_type = Column(String, default='text')
    
    channel = Column(String, default="portal", nullable=False) # 'portal' or 'sms'
    
    case_id = Column(Integer, ForeignKey("cases.id"), nullable=False)
    sender_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    case = relationship("Case", back_populates="messages")
    sender_user = relationship("User", back_populates="sent_messages")
    
    # ✅ FIX 3: Relationship to DocumentRequest (uselist=False for one-to-one)
    # This allows Pydantic to automatically load the document_request object
    document_request = relationship(
        "DocumentRequest", 
        back_populates="chat_message",
        uselist=False,
        cascade="all, delete-orphan",
        # Use primaryjoin to explicitly link if necessary, though ForeignKey should suffice
        primaryjoin="Message.id == DocumentRequest.message_id" 
    )

# =========================================================================
# 4. AWAITING SMS
# =========================================================================

class AwaitingSMS(Base):
    """
    Stores SMS messages that could not be automatically assigned to a case.
    """
    __tablename__ = "awaiting_sms"
    
    id = Column(Integer, primary_key=True, index=True)
    client_phone_number = Column(String, index=True, nullable=False)
    sms_body = Column(String, nullable=False)
    received_at = Column(DateTime, default=datetime.datetime.utcnow)
    
    status = Column(String, default="pending", index=True)
    
    client_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    client = relationship("User", back_populates="awaiting_sms")

# =========================================================================
# 5. DOCUMENT REQUEST TABLES
# =========================================================================

class DocumentRequest(Base):
    """
    Represents a formal request for one or more documents from a client.
    """
    __tablename__ = "document_requests"

    id = Column(Integer, primary_key=True, index=True)
    case_id = Column(Integer, ForeignKey("cases.id"), nullable=False)
    lawyer_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    # ✅ FIX 2A: Foreign Key to the Message table (One-to-One Link)
    message_id = Column(Integer, ForeignKey("messages.id"), unique=True, nullable=True) 
    
    # ✅ FIX 2B: Deadline column
    deadline = Column(DateTime, nullable=True) 

    access_token = Column(String, unique=True, index=True, nullable=False)
    token_expires_at = Column(DateTime, nullable=False) 
    
    status = Column(String, default="pending", nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Relationships
    case = relationship("Case", back_populates="document_requests")
    requested_documents = relationship("RequestedDocument", back_populates="request", cascade="all, delete-orphan")
    lawyer = relationship("User", foreign_keys=[lawyer_id])
    
    # ✅ FIX 2C: Back-reference to the Message (crucial for Pydantic mapping)
    chat_message = relationship("Message", back_populates="document_request", uselist=False)


class RequestedDocument(Base):
    """
    Represents a single required document or item within a DocumentRequest.
    """
    __tablename__ = "requested_documents"
    
    id = Column(Integer, primary_key=True, index=True)
    request_id = Column(Integer, ForeignKey("document_requests.id"), nullable=False)
    
    name = Column(String, nullable=False)
    status = Column(String, default="required", nullable=False) 

    file_id = Column(Integer, nullable=True) 
    
    file_path = Column(String, nullable=True)
    
    request = relationship("DocumentRequest", back_populates="requested_documents")