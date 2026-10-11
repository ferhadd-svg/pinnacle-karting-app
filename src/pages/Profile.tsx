import { useState } from 'react';
import { Link } from 'react-router-dom';
import { LapChart } from '../components/LapChart';
import { ProfileForm } from '../components/ProfileForm';
import { SESSION_TYPES, TRACKS, formatLap } from '../data';
import { bestLap, useStore } from '../store';

export function Profile() {
  const { profile, bookings, races, credits, cancelBooking, signOut } = useStore();
  const [editing, setEditing] = useState(false);
  const [openRace, setOpenRace] = useState<string | null>(null);

  if (!profile || editing) {
    return (
      <div className="page narrow">
        <h1>{profile ? 'Edit profile' : 'Create your driver profile'}</h1>
        <div className="card">
          <ProfileForm onSaved={() => setEditing(false)} />
        </div>
      </div>
    );
  }

  const now = new Date();
  const isUpcoming = (b: (typeof bookings)[number]) =>
    new Date(`${b.date}T${String(b.hour).padStart(2, '0')}:00`) >= now;
  const upcoming = bookings.filter((b) => !b.cancelled && isUpcoming(b));
  const past = bookings.filter((b) => b.cancelled || !isUpcoming(b));
  const wins = races.filter((r) => r.position === 1).length;
  const podiums = races.filter((r) => r.position <= 3).length;
  const tier = credits >= 50 ? 'Gold' : credits >= 20 ? 'Silver' : 'Bronze';

  return (
    <div className="page">
      <div className="profile-head">
        <div className="avatar">{profile.name.slice(0, 1).toUpperCase()}</div>
        <div>
          <h1>{profile.name}</h1>
          <p className="muted">
            {tier} member · {credits} credits
          </p>
        </div>
        <button className="btn" onClick={() => setEditing(true)}>
          Edit
        </button>
      </div>

      <section className="stats">
        <div className="stat">
          <span className="stat-label">Races</span>
          <span className="stat-value">{races.length}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Wins</span>
          <span className="stat-value">{wins}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Podiums</span>
          <span className="stat-value">{podiums}</span>
        </div>
        {TRACKS.map((t) => {
          const b = bestLap(races, t.id);
          return (
            <div className="stat" key={t.id}>
              <span className="stat-label">Best · {t.name.split(' ').slice(-1)}</span>
              <span className="stat-value">{b ? formatLap(b) : '—'}</span>
            </div>
          );
        })}
      </section>

      <h2 className="section-title">Upcoming bookings</h2>
      {upcoming.length === 0 ? (
        <p className="muted">
          Nothing booked. <Link to="/book">Book a race →</Link>
        </p>
      ) : (
        <div className="list">
          {upcoming.map((b) => (
            <div className="card list-item" key={b.id}>
              <div>
                <strong>{SESSION_TYPES.find((s) => s.id === b.sessionTypeId)?.name}</strong>
                <p className="muted">
                  {b.date} at {b.hour}:00 · {TRACKS.find((t) => t.id === b.trackId)?.name} · {b.drivers} driver
                  {b.drivers > 1 ? 's' : ''} · £{b.total}
                </p>
                <p className="muted small">Ref {b.id}</p>
              </div>
              <button className="btn btn-danger" onClick={() => confirm('Cancel this booking?') && cancelBooking(b.id)}>
                Cancel
              </button>
            </div>
          ))}
        </div>
      )}

      <h2 className="section-title">Race history</h2>
      {races.length === 0 ? (
        <p className="muted">
          No races yet. <Link to="/live">Jump into a race →</Link>
        </p>
      ) : (
        <div className="list">
          {races.map((r) => (
            <div className="card" key={r.id}>
              <button className="list-item race-toggle" onClick={() => setOpenRace(openRace === r.id ? null : r.id)}>
                <div>
                  <strong>
                    P{r.position}/{r.field} · {TRACKS.find((t) => t.id === r.trackId)?.name}
                  </strong>
                  <p className="muted">
                    {r.date} · best {formatLap(Math.min(...r.laps))} · {r.laps.length} laps
                  </p>
                </div>
                <span>{openRace === r.id ? '▲' : '▼'}</span>
              </button>
              {openRace === r.id && <LapChart laps={r.laps} />}
            </div>
          ))}
        </div>
      )}

      {past.length > 0 && (
        <>
          <h2 className="section-title">Past & cancelled bookings</h2>
          <div className="list">
            {past.map((b) => (
              <div className="card list-item" key={b.id}>
                <div>
                  <strong>{SESSION_TYPES.find((s) => s.id === b.sessionTypeId)?.name}</strong>
                  <p className="muted">
                    {b.date} at {b.hour}:00 {b.cancelled && '· Cancelled'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <button className="btn btn-danger signout" onClick={() => confirm('Sign out and clear all data on this device?') && signOut()}>
        Sign out
      </button>
    </div>
  );
}
