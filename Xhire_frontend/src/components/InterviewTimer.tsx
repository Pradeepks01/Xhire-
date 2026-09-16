// file: Xhire_frontend/src/components/InterviewTimer.tsx
import { useState, useEffect } from 'react';

interface Props {
  startTime: number; // A Unix timestamp (in seconds)
  durationMins: number;
}

// Helper to format time
const formatTime = (totalSeconds: number) => {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};

export function InterviewTimer({ startTime, durationMins }: Props) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startTime) return;

    // Calculate initial elapsed time
    const initialElapsed = Math.floor(Date.now() / 1000 - startTime);
    setElapsed(initialElapsed);

    // Start a 1-second interval
    const interval = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [startTime]);

  const totalDurationSec = durationMins * 60;
  const remaining = Math.max(0, totalDurationSec - elapsed);

  return (
    <div className="timer-container">
      <span className="timer-label">Round Time Remaining:</span>
      <span className="timer-time">{formatTime(remaining)}</span>
    </div>
  );
}