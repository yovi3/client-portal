import sys
import os
import datetime

# This allows the script to find your 'app' module
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '.')))

# Assuming crud, schemas, and database modules exist in 'app'
from app import crud, schemas, database
from app.database import SessionLocal, engine, Base
from sqlalchemy.orm import Session
from app import models

# !!! WAŻNE !!!
# Zastąp te numery prawdziwymi numerami (z Twojego konta Twilio lub zweryfikowanymi),
# aby móc testować. Muszą być w formacie E.164 (zaczynać się od +).
TEST_CLIENT_PHONE_1 = "+48123456789" # Replace with your number
TEST_CLIENT_PHONE_2 = "+48987654321" # Replace with another number

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
        print("Creating Lawyer User (ID: 1)...")
        lawyer_data = schemas.UserCreate(
            email="lawyer@example.com",
            name="Test Lawyer",
            password="password123", 
            role="lawyer",
            profile_data={"bar_number": "L-5000", "specialty": "General"}
        )
        lawyer = crud.create_user(db=db, user_data=lawyer_data)
        print(f"Created lawyer: {lawyer.name} (ID: {lawyer.id})")
        lawyer_id = lawyer.id


        # ------------------------------------------------------------------
        # --- 2. Create Client User 1 (Role: 'client')
        # ------------------------------------------------------------------
        print(f"Creating Client 1 (Client Smith, ID: 2) with phone {TEST_CLIENT_PHONE_1}...")
        client_data_1 = schemas.UserCreate(
            email="client@example.com",
            name="Client Smith",
            password="password123",
            role="client",
            profile_data={"phone": TEST_CLIENT_PHONE_1}
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
            client_id=client_1_id,              
            assigned_lawyer_id=lawyer_id,     
        )
        # Note: The 'category' field on the Case model has a default value, so removing it from schema is fine.
        case_1 = crud.create_case(db=db, case=case_in_1)
        print(f"Created case: {case_1.title} (ID: {case_1.id}) with SMS Tag: {case_1.sms_id_tag}")
        case_1_id = case_1.id


        # ------------------------------------------------------------------
        # --- 4. Create Client User 2 (Role: 'client')
        # ------------------------------------------------------------------
        print(f"Creating Client 2 (TechCorp Inc.) with phone {TEST_CLIENT_PHONE_2}...")
        client_data_2 = schemas.UserCreate(
            email="techcorp@example.com",
            name="TechCorp Inc.",
            password="password123",
            role="client",
            profile_data={"phone": TEST_CLIENT_PHONE_2, "address": "100 Tech Blvd"}
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
            client_id=client_2_id,              
            assigned_lawyer_id=lawyer_id,     
        )
        case_2 = crud.create_case(db=db, case=case_in_2)
        print(f"Created case: {case_2.title} (ID: {case_2.id}) with SMS Tag: {case_2.sms_id_tag}")
        case_2_id = case_2.id
        
        # ------------------------------------------------------------------
        # --- 6. Create Case 3 (Second case for Client 1) ---
        # ------------------------------------------------------------------
        print("Creating Case 3 (Second case for Client Smith)...")
        case_in_3 = schemas.CaseCreate(
            title="Smith - Eviction Case",
            description="Second case for testing multi-case logic.",
            client_id=client_1_id,             
            assigned_lawyer_id=lawyer_id,    
        )
        case_3 = crud.create_case(db=db, case=case_in_3)
        print(f"Created case: {case_3.title} (ID: {case_3.id}) with SMS Tag: {case_3.sms_id_tag}")


        # ==================================================================
        # --- 7. Create Normal Messages ---
        # ==================================================================
        print("\nCreating standard messages for Case 1...")

        # Message 1: From Client to Lawyer
        msg_in_1 = schemas.MessageCreate(
            content="Hello, lawyer. I have a question about my case.",
            case_id=case_1_id,
            sender_id=client_1_id,  
            channel="portal",
            message_type="text" # Explicitly set to "text"
        )
        msg_1 = crud.create_message(db=db, message=msg_in_1)
        print(f"  > Message from Client (ID: {msg_1.sender_id}): {msg_1.content}")

        # Message 2: From Lawyer back to Client
        msg_in_2 = schemas.MessageCreate(
            content="Of course, Client Smith. What is your question?",
            case_id=case_1_id,
            sender_id=lawyer_id,     
            channel="portal",
            message_type="text"
        )
        msg_2 = crud.create_message(db=db, message=msg_in_2)
        print(f"  > Message from Lawyer (ID: {msg_2.sender_id}): {msg_2.content}")
        
        # Message 5: From Client 2 (TechCorp)
        msg_in_5 = schemas.MessageCreate(
            content="Thank you, we will review this immediately.",
            case_id=case_2_id,
            sender_id=client_2_id,     
            channel="portal",
            message_type="text"
        )
        msg_5 = crud.create_message(db=db, message=msg_in_5)
        print(f"  > Message from Client (ID: {msg_5.sender_id}): {msg_5.content}")

        # ==================================================================
        # --- 8. Create Document Request Message (Structured Message) ---
        # ==================================================================
        print("\nCreating structured Document Request for Case 1...")
        
        deadline = datetime.datetime.utcnow() + datetime.timedelta(days=7)

        doc_request_data = schemas.DocumentRequestCreate(
            lawyer_id=lawyer_id,
            note="Please provide legible scans of the following documents by the deadline.",
            deadline=deadline,
            required_items=[
                schemas.RequestedDocumentCreate(name="ID Card Scan"),
                schemas.RequestedDocumentCreate(name="Proof of Address"),
                schemas.RequestedDocumentCreate(name="Signed Contract Copy"),
            ]
        )
        
        # CRUCIAL: Use the API endpoint function (or its equivalent CRUD function)
        # to ensure the MESSAGE and the DocumentRequest are created and linked.
        # This function must return the created DocumentRequest object.
        doc_request = crud.create_document_request(
            db=db,
            case_id=case_1_id,
            request_data=doc_request_data
        )

        # The message associated with this request should now have message_type='document_request'
        # and be linked to doc_request.
        print(f"  > Created Document Request (ID: {doc_request.id}) for Case 1.")
        print(f"  > The associated message should now render as a special card on the frontend.")


        print("\nDatabase seeding successful!")

    except Exception as e:
        print(f"An error occurred: {e}")
        db.rollback()
    finally:
        print("Closing database session.")
        db.close()

if __name__ == "__main__":
    seed_database()