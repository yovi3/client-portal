"""Phase 1 checks: texting leads, incoming texts, and document links.

Run from the backend folder:  .venv\\Scripts\\python.exe -m pytest
Each test starts from an empty database (see conftest.py). No real texts are sent.
"""
import datetime
import io

from app import models
from app.database import SessionLocal
from app.phone import normalize_phone
from app.services.storage import detect_kind

from .conftest import PDF, PNG, upload


# ---------------------------------------------------------------- helpers

def make_lead(staff, number="48001", phone="(201) 555-0101", first="Dana", last="Ng"):
    res = staff.post("/leads", json={"lead_number": number, "first_name": first, "last_name": last,
                                     "phone": phone, "assigned_user_id": 1})
    assert res.status_code == 201, res.text
    return res.json()


def conversations(staff, kind):
    return staff.get(f"/conversations?kind={kind}").json()


def messages(staff, conversation_id):
    return staff.get(f"/conversations/{conversation_id}/messages").json()


# ---------------------------------------------------------------- phone numbers

def test_phone_numbers_are_stored_one_way():
    assert normalize_phone("(201) 555-0123") == "+12015550123"
    assert normalize_phone("1-201-555-0123") == "+12015550123"
    assert normalize_phone("+12015550123") == "+12015550123"
    assert normalize_phone("555-01") is None
    assert normalize_phone("") is None


# ---------------------------------------------------------------- leads

def test_add_lead_creates_its_conversation(staff):
    lead = make_lead(staff)
    assert lead["phone"] == "+12015550101"
    assert lead["conversation_id"]
    assert conversations(staff, "lead")[0]["lead"]["lead_number"] == "48001"


def test_lead_rules(staff):
    make_lead(staff)
    assert staff.post("/leads", json={"lead_number": "48001"}).status_code == 409          # same number twice
    assert staff.post("/leads", json={"lead_number": "48002", "phone": "555-01"}).status_code == 400
    assert staff.post("/leads", json={"lead_number": "48003", "assigned_user_id": 2}).status_code == 400  # a client
    assert staff.post("/leads", json={"lead_number": "48004"}).status_code == 201          # no phone is fine


def test_clients_cannot_see_staff_screens(client_user):
    for path in ("/leads", "/conversations?kind=lead", "/conversations/counts", "/leads/staff"):
        assert client_user.get(path).status_code == 403, path


# ---------------------------------------------------------------- incoming texts

def test_unknown_number_waits_in_needs_assigning(staff, twilio_text):
    twilio_text("+19735550100", "I was in an accident", "SM1")
    twilio_text("+19735550100", "Please call me", "SM2")
    waiting = conversations(staff, "unassigned")
    assert len(waiting) == 1 and waiting[0]["message_count"] == 2
    assert staff.get("/conversations/counts").json()["unassigned"] == 1


def test_repeat_delivery_from_twilio_is_recorded_once(staff, twilio_text):
    twilio_text("+19735550100", "Hello", "SM1")
    twilio_text("+19735550100", "Hello", "SM1")
    assert conversations(staff, "unassigned")[0]["message_count"] == 1


def test_forged_twilio_request_is_refused(anonymous):
    res = anonymous.post("/api/twilio/webhook/sms", data={"From": "+19735550100", "Body": "hi"},
                         headers={"X-Twilio-Signature": "forged"})
    assert res.status_code == 403


def test_text_from_a_lead_goes_to_the_lead(staff, twilio_text):
    lead = make_lead(staff)
    twilio_text("+12015550101", "It's Dana", "SM1")
    assert [m["content"] for m in messages(staff, lead["conversation_id"])] == ["It's Dana"]
    assert conversations(staff, "unassigned") == []


def test_link_to_new_lead_logs_earlier_texts_on_it(staff, twilio_text):
    twilio_text("+19735550100", "First text", "SM1")
    conv = conversations(staff, "unassigned")[0]
    res = staff.post(f"/conversations/{conv['id']}/link",
                     json={"new_lead": {"lead_number": "48010", "first_name": "Tom", "assigned_user_id": 1}})
    assert res.status_code == 200 and res.json()["kind"] == "lead"
    assert messages(staff, conv["id"])[0]["lead_id"] == res.json()["lead"]["id"]


def test_not_related_until_it_texts_again(staff, twilio_text):
    twilio_text("+18885550000", "You won a cruise", "SM1")
    conv = conversations(staff, "unassigned")[0]
    staff.post(f"/conversations/{conv['id']}/dismiss")
    assert conversations(staff, "unassigned") == []
    twilio_text("+18885550000", "Last chance", "SM2")
    assert len(conversations(staff, "unassigned")) == 1


