import pytest
from datetime import datetime, timezone, timedelta
from app.calendar_service import generate_ics_calendar, generate_google_calendar_url, generate_available_slots

def test_ics_generation():
    start = datetime(2026, 9, 15, 14, 0, tzinfo=timezone.utc)
    ics = generate_ics_calendar(
        event_id="test-session-123",
        title="AI Engineer Interview - Xhire",
        description="Your technical interview session with Xhire AI personas.",
        start_dt=start,
        duration_minutes=45,
        location_url="http://localhost:3000/candidate/test-session-123"
    )
    assert "BEGIN:VCALENDAR" in ics
    assert "VERSION:2.0" in ics
    assert "BEGIN:VEVENT" in ics
    assert "UID:test-session-123@xhire.ai" in ics
    assert "SUMMARY:AI Engineer Interview - Xhire" in ics
    assert "DTSTART:20260915T140000Z" in ics
    assert "DTEND:20260915T144500Z" in ics
    assert "END:VEVENT" in ics
    assert "END:VCALENDAR" in ics

def test_google_calendar_url():
    start = datetime(2026, 9, 15, 14, 0, tzinfo=timezone.utc)
    url = generate_google_calendar_url(
        title="AI Engineer Interview",
        description="Interview Details",
        start_dt=start,
        duration_minutes=45,
        location_url="http://localhost:3000"
    )
    assert url.startswith("https://calendar.google.com/calendar/render")
    assert "action=TEMPLATE" in url
    assert "dates=20260915T140000Z%2F20260915T144500Z" in url

def test_available_slots_generation():
    slots = generate_available_slots(days_ahead=3)
    assert len(slots) == 3
    assert len(slots[0]["slots"]) == 5
    assert "slot_id" in slots[0]["slots"][0]
    assert "datetime_iso" in slots[0]["slots"][0]
