from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Boolean
from sqlalchemy.orm import relationship
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
    
    # 🔑 Role-Based Access Control (RBAC) Column
    # Use this column for all access control checks.
    role = Column(String, nullable=False) # 'lawyer', 'client', 'admin'
    
    # Relationships for linking to profile tables (one-to-one)
    lawyer_profile = relationship(
        "LawyerProfile", 
        back_populates="user", 
        uselist=False, # Enforces one-to-one relationship
        cascade="all, delete-orphan"
    )
    
    client_profile = relationship(
        "ClientProfile", 
        back_populates="user", 
        uselist=False,
        cascade="all, delete-orphan"
    )

    # Relationships for the Case/Message tables (many-to-one)
    # Note: A User is a lawyer in one context and a client in another.
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
    
# =========================================================================
# 2. PROFILE TABLES (The Unique Data)
# =========================================================================

class LawyerProfile(Base):
    """
    Holds data unique to lawyers (one-to-one relationship with User).
    """
    __tablename__ = "lawyer_profiles"
    
    # Primary key is also the foreign key to ensure one-to-one
    user_id = Column(Integer, ForeignKey("users.id"), primary_key=True)
    
    # Lawyer-specific fields
    bar_number = Column(String, unique=True, nullable=False)
    specialty = Column(String)
    firm_name = Column(String)
    hourly_rate = Column(Integer, default=250)
    aad_id = Column(String, unique=True, nullable=True)  # Azure AD object ID
    
    # Relationship back to the User table
    user = relationship("User", back_populates="lawyer_profile")

class ClientProfile(Base):
    """
    Holds data unique to clients (one-to-one relationship with User).
    """
    __tablename__ = "client_profiles"
    
    # Primary key is also the foreign key to ensure one-to-one
    user_id = Column(Integer, ForeignKey("users.id"), primary_key=True)
    
    # Client-specific fields
    phone = Column(String)
    address = Column(String)
    active_cases = Column(Integer, default=0)
    joined_date = Column(DateTime, default=datetime.datetime.utcnow)

    # Relationship back to the User table
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
    
    # Foreign keys point to the single 'users' table
    assigned_lawyer_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    client_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    # Relationships - crucial for handling multiple foreign keys to the same table
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

class Message(Base):
    """
    Represents a message sent within a case.
    Requires only ONE sender_id pointing to the User table.
    """
    __tablename__ = "messages"
    
    id = Column(Integer, primary_key=True, index=True)
    content = Column(String, nullable=False)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)
    is_read = Column(Boolean, default=False)
    
    case_id = Column(Integer, ForeignKey("cases.id"), nullable=False)
    
    # ✅ Only ONE sender ID is needed, pointing to the single User table
    sender_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    # Define relationships
    case = relationship("Case", back_populates="messages")
    sender_user = relationship("User", back_populates="sent_messages")