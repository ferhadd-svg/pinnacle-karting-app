import { Link } from 'react-router-dom';
import { SESSION_TYPES, TRACKS, formatLap } from '../data';
import { bestLap, useStore } from '../store';

export function Home() {
  const { profile, bookings, races, credits } = useStore();
  const now = new Date();
  const next = bookings
    .filter((b) => !b.cancelled && new Date(`${b.date}T${String(b.hour).padStart(2, '0')}:00`) >= now)
    .sort((a, b) => (a.date + a.hour).localeCompare(b.date + b.hour))[0];
  const best = bestLap(races, 'summit');

  return (
    <div className="page">
      <section className="hero">
        <p className="eyebrow">Pinnacle Karting</p>
        <h1>{profile ? `Ready to race, ${profile.name.split(' ')[0]}?` : 'Indoor electric karting.'}</h1>
        <p className="muted">Book a session, watch live timing and chase the track record.</p>
        <div className="hero-actions">
          <Link to="/book" className="btn btn-primary">
            Book a race
          </Link>
          <Link to="/live" className="btn">
            Live timing
          </Link>
        </div>
      </section>

      <section className="stats">
        <div className="stat">
          <span className="stat-label">Races</span>
          <span className="stat-value">{races.length}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Best lap · Summit</span>
          <span className="stat-value">{best ? formatLap(best) : '—'}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Credits</span>
          <span className="stat-value">{credits}</span>
        </div>
      </section>

      {next && (
        <section className="card highlight">
          <p className="eyebrow">Your next race</p>
          <h2>{SESSION_TYPES.find((s) => s.id === next.sessionTypeId)?.name}</h2>
          <p>
            {new Date(next.date).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })} at{' '}
            {next.hour}:00 · {TRACKS.find((t) => t.id === next.trackId)?.name}
          </p>
          <p className="muted">Arrive 20 minutes early for briefing. Ref {next.id}</p>
        </section>
      )}

      <h2 className="section-title">Sessions</h2>
      <div className="grid">
        {SESSION_TYPES.map((s) => (
          <Link key={s.id} to={`/book?session=${s.id}`} className="card card-link">
            <div className="card-head">
              <h3>{s.name}</h3>
              <span className="price">£{s.price}</span>
            </div>
            <p className="muted">{s.description}</p>
            <p className="tags">
              <span>{s.minutes} min</span>
              <span>Age {s.minAge}+</span>
            </p>
          </Link>
        ))}
      </div>

      <h2 className="section-title">Tracks</h2>
      <div className="grid">
        {TRACKS.map((t) => (
          <div key={t.id} className="card">
            <h3>{t.name}</h3>
            <p className="muted">{t.description}</p>
            <p className="tags">
              <span>{t.lengthM} m</span>
              <span>{t.corners} corners</span>
              <span>Record {formatLap(t.recordMs)}</span>
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
