import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BookingCode } from '../components/BookingCode';
import { ProfileForm } from '../components/ProfileForm';
import { CLOSE_HOUR, OPEN_HOUR, SESSION_TYPES, SLOT_CAPACITY, TRACKS, dayKey, takenSpots } from '../data';
import { useStore, type Booking } from '../store';

export function Book() {
  const [params] = useSearchParams();
  const { profile, bookings, addBooking } = useStore();
  const [sessionId, setSessionId] = useState(params.get('session') ?? SESSION_TYPES[0].id);
  const [trackId, setTrackId] = useState(TRACKS[0].id);
  const [date, setDate] = useState(dayKey(new Date()));
  const [hour, setHour] = useState<number | null>(null);
  const [drivers, setDrivers] = useState(1);
  const [confirmed, setConfirmed] = useState<Booking | null>(null);

  const session = SESSION_TYPES.find((s) => s.id === sessionId)!;
  const effectiveTrack = session.id === 'junior' ? 'ridge' : trackId;

  const days = useMemo(
    () => [...Array(14)].map((_, i) => new Date(Date.now() + i * 86_400_000)),
    [],
  );

  const slots = useMemo(() => {
    const now = new Date();
    return [...Array(CLOSE_HOUR - OPEN_HOUR)].map((_, i) => {
      const h = OPEN_HOUR + i;
      const mine = bookings
        .filter((b) => !b.cancelled && b.date === date && b.hour === h && b.sessionTypeId === sessionId)
        .reduce((n, b) => n + b.drivers, 0);
      const left = SLOT_CAPACITY - takenSpots(date, h, sessionId) - mine;
      const past = date === dayKey(now) && h <= now.getHours();
      return { hour: h, left: Math.max(0, left), disabled: past || left <= 0 };
    });
  }, [date, sessionId, bookings]);

  const slot = slots.find((s) => s.hour === hour);
  const maxDrivers = Math.min(8, slot?.left ?? 8);
  const total = session.price * drivers;

  if (confirmed) {
    return (
      <div className="page narrow">
        <div className="card confirm">
          <p className="eyebrow">Booking confirmed</p>
          <h1>You're on the grid!</h1>
          <BookingCode code={confirmed.id} />
          <p className="ref">Ref {confirmed.id}</p>
          <p>
            {session.name} · {TRACKS.find((t) => t.id === confirmed.trackId)?.name}
            <br />
            {new Date(confirmed.date).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}{' '}
            at {confirmed.hour}:00 · {confirmed.drivers} driver{confirmed.drivers > 1 ? 's' : ''}
          </p>
          <p className="muted">Show this code at the kiosk to check in. Closed-toe shoes required.</p>
          <div className="hero-actions">
            <Link to="/profile" className="btn btn-primary">
              View my bookings
            </Link>
            <button className="btn" onClick={() => { setConfirmed(null); setHour(null); }}>
              Book another
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <h1>Book a race</h1>

      <h2 className="section-title">1. Session</h2>
      <div className="chips">
        {SESSION_TYPES.map((s) => (
          <button key={s.id} className={`chip ${s.id === sessionId ? 'active' : ''}`} onClick={() => { setSessionId(s.id); setHour(null); }}>
            {s.name} · £{s.price}
          </button>
        ))}
      </div>
      <p className="muted">{session.description} {session.minutes} min · age {session.minAge}+.</p>

      <h2 className="section-title">2. Track</h2>
      <div className="chips">
        {TRACKS.map((t) => (
          <button
            key={t.id}
            className={`chip ${t.id === effectiveTrack ? 'active' : ''}`}
            disabled={session.id === 'junior' && t.id !== 'ridge'}
            onClick={() => setTrackId(t.id)}
          >
            {t.name}
          </button>
        ))}
      </div>

      <h2 className="section-title">3. Date</h2>
      <div className="date-strip">
        {days.map((d) => {
          const k = dayKey(d);
          return (
            <button key={k} className={`date-pill ${k === date ? 'active' : ''}`} onClick={() => { setDate(k); setHour(null); }}>
              <span>{d.toLocaleDateString(undefined, { weekday: 'short' })}</span>
              <strong>{d.getDate()}</strong>
              <span>{d.toLocaleDateString(undefined, { month: 'short' })}</span>
            </button>
          );
        })}
      </div>

      <h2 className="section-title">4. Time</h2>
      <div className="slots">
        {slots.map((s) => (
          <button
            key={s.hour}
            disabled={s.disabled}
            className={`slot ${s.hour === hour ? 'active' : ''}`}
            onClick={() => { setHour(s.hour); setDrivers((d) => Math.min(d, s.left)); }}
          >
            <strong>{s.hour}:00</strong>
            <span className={s.left <= 3 ? 'warn' : ''}>{s.disabled && s.left > 0 ? 'Closed' : s.left ? `${s.left} left` : 'Full'}</span>
          </button>
        ))}
      </div>

      <h2 className="section-title">5. Drivers</h2>
      <div className="stepper">
        <button className="btn" onClick={() => setDrivers(Math.max(1, drivers - 1))} aria-label="Fewer drivers">−</button>
        <span>{drivers}</span>
        <button className="btn" onClick={() => setDrivers(Math.min(maxDrivers, drivers + 1))} aria-label="More drivers">+</button>
      </div>

      <div className="card summary">
        <div>
          <p className="muted">Total</p>
          <p className="total">£{total}</p>
        </div>
        {profile ? (
          <button
            className="btn btn-primary"
            disabled={hour === null}
            onClick={() =>
              setConfirmed(addBooking({ sessionTypeId: sessionId, trackId: effectiveTrack, date, hour: hour!, drivers, total }))
            }
          >
            {hour === null ? 'Pick a time' : 'Confirm booking'}
          </button>
        ) : null}
      </div>

      {!profile && (
        <div className="card">
          <h2>Create your driver profile</h2>
          <p className="muted">We need a few details to book and to put your laps on the leaderboard.</p>
          <ProfileForm submitLabel="Save & continue" />
        </div>
      )}
    </div>
  );
}
