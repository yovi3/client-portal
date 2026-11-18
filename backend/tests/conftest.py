"""Test setup: a throwaway database and upload folder, and no real texts.

The settings below are put in place before the app is imported, so the tests never
touch the real app.db, never read real Twilio credentials from .env, and never send
a real text: Twilio runs in simulation mode, but its signature check still runs.
"""
import io
import os
import tempfile

_tmp = tempfile.mkdtemp(prefix="portal-tests-")
os.environ.update({
    "APP_ENV": "test",
    "DATABASE_URL": f"sqlite:///{os.path.join(_tmp, 'test.db')}",
    "UPLOAD_DIRECTORY": os.path.join(_tmp, "uploads"),
    "SECRET_KEY": "test-secret-key",
    "TWILIO_ACCOUNT_SID": "",            # empty = simulation mode, nothing is sent
    "TWILIO_PHONE_NUMBER": "",
    "TWILIO_MESSAGING_SERVICE_SID": "",
    "TWILIO_AUTH_TOKEN": "test-auth-token",  # lets the webhook signature check run
    "TWILIO_VALIDATE_SIGNATURE": "true",
    "CASES_ENABLED": "false",
    # Set here so robo's real .env (password sign-in off, HTTPS-only cookies, real
    # Microsoft settings) never changes how the tests behave.
    "PASSWORD_LOGIN_ENABLED": "true",
    "COOKIE_SECURE": "false",
    "BACKEND_BASE_URL": "http://testserver",
    "AZURE_REDIRECT_URI": "http://testserver/auth/azure/callback",
    "AZURE_ALLOWED_GROUP_IDS": "",
    "AZURE_GROUP_ROLE_MAP": "{}",
    "BRIDGE_API_KEY": "test-bridge-key",
    "CLIENT_BASE_URL": "http://portal.test",
    "AZURE_CLIENT_ID": "not-set",
    "AZURE_TENANT_ID": "not-set",
    "AZURE_CLIENT_SECRET": "not-set",  # never the real secret from .env
})

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from twilio.request_validator import RequestValidator  # noqa: E402

from app import auth, models  # noqa: E402
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402

PASSWORD = "test-password-1"


@pytest.fixture(autouse=True)
def fresh_database():
    """Every test starts with an empty database and two people: a staff member and a client."""
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    db.add_all([
        models.User(id=1, email="staff@example.com", name="Alice Intake", first_name="Alice", last_name="Intake",
                    role="other", hashed_password=auth.hash_password(PASSWORD), auth_provider="local"),
        models.User(id=2, email="client@example.com", name="Carl Client", first_name="Carl", last_name="Client",
                    role="client", hashed_password=auth.hash_password(PASSWORD), auth_provider="local"),
    ])
    db.commit()
    db.close()
    yield


def _login(email):
    client = TestClient(app)
    res = client.post("/auth/login", json={"email": email, "password": PASSWORD})
    assert res.status_code == 200, res.text
    return client


@pytest.fixture
def staff():
    with _login("staff@example.com") as client:
        yield client


@pytest.fixture
def client_user():
    with _login("client@example.com") as client:
        yield client


@pytest.fixture
def anonymous():
    with TestClient(app) as client:
        yield client


@pytest.fixture
def twilio_text(anonymous):
    """Deliver a text the way Twilio would, correctly signed."""
    validator = RequestValidator("test-auth-token")

    def send(from_number, body, sid, **extra):
        url = "http://testserver/api/twilio/webhook/sms"
        data = {"From": from_number, "Body": body, "MessageSid": sid, **extra}
        res = anonymous.post(url, data=data, headers={"X-Twilio-Signature": validator.compute_signature(url, data)})
        assert res.status_code == 200, res.text
        return res
    return send


PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 2000
PDF = b"%PDF-1.7\n" + b"0" * 4000


def upload(client, path, name, data):
    return client.post(path, files={"file": (name, io.BytesIO(data))})
