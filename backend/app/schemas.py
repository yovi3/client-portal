from pydantic import BaseModel, EmailStr
from typing import Optional

# Lawyer Schemas
class LawyerBase(BaseModel):
    email: EmailStr
    name: str

class LawyerCreate(LawyerBase):
    password: str
    aad_id: Optional[str] = None

class LawyerLogin(BaseModel):
    email: EmailStr
    password: str

class Lawyer(LawyerBase):
    id: int
    aad_id: Optional[str] = None

    class Config:
        from_attributes = True

# Client Schemas
class ClientBase(BaseModel):
    name: str
    email: str
    phone: Optional[str] = None

class ClientCreate(ClientBase):
    joined_date: Optional[str] = None

class Client(ClientBase):
    id: int
    active_cases: int = 0
    joined_date: Optional[str] = None

    class Config:
        from_attributes = True

# Case Schemas
class CaseBase(BaseModel):
    title: str
    description: Optional[str] = None
    status: Optional[str] = "active"
    priority: Optional[str] = "medium"
    category: Optional[str] = "General"

class CaseCreate(CaseBase):
    client_id: int
    assigned_lawyer_id: Optional[int] = None

class Case(CaseBase):
    id: int
    unread_messages: int = 0
    assigned_lawyer_id: Optional[int] = None
    client_id: int

    class Config:
        from_attributes = True