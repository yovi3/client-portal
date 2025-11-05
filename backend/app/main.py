from fastapi import FastAPI, Depends, HTTPException, status, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session
from . import database, models, schemas, crud, auth
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Dict

app = FastAPI()

# --- Table Creation ---
models.Base.metadata.create_all(bind=database.engine)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173", "http://0.0.0.0:8002"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"message": "Lawyer Client Portal API running successfully!"}

# =========================================================================
# 1. UNIFIED USER AUTHENTICATION & REGISTRATION
# =========================================================================

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
# 2. CLIENTS ROUTES (Now filter the User table)
# =========================================================================

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
# 3. WEBSOCKET ENDPOINT (CRITICAL FIX 2: Sender ID)
# =========================================================================

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
                sender_id=sender_id 
            )
            
            db_message_simple = crud.create_message(db, message=message_schema)
            
            db_message_full = crud.get_message_by_id(db, db_message_simple.id)
            
            if not db_message_full:
                continue

            broadcast_data = schemas.Message.from_orm(db_message_full).model_dump_json() 
            
            await manager.broadcast(broadcast_data, room)
            
    except WebSocketDisconnect:
        manager.disconnect(websocket, room)
    except Exception as e:
        print(f"Error in websocket: {e}")
        manager.disconnect(websocket, room)

# =========================================================================
# 4. CASES ROUTES (Remain mostly the same, now referencing User IDs)
# =========================================================================

@app.get("/cases", response_model=List[schemas.Case])
def get_cases(skip: int = 0, limit: int = 100, db: Session = Depends(database.get_db)):
    """
    Get all cases. (No unread count, as user is unknown)
    """
    cases = crud.get_cases(db, skip=skip, limit=limit)
    return cases

# ✅ MODIFIED to process (Case, count) tuples
@app.get("/lawyers/{lawyer_id}/cases", response_model=List[schemas.Case])
def get_lawyer_cases(lawyer_id: int, db: Session = Depends(database.get_db)):
    """
    Get all cases for a lawyer, including the unread message count.
    """
    results = crud.get_lawyer_cases(db, lawyer_id)
    response = []
    for case, count in results:
        case_schema = schemas.Case.from_orm(case)
        case_schema.unread_count = count
        response.append(case_schema)
    return response

# ✅ MODIFIED to process (Case, count) tuples
@app.get("/clients/{client_id}/cases", response_model=List[schemas.Case])
def get_client_cases_route(client_id: int, db: Session = Depends(database.get_db)):
    """
    Get all cases for a specific client, including the unread message count.
    """
    results = crud.get_client_cases(db, client_id)
    response = []
    for case, count in results:
        case_schema = schemas.Case.from_orm(case)
        case_schema.unread_count = count
        response.append(case_schema)
    return response

@app.post("/cases", response_model=schemas.Case)
def create_case(case: schemas.CaseCreate, db: Session = Depends(database.get_db)):
    """
    Create a new case.
    """
    return crud.create_case(db, case)

@app.get("/cases/{case_id}/messages", response_model=List[schemas.Message])
def get_messages_for_case(
    case_id: int, 
    skip: int = 0, 
    limit: int = 100, 
    db: Session = Depends(database.get_db)
):
    """
    Get all messages for a specific case.
    """
    messages = crud.get_case_messages(db, case_id=case_id, skip=skip, limit=limit) 
    return messages

@app.post("/cases/{case_id}/read")
def mark_case_as_read(
    case_id: int, 
    payload: schemas.MarkReadPayload,
    db: Session = Depends(database.get_db)
):
    """
    Marks all messages in a case as read for the given reader_id.
    """
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
    """
    Get the total unread message count for a user across all their cases.
    """
    # Check for valid role
    if role not in ['client', 'lawyer']:
        raise HTTPException(status_code=400, detail="Invalid role specified. Must be 'client' or 'lawyer'.")
        
    count = crud.get_total_unread_count(db, user_id=user_id, role=role)
    return schemas.UnreadCountResponse(total_unread_count=count)

@app.get("/users/{user_id}/notifications", response_model=schemas.NotificationResponse)
def get_user_notifications(
    user_id: int,
    role: str, # Pass role as a query parameter, e.g., ?role=client
    db: Session = Depends(database.get_db)
):
    """
    Get a list of the latest unread messages for the notification popover.
    """
    if role not in ['client', 'lawyer']:
        raise HTTPException(status_code=400, detail="Invalid role specified.")
    
    # 1. Fetch the raw notification data from CRUD
    # Returns List[Tuple(Message, case_title, sender_name)]
    db_notifications = crud.get_unread_message_notifications(db, user_id=user_id, role=role)
    
    # 2. Convert the database models into Pydantic schema
    notifications_list = []
    for message, case_title, sender_name in db_notifications:
        # Create a snippet
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