def test_cases_stay_hidden_during_intake_rollout(staff, twilio_text):
    assert staff.get("/app-settings").json() == {"cases_enabled": False}
    twilio_text("+19735550100", "Hi", "SM1")
    conv = conversations(staff, "unassigned")[0]
    assert staff.post(f"/conversations/{conv['id']}/link", json={"case_id": 1}).status_code == 403
    assert staff.get("/conversations?kind=case").status_code == 403


# ---------------------------------------------------------------- texting out, STOP and START

def test_staff_message_is_texted_with_firm_name(staff):
    lead = make_lead(staff)
    with staff.websocket_connect(f"/ws/conversation/{lead['conversation_id']}") as ws:
        ws.send_json({"content": "Hi Dana, it's Alice from DSS."})
        sent = ws.receive_json()
        status = ws.receive_json()
    assert sent["sms_status"] == "sending" and sent["lead_id"] == lead["id"]
    assert status == {"type": "sms_status", "message_id": sent["id"], "sms_status": "simulated", "sms_error": None}


def test_stop_and_start(staff, twilio_text):
    lead = make_lead(staff)
    twilio_text("+12015550101", "STOP", "SM1")
    with staff.websocket_connect(f"/ws/conversation/{lead['conversation_id']}") as ws:
        ws.send_json({"content": "Are you there?"})
        assert ws.receive_json()["sms_status"] == "opted_out"
    twilio_text("+12015550101", "START", "SM2")
    with staff.websocket_connect(f"/ws/conversation/{lead['conversation_id']}") as ws:
        ws.send_json({"content": "Welcome back"})
        assert ws.receive_json()["sms_status"] == "sending"


def test_clients_cannot_open_a_lead_conversation(staff, client_user):
    lead = make_lead(staff)
    try:
        with client_user.websocket_connect(f"/ws/conversation/{lead['conversation_id']}") as ws:
            ws.receive_json()
        assert False, "a client got into a staff conversation"
    except Exception:
        pass


# ---------------------------------------------------------------- New text

def test_new_text_creates_lead_or_opens_existing(staff):
    res = staff.post("/conversations/start",
                     json={"phone": "732-555-0142", "new_lead": {"lead_number": "48020", "first_name": "Ana"}})
    assert res.status_code == 200 and not res.json()["existing"]
    again = staff.post("/conversations/start", json={"phone": "(732) 555-0142", "lead_id": res.json()["lead_id"]})
    assert again.json()["existing"] and again.json()["conversation"]["id"] == res.json()["conversation"]["id"]
    assert staff.post("/conversations/start", json={"phone": "12", "lead_id": 1}).status_code == 400


# ---------------------------------------------------------------- document requests (they upload)

def request_docs(staff, lead, items=("Insurance card", "Police report"), days=7):
    res = staff.post(f"/conversations/{lead['conversation_id']}/file-requests",
                     json={"items": list(items), "expires_in_days": days})
    assert res.status_code == 201, res.text
    data = res.json()
    return data, data["link"].rsplit("/", 1)[1]


def test_request_link_shows_first_name_only(staff, anonymous):
    lead = make_lead(staff)
    _, token = request_docs(staff, lead)
    page = anonymous.get(f"/public/file-requests/{token}").json()
    assert page["first_name"] == "Dana" and page["state"] == "open"
    assert "Ng" not in str(page) and "555" not in str(page)


def test_uploads_are_checked_and_tracked(staff, anonymous):
    lead = make_lead(staff)
    req, token = request_docs(staff, lead)
    items = anonymous.get(f"/public/file-requests/{token}", headers={"User-Agent": "iPhone"}).json()["items"]
    base = f"/public/file-requests/{token}/items"
    assert upload(anonymous, f"{base}/{items[0]['id']}/files", "card.png", PNG).status_code == 201
    assert upload(anonymous, f"{base}/{items[0]['id']}/files", "card.png", b"MZ" + b"0" * 100).status_code == 400
    assert upload(anonymous, f"{base}/{items[1]['id']}/files", "big.pdf", PDF + b"0" * (50 * 1024 * 1024)).status_code == 413
    assert upload(anonymous, f"{base}/{items[1]['id']}/files", "report.pdf", PDF).status_code == 201

    view = staff.get(f"/conversations/{lead['conversation_id']}/file-requests").json()[0]
    assert view["state"] == "complete" and view["open_count"] == 1
    assert [e["kind"] for e in view["events"]] == ["sent", "opened", "uploaded", "uploaded", "completed"]
    upload_notes = [m for m in messages(staff, lead["conversation_id"]) if m["message_type"] == "file_upload"]
    assert len(upload_notes) == 2


