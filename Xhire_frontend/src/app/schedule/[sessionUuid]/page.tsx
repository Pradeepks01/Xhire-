'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiClient } from '../../../api';
import { useToast } from '../../../context/ToastContext';
import type { ScheduleInfo, BookSlotResponse } from '../../../types';
import { 
  Calendar, 
  Clock, 
  CheckCircle2, 
  Download, 
  ExternalLink, 
  ArrowRight, 
  User, 
  Briefcase, 
  KeyRound, 
  Globe,
  Sparkles,
  ChevronRight
} from 'lucide-react';
import '../../../styles/CandidatePortal.css';

const TIMEZONES = [
  { label: "UTC (Coordinated Universal Time)", value: "UTC" },
  { label: "EST / EDT (US Eastern Time)", value: "America/New_York" },
  { label: "CST / CDT (US Central Time)", value: "America/Chicago" },
  { label: "PST / PDT (US Pacific Time)", value: "America/Los_Angeles" },
  { label: "GMT / BST (London)", value: "Europe/London" },
  { label: "CET / CEST (Central European Time)", value: "Europe/Paris" },
  { label: "IST (India Standard Time)", value: "Asia/Kolkata" },
  { label: "SGT (Singapore Time)", value: "Asia/Singapore" },
  { label: "JST (Japan Standard Time)", value: "Asia/Tokyo" },
];

