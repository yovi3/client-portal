from fastapi import FastAPI, Depends, HTTPException, status, WebSocket, WebSocketDisconnect, Request
from fastapi.responses import Response
from sqlalchemy.orm import Session
from . import database, models, schemas, crud, auth
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Dict
import os
import shutil
from fastapi import File
from starlette.datastructures import UploadFile
from starlette.staticfiles import StaticFiles  # <--- (NEW) IMPORT STATICFILES
import re
from dotenv import load_dotenv
from twilio.rest import Client

# --- Loading environment variables from .env ---
load_dotenv()

TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN")
TWILIO_PHONE_NUMBER = os.getenv("TWILIO_PHONE_NUMBER")

# Set the base URL for the client (important for SMS link)
# Ensure this URL is publicly accessible (e.g., ngrok or domain)
CLIENT_BASE_URL = "http://localhost:5173" 

# Twilio configuration check
if not all([TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER]):
    print("WARNING: Full Twilio configuration missing in .env file. SMS functionality will not work.")
    twilio_client = None
else:
    twilio_client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)

# --- UPLOAD DIRECTORY ---
UPLOAD_DIRECTORY = "uploads"
os.makedirs(UPLOAD_DIRECTORY, exist_ok=True)


# --- Regex Configuration for SMS Tag ---
# Looks for a 4-character code at the beginning of the message (e.g., "A1B2 ...")
SMS_TAG_REGEX = re.compile(r"^(\w{4})\s*")

app = FastAPI()

# --- Table Creation ---
models.Base.metadata.create_all(bind=database.engine)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173", "http://0.0.0.0:8002", "http://127.0.0.1:8002"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- (NEW) MOUNT STATIC FILES DIRECTORY ---
# This makes the 'uploads' folder publicly accessible at http://127.0.0.1:8002/uploads
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIRECTORY), name="uploads")
# --- (END NEW) ---


# =========================================================================
# 0. TWILIO UTILITY FUNCTIONS
# =========================================================================
# ... (existing code) ...
def send_sms(to_number: str, body: str):
    """Sends SMS using Twilio."""
    if not twilio_client:
        print(f"SMS SIMULATION to {to_number}: {body}")
        return
    
    try:
        message = twilio_client.messages.create(
            body=body,
            from_=TWILIO_PHONE_NUMBER,
            to=to_number
        )
        print(f"SMS Sent (SID: {message.sid}) to {to_number}")
    except Exception as e:
        print(f"TWILIO ERROR: Failed to send SMS to {to_number}. Error: {str(e)}")

# =========================================================================
# 1. UNIFIED USER AUTHENTICATION & REGISTRATION
# =========================================================================
# ... (existing code) ...
@app.post("/register", response_model=schemas.User)
def register(user_data: schemas.UserCreate, db: Session = Depends(database.get_db)):
    """
    Register a new user (Lawyer or Client) with a specific role.
    """
    try:
        existing_user = crud.get_user_by_email(db, user_data.email)
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"User with email '{user_data.email}' already exists."
            )

        # Checking if the phone number was provided for the client
        if user_data.role == 'client' and (not user_data.profile_data or not user_data.profile_data.get('phone')):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Client registration requires 'phone' in 'profile_data' (in E.164 format)."
            )

        user = crud.create_user(db, user_data=user_data) 
        return user
    except HTTPException:
        raise
    except Exception as e:
        print(f"Registration error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Registration failed: {str(e)}"
        )

@app.post("/login", response_model=schemas.User)
def login(credentials: schemas.UserLogin, db: Session = Depends(database.get_db)):
    """
    Login with email and password for any user type.
    """
    user = crud.authenticate_user(db, credentials.email, credentials.password)
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password."
        )
    return user

@app.get("/azure-login", response_model=schemas.User)
def azure_login(token: str, db: Session = Depends(database.get_db)):
    """
    Login with Azure AD token, creating a User (assumed to be a Lawyer) if not exists.
    """
    payload = auth.verify_azure_token(token)
    aad_id = payload.get("oid")
    email = payload.get("preferred_username")
    name = payload.get("name")

    user = crud.get_user_by_aad(db, aad_id)
    if not user:
        user_data = schemas.UserCreate(
            email=email, 
            name=name,
            password="", 
            role="lawyer",
            profile_data={"aad_id": aad_id, "bar_number": f"AAD-{aad_id[:5]}"}
        )
        user = crud.create_user(db, user_data)
        
    return user

