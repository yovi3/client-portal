from sqlalchemy.orm import Session
from . import models, schemas, auth
from datetime import datetime

# Lawyers
def get_lawyer_by_email(db: Session, email: str):
    return db.query(models.Lawyer).filter(models.Lawyer.email == email).first()

def get_lawyer_by_aad(db: Session, aad_id: str):
    return db.query(models.Lawyer).filter(models.Lawyer.aad_id == aad_id).first()

def create_lawyer(db: Session, lawyer_data: schemas.LawyerCreate):
    hashed_pw = auth.hash_password(lawyer_data.password)
    db_lawyer = models.Lawyer(
        email=lawyer_data.email,
        name=lawyer_data.name,
        hashed_password=hashed_pw,
        aad_id=lawyer_data.aad_id
    )
    db.add(db_lawyer)
    db.commit()
    db.refresh(db_lawyer)
    return db_lawyer

def authenticate_lawyer(db: Session, email: str, password: str):
    lawyer = get_lawyer_by_email(db, email)
    if not lawyer:
        return None
    if not auth.verify_password(password, lawyer.hashed_password):
        return None
    return lawyer

# Clients
def get_clients(db: Session, skip: int = 0, limit: int = 100):
    return db.query(models.Client).offset(skip).limit(limit).all()

def get_client(db: Session, client_id: int):
    return db.query(models.Client).filter(models.Client.id == client_id).first()

def create_client(db: Session, client: schemas.ClientCreate):
    db_client = models.Client(
        name=client.name,
        email=client.email,
        phone=client.phone,
        joined_date=client.joined_date or datetime.now().strftime("%Y-%m-%d")
    )
    db.add(db_client)
    db.commit()
    db.refresh(db_client)
    return db_client

# Cases
def get_cases(db: Session, skip: int = 0, limit: int = 100):
    return db.query(models.Case).offset(skip).limit(limit).all()

def get_lawyer_cases(db: Session, lawyer_id: int):
    return db.query(models.Case).filter(models.Case.assigned_lawyer_id == lawyer_id).all()

def create_case(db: Session, case: schemas.CaseCreate):
    db_case = models.Case(**case.dict())
    db.add(db_case)
    db.commit()
    db.refresh(db_case)
    
    # Update client's active cases count
    client = db.query(models.Client).filter(models.Client.id == case.client_id).first()
    if client:
        client.active_cases += 1
        db.commit()
    
    return db_case