export default function ScheduleSessionPage() {
  const params = useParams();
  const sessionUuid = params?.sessionUuid as string;
  const router = useRouter();
  const { showToast } = useToast();

  const [scheduleInfo, setScheduleInfo] = useState<ScheduleInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Booking states
  const [selectedDateIndex, setSelectedDateIndex] = useState(0);
  const [selectedSlotIso, setSelectedSlotIso] = useState<string | null>(null);
  const [selectedTimezone, setSelectedTimezone] = useState("UTC");
  const [isBooking, setIsBooking] = useState(false);
  const [bookingResult, setBookingResult] = useState<BookSlotResponse | null>(null);

  useEffect(() => {
    if (!sessionUuid) return;
    fetchScheduleInfo();
  }, [sessionUuid]);

  const fetchScheduleInfo = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get<ScheduleInfo>(`/sessions/${sessionUuid}/schedule-info`);
      setScheduleInfo(res.data);
      if (res.data.scheduled_timezone) {
        setSelectedTimezone(res.data.scheduled_timezone);
      }
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || "Failed to load scheduling details.");
    } finally {
      setLoading(false);
    }
  };

  const handleBookSlot = async () => {
    if (!selectedSlotIso) {
      showToast("Please select a time slot first.", "error");
      return;
    }

    try {
      setIsBooking(true);
      const res = await apiClient.post<BookSlotResponse>(`/sessions/${sessionUuid}/book-slot`, {
        datetime_iso: selectedSlotIso,
        timezone: selectedTimezone,
      });
      setBookingResult(res.data);
      showToast("Interview slot successfully booked!", "success");
      // Refresh info
      fetchScheduleInfo();
    } catch (err: any) {
      showToast(err.response?.data?.detail || err.message || "Booking failed.", "error");
    } finally {
      setIsBooking(false);
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: '85vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
          <Calendar size={40} style={{ animation: 'pulse 1.5s infinite', color: 'var(--brand-primary)', marginBottom: '1rem' }} />
          <p style={{ fontSize: '1.1rem' }}>Loading interview schedule...</p>
        </div>
      </div>
    );
  }

  if (error || !scheduleInfo) {
    return (
      <div style={{ maxWidth: '600px', margin: '4rem auto', padding: '2rem', background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border-color)', textAlign: 'center' }}>
        <h2 style={{ color: '#ef4444', marginBottom: '1rem' }}>Scheduling Unavailable</h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>{error || "Could not find session."}</p>
        <button onClick={() => router.push('/candidate-login')} className="btn-primary" style={{ padding: '0.6rem 1.4rem' }}>
          Back to Candidate Login
        </button>
      </div>
    );
  }

  const selectedDay = scheduleInfo.available_days[selectedDateIndex];
  const isAlreadyScheduled = Boolean(scheduleInfo.scheduled_at);

  return (
    <div style={{ maxWidth: '920px', margin: '2rem auto', padding: '0 1.5rem' }}>
      {/* Header Banner */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(76, 29, 149, 0.25) 0%, rgba(13, 148, 136, 0.25) 100%)',
        border: '1px solid var(--border-color)',
        borderRadius: '16px',
        padding: '2rem',
        marginBottom: '2rem',
        boxShadow: '0 8px 30px rgba(0,0,0,0.12)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: 'var(--brand-primary)', fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          <Sparkles size={16} />
          Xhire AI Technical Interview Scheduling
        </div>
        <h1 style={{ fontSize: '1.85rem', fontWeight: 800, margin: '0 0 0.5rem 0', color: 'var(--text-primary)' }}>
          {scheduleInfo.requisition_title}
        </h1>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', color: 'var(--text-secondary)', fontSize: '0.95rem', marginTop: '1rem' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <User size={15} color="var(--brand-primary)" />
            {scheduleInfo.candidate_name}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <Briefcase size={15} color="var(--brand-primary)" />
            45-Minute Autonomous Session
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <KeyRound size={15} color="var(--brand-primary)" />
            Access Code: <strong style={{ fontFamily: 'monospace', letterSpacing: '0.1em' }}>{scheduleInfo.access_code}</strong>
          </span>
        </div>
      </div>

      {/* Confirmed Booking State */}
      {(bookingResult || isAlreadyScheduled) && (
        <div style={{
          backgroundColor: 'rgba(16, 185, 129, 0.12)',
          border: '1px solid rgba(16, 185, 129, 0.35)',
          borderRadius: '14px',
          padding: '1.75rem',
          marginBottom: '2rem',
          boxShadow: '0 4px 20px rgba(16, 185, 129, 0.15)'
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
            <CheckCircle2 size={28} color="#10b981" style={{ flexShrink: 0, marginTop: '2px' }} />
            <div style={{ flex: 1 }}>
              <h2 style={{ fontSize: '1.3rem', fontWeight: 700, margin: '0 0 0.35rem 0', color: '#10b981' }}>
                Interview Confirmed!
              </h2>
              <p style={{ margin: '0 0 1rem 0', color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
                Your technical interview is reserved for:
              </p>
              <div style={{
                fontSize: '1.25rem',
                fontWeight: 700,
                color: 'var(--text-primary)',
                background: 'var(--card-bg)',
                padding: '0.75rem 1.25rem',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
                display: 'inline-block',
                marginBottom: '1.25rem'
              }}>
                📅 {new Date(bookingResult?.scheduled_at || scheduleInfo.scheduled_at!).toLocaleString(undefined, {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                  timeZoneName: 'short'
                })}
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
                <a
                  href={bookingResult?.google_calendar_url || `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(scheduleInfo.requisition_title + " Interview - Xhire")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-primary"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '0.65rem 1.25rem',
                    textDecoration: 'none',
                    fontWeight: 600,
                    borderRadius: '8px'
                  }}
                >
                  <Calendar size={16} />
                  Add to Google Calendar
                  <ExternalLink size={13} />
                </a>

                <a
                  href={`http://127.0.0.1:8000/api/v1/sessions/${sessionUuid}/calendar.ics`}
                  download={`interview-${sessionUuid.slice(0, 8)}.ics`}
                  className="btn-secondary"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '0.65rem 1.25rem',
                    textDecoration: 'none',
                    fontWeight: 600,
                    borderRadius: '8px'
                  }}
                >
                  <Download size={16} />
                  Download .ICS (Outlook/Apple)
                </a>

                <Link
                  href={`/candidate/${sessionUuid}`}
                  style={{
                    marginLeft: 'auto',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    color: 'var(--brand-primary)',
                    fontWeight: 700,
                    textDecoration: 'none',
                    padding: '0.65rem 1rem'
                  }}
                >
                  Enter Interview Room
                  <ArrowRight size={16} />
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Booking Form Card */}
      <div style={{
        background: 'var(--card-bg)',
        border: '1px solid var(--border-color)',
        borderRadius: '16px',
        padding: '2rem',
        boxShadow: '0 4px 20px rgba(0,0,0,0.06)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.75rem' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 0.25rem 0', color: 'var(--text-primary)' }}>
              {isAlreadyScheduled ? "Reschedule Interview Slot" : "Select Your Interview Slot"}
            </h2>
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              Choose a time that works best for you. The session takes 45 minutes.
            </p>
          </div>

          {/* Timezone Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Globe size={16} color="var(--text-muted)" />
            <select
              value={selectedTimezone}
              onChange={(e) => setSelectedTimezone(e.target.value)}
              style={{
                background: 'var(--input-bg, #1e293b)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                padding: '0.5rem 0.75rem',
                fontSize: '0.85rem'
              }}
            >
              {TIMEZONES.map(tz => (
                <option key={tz.value} value={tz.value}>{tz.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Date Selector Tabs */}
        <div style={{ display: 'flex', gap: '0.75rem', overflowX: 'auto', paddingBottom: '0.75rem', marginBottom: '1.75rem' }}>
          {scheduleInfo.available_days.map((day, idx) => {
            const isSelected = idx === selectedDateIndex;
            return (
              <button
                key={day.date}
                type="button"
                onClick={() => {
                  setSelectedDateIndex(idx);
                  setSelectedSlotIso(null);
                }}
                style={{
                  flexShrink: 0,
                  padding: '0.75rem 1.25rem',
                  borderRadius: '10px',
                  border: isSelected ? '2px solid var(--brand-primary)' : '1px solid var(--border-color)',
                  background: isSelected ? 'rgba(124, 58, 237, 0.12)' : 'var(--bg-card-secondary, rgba(255,255,255,0.03))',
                  color: isSelected ? 'var(--brand-primary)' : 'var(--text-secondary)',
                  fontWeight: isSelected ? 700 : 500,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  textAlign: 'center'
                }}
              >
                <div style={{ fontSize: '0.8rem', opacity: 0.8 }}>Day {idx + 1}</div>
                <div style={{ fontSize: '0.95rem', marginTop: '2px' }}>{day.day_label}</div>
              </button>
            );
          })}
        </div>

        {/* Available Time Slots Grid */}
        {selectedDay && (
          <div>
            <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Clock size={16} color="var(--brand-primary)" />
              Available Times for {selectedDay.day_label}:
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.75rem', marginBottom: '2rem' }}>
              {selectedDay.slots.map(slot => {
                const isSelected = selectedSlotIso === slot.datetime_iso;
                return (
                  <button
                    key={slot.slot_id}
                    type="button"
                    onClick={() => setSelectedSlotIso(slot.datetime_iso)}
                    style={{
                      padding: '1rem',
                      borderRadius: '10px',
                      border: isSelected ? '2px solid #10b981' : '1px solid var(--border-color)',
                      background: isSelected ? 'rgba(16, 185, 129, 0.15)' : 'var(--bg-card-secondary, rgba(255,255,255,0.02))',
                      color: isSelected ? '#10b981' : 'var(--text-primary)',
                      cursor: 'pointer',
                      textAlign: 'center',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ fontSize: '1.05rem', fontWeight: 700 }}>{slot.time_label}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                      {slot.period} • {slot.duration_minutes}m
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Confirm Booking Action Footer */}
        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>
            {selectedSlotIso ? (
              <span style={{ color: '#10b981', fontWeight: 600 }}>
                Selected: {new Date(selectedSlotIso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} on {selectedDay?.day_label}
              </span>
            ) : (
              "Please click on an available time slot above to proceed."
            )}
          </div>

          <button
            type="button"
            disabled={!selectedSlotIso || isBooking}
            onClick={handleBookSlot}
            className="btn-primary"
            style={{
              padding: '0.85rem 1.85rem',
              fontSize: '1rem',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              borderRadius: '10px',
              opacity: !selectedSlotIso || isBooking ? 0.5 : 1,
              cursor: !selectedSlotIso || isBooking ? 'not-allowed' : 'pointer'
            }}
          >
            <Calendar size={18} />
            {isBooking ? "Reserving Slot..." : isAlreadyScheduled ? "Confirm Reschedule" : "Confirm Interview Slot"}
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