# =========================================================================
# 2. CLIENTS ROUTES
# =========================================================================
# ... (existing code) ...
@app.get("/clients", response_model=List[schemas.User])
def get_clients_route(skip: int = 0, limit: int = 100, db: Session = Depends(database.get_db)):
    """
    Get all clients (Users with role='client').
    """
    clients = crud.get_clients(db, skip=skip, limit=limit)
    return clients

@app.get("/clients/{client_id}", response_model=schemas.User)
def get_client_route(client_id: int, db: Session = Depends(database.get_db)):
    """
    Get a specific client by ID (User with role='client').
    """
    client = crud.get_user_by_id(db, client_id) 
    if not client or client.role != 'client':
        raise HTTPException(status_code=404, detail="Client not found")
    return client

# =========================================================================
# 3. WEBSOCKET ENDPOINT
# =========================================================================
# ... (existing code) ...
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, room: str):
        await websocket.accept()
        if room not in self.active_connections:
            self.active_connections[room] = []
        self.active_connections[room].append(websocket)

    def disconnect(self, websocket: WebSocket, room: str):
        if room in self.active_connections:
            self.active_connections[room].remove(websocket)

    async def broadcast(self, message: str, room: str):
        if room in self.active_connections:
            for connection in self.active_connections[room]:
                await connection.send_text(message)

manager = ConnectionManager()

def get_ws_db():
    db = database.SessionLocal()
    try:
        yield db
    finally:
        db.close()

@app.websocket("/ws/{case_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    case_id: int,
    db: Session = Depends(get_ws_db)
):
    room = f"case_{case_id}"
    await manager.connect(websocket, room)
    
    try:
        while True:
            data = await websocket.receive_json()
            
            sender_id = data.get("sender_id")
            if not sender_id:
                 await websocket.send_text('{"error": "Message must include sender_id"}')
                 continue
            
            message_schema = schemas.MessageCreate(
                content=data["content"],
                case_id=case_id,
                sender_id=sender_id,
                channel="portal" # Always 'portal' from WebSocket
            )
            
            db_message_simple = crud.create_message(db, message=message_schema)
            
            db_message_full = crud.get_message_by_id(db, db_message_simple.id)
            
            if not db_message_full:
                continue

            # Step 1: Broadcast the message to everyone on WebSocket
            broadcast_data = schemas.Message.from_orm(db_message_full).model_dump_json() 
            await manager.broadcast(broadcast_data, room)
            
            # --- Step 2: SMS sending logic ---
            # Only send SMS if the message is from a lawyer
            if db_message_full.sender_user and db_message_full.sender_user.role == 'lawyer':
                # We need to retrieve the case to find the client and their number
                case = crud.get_case_by_id(db, case_id)
                
                if (case and 
                    case.client_user and 
                    case.client_user.client_profile and 
                    case.client_user.client_profile.phone):
                    
                    client_phone = case.client_user.client_profile.phone
                    tag = case.sms_id_tag
                    
                    # Prepare SMS body
                    sms_body = (
                        f"Message regarding '{case.title}' [Code: {tag}]:\n"
                        f"{db_message_full.content}"
                    )
                    
                    # Send SMS
                    send_sms(to_number=client_phone, body=sms_body)
                else:
                    print(f"WARNING: Cannot send SMS for case {case_id}. Missing client phone number.")

            
    except WebSocketDisconnect:
        manager.disconnect(websocket, room)
    except Exception as e:
        print(f"WebSocket Error: {e}")
        manager.disconnect(websocket, room)

# =========================================================================
# 4. CASES ROUTES
# =========================================================================
# ... (existing code) ...
@app.get("/cases", response_model=List[schemas.Case])
def get_cases(skip: int = 0, limit: int = 100, db: Session = Depends(database.get_db)):
    cases = crud.get_cases(db, skip=skip, limit=limit)
    return cases

@app.get("/lawyers/{lawyer_id}/cases", response_model=List[schemas.Case])
def get_lawyer_cases(lawyer_id: int, db: Session = Depends(database.get_db)):
    results = crud.get_lawyer_cases(db, lawyer_id)
    response = []
    for case, count in results:
        case_schema = schemas.Case.from_orm(case)
        case_schema.unread_count = count
        response.append(case_schema)
    return response

