from pydantic import BaseModel, EmailStr
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

    client_user: Optional[User] = None
    assigned_lawyer_user: Optional[User] = None
    
    unread_count: int = 0  # ✅ ADDED THIS FIELD

    class Config:
        from_attributes = True


# =========================================================================
# MESSAGE
# =========================================================================

class MessageBase(BaseModel):
    content: str
    case_id: int


class MessageCreate(MessageBase):
    sender_id: int


class Message(MessageBase):
    id: int
    timestamp: datetime
    sender_id: int
    is_read: bool 

    sender_user: Optional[User] = None 

    class Config:
        from_attributes = True
        
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