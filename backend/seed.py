import sys
import os
import datetime
from fastapi import HTTPException
from typing import Optional

# This allows the script to find your 'app' module
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '.')))

# Assuming crud, schemas, and database modules exist in 'app'
from app import crud, schemas, database
from app.database import SessionLocal, engine, Base
from sqlalchemy.orm import Session
from app import models

# !!! IMPORTANT !!!
# Replace these numbers with real, Twilio-verified numbers (E.164 format: +48123456789)
TEST_CLIENT_PHONE_1 = "+48123456789"
TEST_CLIENT_PHONE_2 = "+48987654321"

def seed_database():
    print("Connecting to database...")
    db: Session = SessionLocal()
    
    # --- FIX: Initialize all required IDs to avoid UnboundLocalError in exception handler ---
    lawyer_1_id: Optional[int] = None
    personnel_2_id: Optional[int] = None
    accountant_id: Optional[int] = None
    client_1_id: Optional[int] = None
    client_2_id: Optional[int] = None
    case_1_id: Optional[int] = None
    case_2_id: Optional[int] = None
    # --------------------------------------------------------------------------------------
    
    try:
        print("Dropping and re-creating all tables...")
        Base.metadata.drop_all(bind=engine)
        Base.metadata.create_all(bind=engine)

        # ==================================================================
        # --- 1. USER CREATION (Lawyer, Accountant, Clients) ---
        # ==================================================================
        
        # Lawyer 1 (Primary)
        print("Creating Primary Lawyer (ID: 1)...")
        lawyer_data_1 = schemas.UserCreate(
            email="lawyer1@example.com", name="Alice Prime Lawyer", password="password123", 
            role="lawyer", profile_data={"bar_number": "L-5000"}
        )
        lawyer_1 = crud.create_user(db=db, user_data=lawyer_data_1)
        lawyer_1_id = lawyer_1.id
        
        # Lawyer 2 / Paralegal
        print("Creating Secondary Personnel (ID: 2)...")
        lawyer_data_2 = schemas.UserCreate(
            email="paralegal@example.com", name="Bob Secondary", password="password123", 
            role="paralegal", profile_data={"bar_number": "P-001"}
        )
        personnel_2 = crud.create_user(db=db, user_data=lawyer_data_2)
        personnel_2_id = personnel_2.id

        # Accountant
        print("Creating Accountant (ID: 3)...")
        accountant_data = schemas.UserCreate(
            email="accountant@example.com", name="Charlie Accountant", password="password123", 
            role="accountant", profile_data={"bar_number": "A-100"}
        )
        accountant = crud.create_user(db=db, user_data=accountant_data)
        accountant_id = accountant.id

        # Client 1 (Smith)
        print(f"Creating Client 1 (Client Smith, ID: 4) with phone {TEST_CLIENT_PHONE_1}...")
        client_data_1 = schemas.UserCreate(
            email="client@example.com", name="Client Smith", password="password123", role="client",
            profile_data={"phone": TEST_CLIENT_PHONE_1}
        )
        client_1 = crud.create_user(db=db, user_data=client_data_1)
        client_1_id = client_1.id

        # Client 2 (TechCorp)
        print(f"Creating Client 2 (TechCorp Inc., ID: 5) with phone {TEST_CLIENT_PHONE_2}...")
        client_data_2 = schemas.UserCreate(
            email="techcorp@example.com", name="TechCorp Inc.", password="password123", role="client",
            profile_data={"phone": TEST_CLIENT_PHONE_2}
        )
        client_2 = crud.create_user(db=db, user_data=client_data_2) 
        client_2_id = client_2.id

        # ==================================================================
        # --- 2. CASE CREATION (Using M2M Lists) ---
        # ==================================================================
        
        # Case 1: Simple Case (1 Client, 1 Lawyer)
        print("\nCreating Case 1 (Smith vs. World - Simple M2M)...")
        case_in_1 = schemas.CaseCreate(
            title="Smith vs. World - Simple M2M",
            description="A test case with minimal M2M assignments.",
            client_ids=[client_1_id],
            personnel_ids=[lawyer_1_id],
        )
        case_1 = crud.create_case(db=db, case=case_in_1)
        case_1_id = case_1.id

        # Case 2: Complex Case (2 Clients, 3 Personnel roles)
        print("Creating Case 2 (Complex - Multi-Team)...")
        case_in_2 = schemas.CaseCreate(
            title="Complex Contract Review (TechCorp & Smith)",
            description="Case requiring multiple personnel types.",
            client_ids=[client_1_id, client_2_id],
            personnel_ids=[lawyer_1_id, personnel_2_id, accountant_id],
        )
        case_2 = crud.create_case(db=db, case=case_in_2)
        case_2_id = case_2.id
        
        # ==================================================================
        # --- 3. MESSAGE CREATION (NO DOCUMENT REQUESTS) ---
        # ==================================================================
        print("\nCreating messages...")

        # Message 1 (Case 1): Client message
        msg_in_1 = schemas.MessageCreate(
            content="Hello, team. What are the next steps for my simple case?",
            case_id=case_1_id, sender_id=client_1_id, channel="portal", message_type="text"
        )
        crud.create_message(db=db, message=msg_in_1)

        # Message 2 (Case 2): Lawyer message
        msg_in_2 = schemas.MessageCreate(
            content="Team check-in: Accountant, have you reviewed the figures yet?",
            case_id=case_2_id, sender_id=lawyer_1_id, channel="portal", message_type="text"
        )
        crud.create_message(db=db, message=msg_in_2)
        
        print("\nDatabase seeding successful! (M2M ready for testing.)")

    except HTTPException as e:
        print(f"\n[HTTP ERROR] Case creation failed: {e.detail}")
        db.rollback()
    except Exception as e:
        print(f"\n[GENERAL ERROR] An error occurred: {e}")
        db.rollback()
    finally:
        print("Closing database session.")
        db.close()

if __name__ == "__main__":
    seed_database()
