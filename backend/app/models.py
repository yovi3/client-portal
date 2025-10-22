from sqlalchemy import Column, Integer, String, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from .database import Base

class Lawyer(Base):
    __tablename__ = "lawyers"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    name = Column(String)
    hashed_password = Column(String)  # Changed from password_hash for consistency
    aad_id = Column(String, unique=True, nullable=True)  # Azure AD object ID
    cases = relationship("Case", back_populates="assigned_lawyer")

class Client(Base):
    __tablename__ = "clients"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    email = Column(String)
    phone = Column(String)
    active_cases = Column(Integer, default=0)
    joined_date = Column(String)
    cases = relationship("Case", back_populates="client_info")

class Case(Base):
    __tablename__ = "cases"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True)
    description = Column(String)
    status = Column(String, default="active")  # active, pending, closed
    priority = Column(String, default="medium")  # high, medium, low
    unread_messages = Column(Integer, default=0)
    category = Column(String, default="General")
    assigned_lawyer_id = Column(Integer, ForeignKey("lawyers.id"))
    client_id = Column(Integer, ForeignKey("clients.id"))

    assigned_lawyer = relationship("Lawyer", back_populates="cases")
    client_info = relationship("Client", back_populates="cases")