"""Phase 2 checks: leads arriving from LeadBase through the robo bridge.

The bridge sends what dssc.GetLeads returns. These tests send the same shape.
"""
KEY = {"X-Bridge-Key": "test-bridge-key"}


def lb_lead(serial=1001, number="70001", status="In Progress", phone="201-555-0111", **extra):
    lead = {"serial": serial, "lead_number": number, "lead_type": "AUTO", "status": status,
            "current_status": None, "security_level": 1, "assigned_login": "AINTAKE",
            "assigned_name": "Alice Intake", "assigned_email": "staff@example.com",
            "first_name": "Rosa", "last_name": "Diaz", "phone": phone, "email": None, "language": "Spanish"}
    lead.update(extra)
    return lead


def send(anonymous, *leads, key=KEY):
    return anonymous.post("/bridge/leads", json={"leads": list(leads)}, headers=key)


def test_bridge_needs_its_key(anonymous):
    assert send(anonymous, lb_lead(), key={}).status_code == 401
    assert send(anonymous, lb_lead(), key={"X-Bridge-Key": "wrong"}).status_code == 401
    assert anonymous.get("/bridge/known-leads").status_code == 401


def test_new_lead_arrives_ready_to_text(anonymous, staff):
    res = send(anonymous, lb_lead()).json()
    assert res["created"] == 1 and res["conversations_created"] == 1
    lead = staff.get("/leads").json()[0]
    assert lead["lead_number"] == "70001" and lead["source"] == "lawbase"
    assert lead["phone"] == "+12015550111" and lead["lb_status"] == "In Progress"
    assert lead["assigned_user"]["id"] == 1  # matched to the staff account by email
    assert lead["conversation_id"]
    assert anonymous.get("/bridge/known-leads", headers=KEY).json() == {"serials": [1001]}


def test_sending_the_same_lead_again_changes_nothing(anonymous):
    send(anonymous, lb_lead())
    res = send(anonymous, lb_lead()).json()
    assert res["unchanged"] == 1 and res["created"] == 0 and res["updated"] == 0


def test_typed_in_lead_is_taken_over_by_leadbase(anonymous, staff):
    staff.post("/leads", json={"lead_number": "70001", "first_name": "Typed", "phone": "201-555-0111"})
    res = send(anonymous, lb_lead()).json()
    assert res["merged_with_typed_in"] == 1 and res["created"] == 0
    leads = staff.get("/leads?show=all").json()
    assert len(leads) == 1 and leads[0]["first_name"] == "Rosa" and leads[0]["source"] == "lawbase"


def test_lead_that_moves_on_leaves_the_active_list(anonymous, staff):
    send(anonymous, lb_lead())
    send(anonymous, lb_lead(status="Accepted"))
    assert staff.get("/leads").json() == []
    everything = staff.get("/leads?show=all").json()
    assert everything[0]["status"] == "signed" and everything[0]["lb_status"] == "Accepted"
    send(anonymous, lb_lead(serial=1002, number="70002", status="Rejected", phone=None))
    assert {l["lead_number"]: l["status"] for l in staff.get("/leads?show=all").json()} == {"70001": "signed", "70002": "closed"}


def test_bad_phone_is_reported_not_guessed(anonymous, staff):
    res = send(anonymous, lb_lead(phone="555-01")).json()
    assert res["created"] == 1 and "isn't a valid number" in res["skipped"][0]
    assert staff.get("/leads").json()[0]["phone"] is None


def test_number_waiting_in_needs_assigning_joins_the_lead(anonymous, staff, twilio_text):
    twilio_text("+12015550111", "Hi, I filled out your form", "SM1")
    assert staff.get("/conversations/counts").json()["unassigned"] == 1
    send(anonymous, lb_lead())
    assert staff.get("/conversations/counts").json()["unassigned"] == 0
    lead = staff.get("/leads").json()[0]
    first = staff.get(f"/conversations/{lead['conversation_id']}/messages").json()[0]
    assert first["content"] == "Hi, I filled out your form" and first["lead_id"] == lead["id"]


def test_leadbase_leads_are_changed_in_leadbase(anonymous, staff):
    send(anonymous, lb_lead())
    lead = staff.get("/leads").json()[0]
    assert staff.patch(f"/leads/{lead['id']}", json={"first_name": "Changed"}).status_code == 409


def test_leadbase_leads_cannot_be_deleted_here(anonymous, staff):
    send(anonymous, lb_lead())
    lead = staff.get("/leads").json()[0]
    assert staff.delete(f"/leads/{lead['id']}").status_code == 409


def test_lead_list_pages_sorts_and_searches(anonymous, staff):
    send(anonymous, *[lb_lead(serial=2000 + i, number=str(71000 + i), phone=f"201555{i:04d}",
                              first_name=f"Ann{i}", last_name="Zed" if i % 2 else "Abel") for i in range(7)])
    page = staff.get("/leads/page?limit=3&sort=lead_number&direction=asc").json()
    assert page["total"] == 7 and [l["lead_number"] for l in page["items"]] == ["71000", "71001", "71002"]
    nxt = staff.get("/leads/page?limit=3&offset=3&sort=lead_number&direction=asc").json()
    assert [l["lead_number"] for l in nxt["items"]] == ["71003", "71004", "71005"]
    assert all(l["conversation_id"] for l in page["items"])        # same details as the full list
    send(anonymous, lb_lead(serial=2999, number="71999", first_name=None, last_name=None, phone=None))
    by_name = staff.get("/leads/page?sort=name&direction=asc").json()["items"]
    assert by_name[0]["last_name"] == "Abel" and by_name[-1]["last_name"] is None   # no name goes last
    by_name_desc = staff.get("/leads/page?sort=name&direction=desc").json()["items"]
    assert by_name_desc[0]["last_name"] == "Zed" and by_name_desc[-1]["last_name"] is None
    assert staff.get("/leads/page?q=Zed").json()["total"] == 3
    assert staff.get("/leads/page?q=5550004").json()["items"][0]["lead_number"] == "71004"  # by phone digits
    assert staff.get("/leads/page?q=Ann2 Abel").json()["total"] == 1                        # first + last name


def test_single_lead_with_its_details(anonymous, staff):
    send(anonymous, lb_lead(status="Rejected"))
    lead = staff.get("/leads?show=all").json()[0]
    one = staff.get(f"/leads/{lead['id']}").json()
    assert one["lead_number"] == "70001" and one["conversation_id"] == lead["conversation_id"]
    assert staff.get("/leads/999999").status_code == 404
    assert staff.get("/leads/page").status_code == 200   # still the list, not lead "page"


def test_load_leads_button_wakes_the_bridge(anonymous, staff, client_user):
    # Nothing asked for: the bridge's waiting request comes back empty.
    assert anonymous.get("/bridge/wait-for-request?seconds=1", headers=KEY).json() == {"sync": False}
    assert anonymous.get("/bridge/wait-for-request?seconds=1").status_code == 401     # bridge key needed
    assert client_user.post("/lead-sync/request").status_code == 403                   # staff only
    # Staff click Load leads: the bridge's next wait answers at once.
    requested = staff.post("/lead-sync/request").json()["requested_at"]
    assert anonymous.get("/bridge/wait-for-request?seconds=5", headers=KEY).json() == {"sync": True}
    # The bridge syncs; the status shows it finished after the request, with what changed.
    send(anonymous, lb_lead())
    status = staff.get("/lead-sync/status").json()
    assert status["finished_at"] >= requested and status["result"]["created"] == 1
