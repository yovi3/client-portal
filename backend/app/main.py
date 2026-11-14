from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import logging
import os

from .config import get_settings
from .api import auth, cases, clients, users, documents, sms, ws, invites, leads, conversations

logging.basicConfig(level=logging.INFO)
settings = get_settings()

# WARNING: uploads/ is on local disk and is wiped on App Service restart/redeploy.
# This is acceptable only for MVP. Replace with Azure Blob Storage before clients
# upload anything they cannot easily re-upload.
UPLOAD_DIRECTORY = "uploads"
os.makedirs(UPLOAD_DIRECTORY, exist_ok=True)

app = FastAPI()

@app.get("/")
def read_root():
    return {"status": "ok", "message": "Backend is running"}


@app.get("/healthz")
def healthz():
    return {"status": "ok"}


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(auth.router)
app.include_router(cases.router)
app.include_router(clients.router)
app.include_router(users.router)
app.include_router(documents.router)
app.include_router(sms.router)
app.include_router(ws.router)
app.include_router(invites.router)
app.include_router(leads.router)
app.include_router(conversations.router)
