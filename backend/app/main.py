from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import logging
import os

from . import database, models
from .config import get_settings
from .api import auth, cases, clients, users, documents, sms, ws

logging.basicConfig(level=logging.INFO)
settings = get_settings()

UPLOAD_DIRECTORY = "uploads"
os.makedirs(UPLOAD_DIRECTORY, exist_ok=True)

app = FastAPI()


@app.on_event("startup")
def ensure_schema():
    # Create newly introduced tables (safe no-op for existing ones).
    models.Base.metadata.create_all(bind=database.engine)

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