@app.get("/clients/{client_id}/cases", response_model=List[schemas.Case])
def get_client_cases_route(client_id: int, db: Session = Depends(database.get_db)):
    results = crud.get_client_cases(db, client_id)
    response = []
    for case, count in results:
        case_schema = schemas.Case.from_orm(case)
        case_schema.unread_count = count
        response.append(case_schema)
    return response

@app.post("/cases", response_model=schemas.Case)
def create_case(case: schemas.CaseCreate, db: Session = Depends(database.get_db)):
    client = crud.get_user_by_id(db, case.client_id)
    if not client or client.role != 'client':
        raise HTTPException(status_code=404, detail="Client not found")
    if not client.client_profile or not client.client_profile.phone:
        raise HTTPException(status_code=400, detail="Client does not have a phone number required for SMS integration.")
        
    return crud.create_case(db, case)

@app.get("/cases/{case_id}/messages", response_model=List[schemas.Message])
def get_messages_for_case(
    case_id: int, 
    skip: int = 0, 
    limit: int = 100, 
    db: Session = Depends(database.get_db)
):
    messages = crud.get_case_messages(db, case_id=case_id, skip=skip, limit=limit) 
    return messages

@app.post("/cases/{case_id}/read")
def mark_case_as_read(
    case_id: int, 
    payload: schemas.MarkReadPayload,
    db: Session = Depends(database.get_db)
):
    updated_count = crud.mark_messages_as_read(
        db, 
        case_id=case_id, 
        reader_id=payload.reader_id
    )
    return {"status": "success", "updated_messages": updated_count}

@app.get("/users/{user_id}/unread-count", response_model=schemas.UnreadCountResponse)
def get_total_unread_count_route(
    user_id: int, 
    role: str,
    db: Session = Depends(database.get_db)
):
    if role not in ['client', 'lawyer']:
        raise HTTPException(status_code=400, detail="Invalid role specified. Must be 'client' or 'lawyer'.")
        
    count = crud.get_total_unread_count(db, user_id=user_id, role=role)
    return schemas.UnreadCountResponse(total_unread_count=count)

@app.get("/users/{user_id}/notifications", response_model=schemas.NotificationResponse)
def get_user_notifications(
    user_id: int,
    role: str, 
    db: Session = Depends(database.get_db)
):
    if role not in ['client', 'lawyer']:
        raise HTTPException(status_code=400, detail="Invalid role specified.")
    
    db_notifications = crud.get_unread_message_notifications(db, user_id=user_id, role=role)
    
    notifications_list = []
    for message, case_title, sender_name in db_notifications:
        snippet = (message.content[:40] + '...') if len(message.content) > 40 else message.content
        
        notifications_list.append(
            schemas.Notification(
                message_id=message.id,
                content_snippet=snippet,
                timestamp=message.timestamp,
                case_id=message.case_id,
                case_title=case_title,
                sender_name=sender_name
            )
        )
        
    return schemas.NotificationResponse(notifications=notifications_list)

# =========================================================================
# 5. TWILIO WEBHOOK AND PENDING INBOX
# =========================================================================
# ... (existing code) ...
async def handle_sms_error(db: Session, client: models.User, sms_body: str, active_cases: List[models.Case]):
    crud.create_awaiting_sms(db, phone=client.client_profile.phone, body=sms_body, client_id=client.id)
    
    tags = [c.sms_id_tag for c in active_cases]
    tags_str = ", ".join(tags)
    
    error_message = (
        f"Error: Cannot assign message. You have {len(active_cases)} active cases. "
        f"Please resend the message, starting with one of the codes: [{tags_str}]"
    )
    
    send_sms(to_number=client.client_profile.phone, body=error_message)

