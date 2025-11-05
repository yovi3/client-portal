import sys
import os

# This allows the script to find your 'app' module
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '.')))

# Assuming crud, schemas, and database modules exist in 'app'
# You will need to update your crud functions (e.g., create_lawyer, create_client) 
# to now call a single `crud.create_user` function.
from app import crud, schemas, database
from app.database import SessionLocal, engine, Base
from sqlalchemy.orm import Session
from app import models

def seed_database():
    print("Connecting to database...")
    db: Session = SessionLocal()
    
    try:
        print("Dropping and re-creating all tables...")
        # This will delete all existing data, which is good for testing
        Base.metadata.drop_all(bind=engine)
        Base.metadata.create_all(bind=engine)

        # ------------------------------------------------------------------
        # --- 1. Create Lawyer User (Role: 'lawyer')
        # ------------------------------------------------------------------
        # Note: You now use a unified UserCreate schema and a single creation function
        print("Creating Lawyer User (ID: 1)...")
        lawyer_data = schemas.UserCreate(
            email="lawyer@example.com",
            name="Test Lawyer",
            password="password123", 
            role="lawyer", # Explicitly set the role
            # Include profile data for the CRUD function to handle
            profile_data={"bar_number": "L-5000", "specialty": "General"}
        )
        # This function should create the User and the LawyerProfile simultaneously
        lawyer = crud.create_user(db=db, user_data=lawyer_data)
        print(f"Created lawyer: {lawyer.name} (ID: {lawyer.id})")
        # Ensure the ID is available for foreign keys
        lawyer_id = lawyer.id


        # ------------------------------------------------------------------
        # --- 2. Create Client User 1 (Role: 'client')
        # ------------------------------------------------------------------
        print("Creating Client 1 (Client Smith, ID: 2)...")
        client_data_1 = schemas.UserCreate(
            email="client@example.com",
            name="Client Smith",
            password="password123", # Clients also need a password for login
            role="client",
            # Include profile data
            profile_data={"phone": "123-456-7890"}
        )
        client_1 = crud.create_user(db=db, user_data=client_data_1)
        print(f"Created client: {client_1.name} (ID: {client_1.id})")
        client_1_id = client_1.id

        
        # ------------------------------------------------------------------
        # --- 3. Create Case 1 ---
        # ------------------------------------------------------------------
        print("Creating Case 1 (for Client Smith)...")
        case_in_1 = schemas.CaseCreate(
            title="Smith vs. World - Test Case",
            description="A test case to see if the messaging app works.",
            client_id=client_1_id,              # Use the new User IDs
            assigned_lawyer_id=lawyer_id,     # Use the new User IDs
            category="General"
        )
        case_1 = crud.create_case(db=db, case=case_in_1)
        print(f"Created case: {case_1.title} (ID: {case_1.id})")
        case_1_id = case_1.id


        # ------------------------------------------------------------------
        # --- 4. Create Client User 2 (Role: 'client')
        # ------------------------------------------------------------------
        print("Creating Client 2 (TechCorp Inc.)...")
        client_data_2 = schemas.UserCreate(
            email="techcorp@example.com",
            name="TechCorp Inc.",
            password="password123",
            role="client",
            profile_data={"phone": "987-654-3210", "address": "100 Tech Blvd"}
        )
        client_2 = crud.create_user(db=db, user_data=client_data_2)
        print(f"Created client: {client_2.name} (ID: {client_2.id})")
        client_2_id = client_2.id


        # ------------------------------------------------------------------
        # --- 5. Create Case 2 ---
        # ------------------------------------------------------------------
        print("Creating Case 2 (for TechCorp)...")
        case_in_2 = schemas.CaseCreate(
            title="TechCorp Contract Review",
            description="Reviewing the new vendor contract.",
            client_id=client_2_id,              # Use the new User IDs
            assigned_lawyer_id=lawyer_id,     # Use the new User IDs
            category="Contract"
        )
        case_2 = crud.create_case(db=db, case=case_in_2)
        print(f"Created case: {case_2.title} (ID: {case_2.id})")
        case_2_id = case_2.id
        

        # ==================================================================
        # --- 6. Create Messages (Using the single 'sender_id') ---
        # ==================================================================
        print("\nCreating messages for Case 1 (Smith vs. World)...")

        # Message 1: From Client to Lawyer
        msg_in_1 = schemas.MessageCreate(
            content="Hello, lawyer. I have a question about my case.",
            case_id=case_1_id,
            sender_id=client_1_id,  # ONLY USE sender_id
            is_read = False
        )
        msg_1 = crud.create_message(db=db, message=msg_in_1)
        print(f"  > Message from Client (ID: {msg_1.sender_id}): {msg_1.content}")

        # Message 2: From Lawyer back to Client
        msg_in_2 = schemas.MessageCreate(
            content="Of course, Client Smith. What is your question?",
            case_id=case_1_id,
            sender_id=lawyer_id,     # ONLY USE sender_id
            is_read = False
        )
        msg_2 = crud.create_message(db=db, message=msg_in_2)
        print(f"  > Message from Lawyer (ID: {msg_2.sender_id}): {msg_2.content}")
        
        # Message 5: From Client 2 (TechCorp)
        msg_in_5 = schemas.MessageCreate(
            content="Thank you, we will review this immediately.",
            case_id=case_2_id,
            sender_id=client_2_id     # ONLY USE sender_id
        )
        msg_5 = crud.create_message(db=db, message=msg_in_5)
        print(f"  > Message from Client (ID: {msg_5.sender_id}): {msg_5.content}")


        print("\nDatabase seeding successful!")

    except Exception as e:
        print(f"An error occurred: {e}")
        db.rollback()
    finally:
        print("Closing database session.")
        db.close()

if __name__ == "__main__":
    seed_database()