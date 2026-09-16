import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select
from app.main import app
from app.db import engine
from app.X_models import InterviewSession, Candidate, Requisition, User

client = TestClient(app)

def test_detect_ai_endpoint():
    # 1. Test AI detection on ChatGPT style text
    chatgpt_text = (
        "Furthermore, it is important to remember that database optimization plays a crucial role in modern software engineering. "
        "Moreover, leveraging comprehensive connection pooling ensures that resources are allocated seamlessly and efficiently across all services. "
        "In summary, this intricate balance between throughput and latency stands as a testament to robust architectural principles."
    )
    res = client.post("/api/v1/detect-ai", json={"text": chatgpt_text})
    assert res.status_code == 200
    data = res.json()
    assert data["is_flagged"] is True
    assert data["ai_probability"] >= 60.0
    assert "perplexity" in data
    assert "burstiness" in data

    # 2. Test AI detection on Human style text
    human_text = "Yeah, so I remember we had an outage once when memory spiked, and we fixed it quickly by adjusting the heap size."
    res2 = client.post("/api/v1/detect-ai", json={"text": human_text})
    assert res2.status_code == 200
    data2 = res2.json()
    assert data2["is_flagged"] is False

def test_scheduling_endpoints():
    # Find or verify an existing interview session
    with Session(engine) as session:
        db_session = session.exec(select(InterviewSession)).first()
        assert db_session is not None
        session_uuid = db_session.session_uuid

    # 1. Get schedule info
    res = client.get(f"/api/v1/sessions/{session_uuid}/schedule-info")
    assert res.status_code == 200
    info = res.json()
    assert info["session_uuid"] == session_uuid
    assert len(info["available_days"]) > 0
    first_slot = info["available_days"][0]["slots"][0]

    # 2. Book a slot
    book_res = client.post(
        f"/api/v1/sessions/{session_uuid}/book-slot",
        json={"datetime_iso": first_slot["datetime_iso"], "timezone": "UTC"}
    )
    assert book_res.status_code == 200
    booked = book_res.json()
    assert "google_calendar_url" in booked
    assert "calendar.google.com" in booked["google_calendar_url"]
    assert "ics_download_url" in booked

    # 3. Download ICS calendar file
    ics_res = client.get(f"/api/v1/sessions/{session_uuid}/calendar.ics")
    assert ics_res.status_code == 200
    assert "text/calendar" in ics_res.headers.get("content-type", "")
    assert "BEGIN:VCALENDAR" in ics_res.text