@app.post("/api/twilio/webhook/sms")
async def twilio_sms_webhook(
    request: Request, 
    db: Session = Depends(database.get_db)
):
    form_data = await request.form()
    client_phone = form_data.get("From")
    sms_body = form_data.get("Body")

    if not client_phone or not sms_body:
        raise HTTPException(status_code=400, detail="Missing 'From' or 'Body' data")

    client = crud.get_user_by_phone(db, client_phone)
    if not client:
        crud.create_awaiting_sms(db, phone=client_phone, body=sms_body)
        return Response(content="<Response></Response>", media_type="application/xml")

    active_cases = crud.get_active_cases_by_client_id(db, client.id)
    match = SMS_TAG_REGEX.match(sms_body)
    
    target_case = None
    cleaned_body = sms_body

    if match:
        tag = match.group(1).upper()
        for case in active_cases:
            if case.sms_id_tag == tag:
                target_case = case
                cleaned_body = sms_body[len(match.group(0)):].strip()
                break
        
        if not target_case:
            await handle_sms_error(db, client, sms_body, active_cases)

    elif len(active_cases) == 1:
        target_case = active_cases[0]
        cleaned_body = sms_body

    elif len(active_cases) > 1:
        await handle_sms_error(db, client, sms_body, active_cases)
        
    else: # len(active_cases) == 0
        crud.create_awaiting_sms(db, phone=client_phone, body=sms_body, client_id=client.id)

    if target_case:
        message_schema = schemas.MessageCreate(
            content=cleaned_body,
            case_id=target_case.id,
            sender_id=client.id,
            channel="sms" 
        )
        db_message_simple = crud.create_message(db, message=message_schema)
        
        db_message_full = crud.get_message_by_id(db, db_message_simple.id)
        
        if db_message_full:
            room = f"case_{target_case.id}"
            broadcast_data = schemas.Message.from_orm(db_message_full).model_dump_json()
            await manager.broadcast(broadcast_data, room)

    return Response(content="<Response></Response>", media_type="application/xml")

@app.get("/api/awaiting-sms", response_model=List[schemas.AwaitingSMS])
def get_awaiting_sms_route(
    skip: int = 0, 
    limit: int = 20, 
    db: Session = Depends(database.get_db)
):
    messages = crud.get_awaiting_sms(db, skip=skip, limit=limit)
    return messages

@app.post("/api/awaiting-sms/{sms_id}/assign", response_model=schemas.Message)
async def assign_awaiting_sms(
    sms_id: int,
    payload: schemas.AssignSMSPayload,
    db: Session = Depends(database.get_db)
):
    awaiting_sms = crud.get_awaiting_sms_by_id(db, sms_id)
    
    if not awaiting_sms:
        raise HTTPException(status_code=404, detail="Awaiting SMS not found")
    if awaiting_sms.status == 'resolved':
        raise HTTPException(status_code=400, detail="SMS already resolved")
    if not awaiting_sms.client_id:
        raise HTTPException(status_code=400, detail="Cannot assign SMS without an identified client")

    case = crud.get_case_by_id(db, payload.case_id)
    if not case or case.client_id != awaiting_sms.client_id:
        raise HTTPException(status_code=403, detail="Case does not belong to this client")

    message_schema = schemas.MessageCreate(
        content=awaiting_sms.sms_body,
        case_id=case.id,
        sender_id=awaiting_sms.client_id,
        channel="sms" 
    )
    db_message_simple = crud.create_message(db, message=message_schema)
    
    crud.update_awaiting_sms_status(db, sms_id, status='resolved')
    
    db_message_full = crud.get_message_by_id(db, db_message_simple.id)
    if db_message_full:
        room = f"case_{case.id}"
        broadcast_data = schemas.Message.from_orm(db_message_full).model_dump_json()
        await manager.broadcast(broadcast_data, room)
        
    return db_message_full


@app.get("/requests/{token}", response_model=schemas.DocumentRequest)
def get_doc_request_by_token(
    token: str,
    db: Session = Depends(database.get_db)
):
    """
    Access endpoint for the client via SMS token.
    The client navigates to the link, the token is verified, and the request is returned.
    """
    db_request = crud.get_document_request_by_token(db, token)
    
    if not db_request:
        raise HTTPException(status_code=404, detail="Request not found or link has expired.")

    return db_request

# =========================================================================
# 6. DOCUMENT REQUESTS ENDPOINTS
# =========================================================================

@app.post("/cases/{case_id}/requests", response_model=schemas.DocumentRequest)
def create_doc_request(
    case_id: int,
    request_data: schemas.DocumentRequestCreate,
    db: Session = Depends(database.get_db),
):
    """
    Creates a new document request, generates an access link, and sends an SMS to the client.
    """
    lawyer_id = request_data.lawyer_id
    
    db_case = crud.get_case_by_id(db, case_id)
    if not db_case:
        raise HTTPException(status_code=404, detail="Case not found")

    if db_case.assigned_lawyer_id != lawyer_id:
        raise HTTPException(status_code=403, detail="Only the assigned lawyer can send a request for this case.")

    # 1. Creating the request in DB (this also creates the chat message)
    db_request = crud.create_document_request(db, case_id=case_id, request_data=request_data)
    
    # 2. Generating a secure link for the client
    client_phone = db_case.client_user.client_profile.phone
    
    if not client_phone:
        print(f"Missing phone number for client {db_case.client_user.name}. SMS not sent.")
    else:
        # Creating a link to the special client view
        link = f"{CLIENT_BASE_URL}/requests/{db_request.access_token}"
        
        # 3. Send SMS
        message_body = (
            f"New documents are required for your case ({db_case.sms_id_tag} - {db_case.title}). "
            f"Click to upload them: {link}" # Link is now included
        )
        send_sms(to_number=client_phone, body=message_body) 
        
    return db_request

