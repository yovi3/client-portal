from fastapi import FastAPI, Depends, HTTPException, status
from sqlalchemy.orm import Session
from . import database, models, schemas, crud, auth
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

# Create DB tables
models.Base.metadata.create_all(bind=database.engine)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173", "http://0.0.0.0:8000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"message": "Lawyer Client Portal API running successfully!"}

# ===== LAWYER AUTHENTICATION =====

@app.post("/register")
def register(lawyer_data: schemas.LawyerCreate, db: Session = Depends(database.get_db)):
    """
    Register a new lawyer with email, name, and password.
    """
    try:
        # Check if lawyer already exists
        existing_lawyer = crud.get_lawyer_by_email(db, lawyer_data.email)
        if existing_lawyer:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Lawyer with this email already exists."
            )

        # Create new lawyer
        lawyer = crud.create_lawyer(db, lawyer_data)

        return {
            "message": "Lawyer registered successfully.",
            "user": {
                "id": lawyer.id,
                "email": lawyer.email,
                "name": lawyer.name
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Registration error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Registration failed: {str(e)}"
        )

@app.post("/login")
def login(credentials: schemas.LawyerLogin, db: Session = Depends(database.get_db)):
    """
    Login with email and password.
    """
    lawyer = crud.authenticate_lawyer(db, credentials.email, credentials.password)
    
    if not lawyer:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password."
        )
    
    # Generate JWT token (optional - implement if needed)
    # token = auth.create_access_token(data={"sub": lawyer.email})
    
    return {
        "message": "Login successful.",
        "user": {
            "id": lawyer.id,
            "email": lawyer.email,
            "name": lawyer.name
        }
    }

@app.get("/azure-login")
def azure_login(token: str, db: Session = Depends(database.get_db)):
    """
    Login with Azure AD token.
    """
    payload = auth.verify_azure_token(token)
    aad_id = payload.get("oid")
    email = payload.get("preferred_username")
    name = payload.get("name")

    lawyer = crud.get_lawyer_by_aad(db, aad_id)
    if not lawyer:
        # Create lawyer without password for Azure AD users
        lawyer_data = schemas.LawyerCreate(
            aad_id=aad_id, 
            email=email, 
            name=name,
            password=""  # Empty password for Azure AD users
        )
        lawyer = crud.create_lawyer(db, lawyer_data)

    return {
        "user": {
            "id": lawyer.id,
            "email": lawyer.email,
            "name": lawyer.name
        }
    }

# ===== CLIENTS =====

@app.get("/clients")
def get_clients(skip: int = 0, limit: int = 100, db: Session = Depends(database.get_db)):
    """
    Get all clients.
    """
    clients = crud.get_clients(db, skip=skip, limit=limit)
    return clients

@app.get("/clients/{client_id}")
def get_client(client_id: int, db: Session = Depends(database.get_db)):
    """
    Get a specific client by ID.
    """
    client = crud.get_client(db, client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    return client

@app.post("/clients")
def create_client(client: schemas.ClientCreate, db: Session = Depends(database.get_db)):
    """
    Create a new client.
    """
    return crud.create_client(db, client)

# ===== CASES =====

@app.get("/cases")
def get_cases(skip: int = 0, limit: int = 100, db: Session = Depends(database.get_db)):
    """
    Get all cases.
    """
    cases = crud.get_cases(db, skip=skip, limit=limit)
    return cases

@app.get("/lawyers/{lawyer_id}/cases")
def get_lawyer_cases(lawyer_id: int, db: Session = Depends(database.get_db)):
    """
    Get all cases assigned to a specific lawyer.
    """
    cases = crud.get_lawyer_cases(db, lawyer_id)
    return cases

@app.post("/cases")
def create_case(case: schemas.CaseCreate, db: Session = Depends(database.get_db)):
    """
    Create a new case.
    """
    return crud.create_case(db, case)