def test_staff_download_is_recorded_and_staff_only(staff, anonymous, client_user):
    lead = make_lead(staff)
    _, token = request_docs(staff, lead, items=("Police report",))
    item = anonymous.get(f"/public/file-requests/{token}").json()["items"][0]
    upload(anonymous, f"/public/file-requests/{token}/items/{item['id']}/files", "report.pdf", PDF)
    file_id = staff.get(f"/conversations/{lead['conversation_id']}/file-requests").json()[0]["items"][0]["files"][0]["id"]
    res = staff.get(f"/request-files/{file_id}/download")
    assert res.status_code == 200 and res.content.startswith(b"%PDF")
    assert client_user.get(f"/request-files/{file_id}/download").status_code == 403
    assert anonymous.get(f"/request-files/{file_id}/download").status_code == 401


def test_turned_off_and_expired_links(staff, anonymous):
    lead = make_lead(staff)
    req, token = request_docs(staff, lead)
    item = anonymous.get(f"/public/file-requests/{token}").json()["items"][0]
    staff.post(f"/file-requests/{req['id']}/revoke")
    assert anonymous.get(f"/public/file-requests/{token}").json()["state"] == "revoked"
    assert upload(anonymous, f"/public/file-requests/{token}/items/{item['id']}/files", "a.png", PNG).status_code == 410
    assert staff.post(f"/file-requests/{req['id']}/extend", json={"days": 7}).status_code == 400

    req2, token2 = request_docs(staff, lead, days=1)
    db = SessionLocal()
    db.get(models.FileRequest, req2["id"]).expires_at = datetime.datetime(2026, 1, 1)
    db.commit()
    db.close()
    assert anonymous.get(f"/public/file-requests/{token2}").json()["state"] == "expired"
    extended = staff.post(f"/file-requests/{req2['id']}/extend", json={"days": 7}).json()
    assert extended["state"] == "waiting"


def test_unknown_link(anonymous):
    assert anonymous.get("/public/file-requests/not-a-real-link").status_code == 404


# ---------------------------------------------------------------- sending documents (they download)

def test_send_documents_and_track_downloads(staff, anonymous):
    lead = make_lead(staff)
    res = staff.post(f"/conversations/{lead['conversation_id']}/file-sends",
                     files=[("files", ("Retainer copy.pdf", io.BytesIO(PDF))), ("files", ("Map.png", io.BytesIO(PNG)))],
                     data={"expires_in_days": "7"})
    assert res.status_code == 201, res.text
    sent = res.json()
    token = sent["link"].rsplit("/", 1)[1]
    page = anonymous.get(f"/public/file-requests/{token}").json()
    assert page["direction"] == "send" and [f["name"] for f in page["files"]] == ["Retainer copy.pdf", "Map.png"]

    first = anonymous.get(f"/public/file-requests/{token}/files/{page['files'][0]['id']}")
    assert first.status_code == 200 and first.content.startswith(b"%PDF")
    view = staff.get(f"/conversations/{lead['conversation_id']}/file-requests").json()[0]
    assert view["state"] == "partly" and [f["download_count"] for f in view["files"]] == [1, 0]

    anonymous.get(f"/public/file-requests/{token}/files/{page['files'][1]['id']}")
    assert staff.get(f"/conversations/{lead['conversation_id']}/file-requests").json()[0]["state"] == "complete"
    # A send link can't be used to upload.
    assert upload(anonymous, f"/public/file-requests/{token}/items/1/files", "a.pdf", PDF).status_code == 400


def test_rejected_file_sends_nothing(staff):
    lead = make_lead(staff)
    res = staff.post(f"/conversations/{lead['conversation_id']}/file-sends",
                     files=[("files", ("ok.pdf", io.BytesIO(PDF))), ("files", ("tool.exe", io.BytesIO(b"MZ" + b"0" * 50)))])
    assert res.status_code == 400
    assert staff.get(f"/conversations/{lead['conversation_id']}/file-requests").json() == []


def test_file_type_comes_from_contents_not_name():
    assert detect_kind(PDF[:32]).content_type == "application/pdf"
    assert detect_kind(PNG[:32]).content_type == "image/png"
    assert detect_kind(b"\x00\x00\x00\x18ftypheic" + b"0" * 20).content_type == "image/heic"
    assert detect_kind(b"MZ\x90\x00" + b"0" * 28) is None
