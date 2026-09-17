"""
Calendar Scheduling Service
Generates RFC 5545 compliant .ics iCalendar files, Google Calendar URLs,
and generates available interview time slots for candidate booking.
"""

import urllib.parse
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Any

def format_ics_datetime(dt: datetime) -> str:
    """Formats datetime to ICS UTC format: YYYYMMDDTHHMMSSZ"""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    utc_dt = dt.astimezone(timezone.utc)
    return utc_dt.strftime("%Y%m%dT%H%M%SZ")

def generate_ics_calendar(
    event_id: str,
    title: str,
    description: str,
    start_dt: datetime,
    duration_minutes: int = 45,
    location_url: str = "http://localhost:3000",
    organizer_email: str = "interviews@xhire.ai"
) -> str:
    """Generates an RFC 5545 compliant .ics calendar file content string."""
    end_dt = start_dt + timedelta(minutes=duration_minutes)
    dtstamp = format_ics_datetime(datetime.now(timezone.utc))
    dtstart = format_ics_datetime(start_dt)
    dtend = format_ics_datetime(end_dt)

    # Sanitize multiline description for ICS (escape newlines)
    clean_desc = description.replace("\r\n", "\\n").replace("\n", "\\n")

    ics_content = (
        "BEGIN:VCALENDAR\r\n"
        "VERSION:2.0\r\n"
        "PRODID:-//Xhire AI//Interview Scheduler//EN\r\n"
        "CALSCALE:GREGORIAN\r\n"
        "METHOD:REQUEST\r\n"
        "BEGIN:VEVENT\r\n"
        f"UID:{event_id}@xhire.ai\r\n"
        f"DTSTAMP:{dtstamp}\r\n"
        f"DTSTART:{dtstart}\r\n"
        f"DTEND:{dtend}\r\n"
        f"SUMMARY:{title}\r\n"
        f"DESCRIPTION:{clean_desc}\r\n"
        f"LOCATION:{location_url}\r\n"
        f"ORGANIZER;CN=Xhire Recruiting:mailto:{organizer_email}\r\n"
        "STATUS:CONFIRMED\r\n"
        "SEQUENCE:0\r\n"
        "BEGIN:VALARM\r\n"
        "TRIGGER:-PT15M\r\n"
        "ACTION:DISPLAY\r\n"
        "DESCRIPTION:Reminder: Your Xhire AI Technical Interview starts in 15 minutes\r\n"
        "END:VALARM\r\n"
        "END:VEVENT\r\n"
        "END:VCALENDAR\r\n"
    )
    return ics_content

def generate_google_calendar_url(
    title: str,
    description: str,
    start_dt: datetime,
    duration_minutes: int = 45,
    location_url: str = "http://localhost:3000"
) -> str:
    """Generates a direct one-click Google Calendar add-event URL."""
    end_dt = start_dt + timedelta(minutes=duration_minutes)
    start_fmt = format_ics_datetime(start_dt)
    end_fmt = format_ics_datetime(end_dt)

    base_url = "https://calendar.google.com/calendar/render"
    params = {
        "action": "TEMPLATE",
        "text": title,
        "dates": f"{start_fmt}/{end_fmt}",
        "details": description,
        "location": location_url,
    }
    return f"{base_url}?{urllib.parse.urlencode(params)}"

def generate_available_slots(days_ahead: int = 5, start_day_offset: int = 1) -> List[Dict[str, Any]]:
    """
    Generates available interview booking slots for upcoming business days.
    Slots are set at: 09:30 AM, 11:30 AM, 02:00 PM, 03:30 PM, 05:00 PM.
    """
    now = datetime.now(timezone.utc)
    slots = []

    slot_times = [
        (9, 30, "Morning"),
        (11, 30, "Morning"),
        (14, 0, "Afternoon"),
        (15, 30, "Afternoon"),
        (17, 0, "Evening"),
    ]

    current_day = now.date() + timedelta(days=start_day_offset)
    days_generated = 0

    while days_generated < days_ahead:
        # Skip weekends (5=Saturday, 6=Sunday)
        if current_day.weekday() < 5:
            day_label = current_day.strftime("%A, %b %d")
            date_iso = current_day.strftime("%Y-%m-%d")

            day_slots = []
            for hour, minute, period in slot_times:
                slot_dt = datetime(
                    current_day.year, current_day.month, current_day.day,
                    hour, minute, tzinfo=timezone.utc
                )
                time_label = slot_dt.strftime("%I:%M %p UTC")
                slot_id = f"{date_iso}_{hour:02d}{minute:02d}"

                day_slots.append({
                    "slot_id": slot_id,
                    "datetime_iso": slot_dt.isoformat(),
                    "time_label": time_label,
                    "period": period,
                    "duration_minutes": 45
                })

            slots.append({
                "date": date_iso,
                "day_label": day_label,
                "slots": day_slots
            })
            days_generated += 1

        current_day += timedelta(days=1)

    return slots