@app.get("/cases/{case_id}/requests", response_model=List[schemas.DocumentRequest])
def get_case_doc_requests(
    case_id: int,
    db: Session = Depends(database.get_db),
):
    """Retrieves all document requests for a given case. NOTE: Authorization missing!"""
    db_case = crud.get_case_by_id(db, case_id)
    if not db_case:
        raise HTTPException(status_code=404, detail="Case not found")
        
    # NOTE: In a production environment, checking whether current_user is the client 
    # or lawyer in this case would be required.

    return crud.get_all_requests_by_case(db, case_id)


# --- (MODIFIED) ENDPOINT FOR FILE UPLOAD ---

@app.post("/requests/{request_id}/upload")
async def upload_documents_for_request(
    request_id: int,
    request: Request,
    db: Session = Depends(database.get_db)
):
    """
    Handles file uploads from the SmsLandingPage.
    The form data keys are the 'RequestedDocument' IDs.
    """
    
    # 1. Find the DocumentRequest
    db_request = crud.get_document_request_by_id(db, request_id) 
    
    if not db_request:
        raise HTTPException(status_code=404, detail="Document request not found.")
        
    if db_request.status == "completed": # Allow re-upload even if pending
        raise HTTPException(status_code=400, detail="This request is already completed.")

    # 2. Ensure upload directory exists
    request_upload_dir = os.path.join(UPLOAD_DIRECTORY, str(request_id))
    os.makedirs(request_upload_dir, exist_ok=True)

    # 3. Process the form data
    form_data = await request.form()
    uploaded_doc_ids = []
    
    print(f"--- Upload for Request ID: {request_id} ---")
    print(f"Form data keys received: {list(form_data.keys())}")

    for field_name, file_or_value in form_data.items():
        # --- (FIXED) CHECK ---
        # We must check against the Starlette UploadFile class
        if not isinstance(file_or_value, UploadFile):
            print(f"Skipping form field: '{field_name}'. It is not a file.")
            continue
        # --- (END FIXED) ---

        # If it IS an UploadFile, proceed
        file = file_or_value
        print(f"Processing file for form field: {field_name} (Filename: {file.filename})")
        
        try:
            # The field_name *is* the RequestedDocument ID
            doc_id = int(field_name)
            uploaded_doc_ids.append(doc_id)
            
            # 4. Find the corresponding document entry in DB
            db_doc = crud.get_requested_document_by_id(db, doc_id) 
            
            if not db_doc or db_doc.request_id != request_id:
                print(f"Skipping file: No matching document entry found for doc_id: {doc_id}")
                continue

            # 5. Save the file
            safe_filename = os.path.basename(file.filename)
            file_path = os.path.join(request_upload_dir, f"{doc_id}_{safe_filename}")
            
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
            
            # 6. Update the database entry
            db_doc.status = "uploaded"
            db_doc.file_path = file_path # Store the path
            
            print(f"Successfully saved file for doc_id {doc_id} to {file_path}")

        except ValueError:
            print(f"Skipping form field with invalid integer name: {field_name}")
        except Exception as e:
            print(f"Failed to process file for doc_id {field_name}: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to save file for document {field_name}.")
        finally:
            file.file.close()

    # 7. Check if the entire request is now complete
    all_docs_uploaded = True
    for doc in db_request.requested_documents:
        if doc.status == "required":
            all_docs_uploaded = False
            break
            
    if all_docs_uploaded:
        db_request.status = "completed"
        print(f"DocumentRequest {request_id} marked as 'completed'")
    else:
        # (NEW) If not complete, mark as pending (in case it was 'required' before)
        db_request.status = "pending"

    db.commit()
    print(f"Database commit complete. Final request status: {db_request.status}")
    print(f"--- End Upload for Request ID: {request_id} ---")
    db.refresh(db_request)

    return {"status": "success", "uploaded_files": len(uploaded_doc_ids), "request_status": db_request.status}

# --- END NEW ENDPOINT ---