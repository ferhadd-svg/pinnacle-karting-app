import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, SESSION_TYPES, typeLabel, type DriverSession } from '../api';
import { isStaff, useAuth } from '../auth';
import { AuthForm } from '../components/AuthForm';
import { Empty, ErrorNote, Loading, StatusBadge } from '../components/ui';
import { SESSION_TYPES as BOOKING_TYPES, TRACKS } from '../data';
import { useAsync } from '../hooks';
import { useStore } from '../store';

export function Profile() {
  const { me, loading, logout, refresh } = useAuth();
  if (loading) return <Loading />;
  if (!me) {
    return (
      <div className="page narrow">
        <h1>Your driver profile</h1>
        <p className="muted">Sign in to see your sessions, lap-by-lap times and personal bests.</p>
        <AuthForm />
      </div>
    );
  }
  if (!me.driver) {
    return (
      <div className="page narrow">
        <h1>{me.email}</h1>
        <p className="muted">Signed in as {me.role}. {isStaff(me) && <Link to="/admin">Open the operator console →</Link>}</p>
        <button className="btn" onClick={logout}>
          Sign out
        </button>
      </div>
    );
  }
  return <DriverHome driverId={me.driver.id} name={me.driver.name} isPublic={me.driver.showOnLeaderboards} onSignOut={logout} onChanged={refresh} />;
}

function DriverHome(props: { driverId: string; name: string; isPublic: boolean; onSignOut: () => void; onChanged: () => Promise<void> }) {
  const [filters, setFilters] = useState({ venueId: '', type: '', kart: '', from: '', to: '' });
  const venues = useAsync(() => api.venues(), []);
  const history = useAsync(
    () =>
      api.driverSessions(props.driverId, {
        venueId: filters.venueId || undefined,
        type: filters.type || undefined,
        kart: filters.kart || undefined,
        from: filters.from ? new Date(filters.from).toISOString() : undefined,
        to: filters.to ? new Date(new Date(filters.to).getTime() + 86_400_000).toISOString() : undefined,
      }),
    [props.driverId, filters],
  );
  const pbs = useAsync(() => api.personalBests(props.driverId), [props.driverId]);
  const set = (k: keyof typeof filters) => (e: { target: { value: string } }) => setFilters({ ...filters, [k]: e.target.value });

  const finals = (history.data ?? []).filter((s) => s.session.resultStatus === 'final');
  const wins = finals.filter((s) => s.position === 1).length;
  const podiums = finals.filter((s) => s.position !== null && s.position <= 3).length;

  return (
    <div className="page">
      <div className="profile-head">
        <div className="avatar">{props.name.slice(0, 1).toUpperCase()}</div>
        <div>
          <h1>{props.name}</h1>
          <label className="toggle">
            <input
              type="checkbox"
              checked={props.isPublic}
              onChange={async (e) => {
                await api.updateMyDriver({ showOnLeaderboards: e.target.checked });
                await props.onChanged();
              }}
            />
            Show me on public leaderboards
          </label>
        </div>
        <button className="btn" onClick={props.onSignOut}>
          Sign out
        </button>
      </div>

      <section className="stats">
        <div className="stat">
          <span className="stat-label">Sessions</span>
          <span className="stat-value">{history.data?.length ?? '—'}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Wins</span>
          <span className="stat-value">{wins}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Podiums</span>
          <span className="stat-value">{podiums}</span>
        </div>
      </section>

      <h2 className="section-title">Personal bests</h2>
      {pbs.error && <ErrorNote error={pbs.error} onRetry={pbs.reload} />}
      {pbs.data &&
        (pbs.data.length === 0 ? (
          <Empty>Personal bests appear once a session you drove in is finalised.</Empty>
        ) : (
          <div className="stats">
            {pbs.data.map((pb) => (
              <Link key={`${pb.track.id}-${pb.kartClass?.id}`} to={`/results/${pb.sessionId}`} className="stat card-link">
                <span className="stat-label">
                  {pb.track.name}
                  {pb.kartClass && ` · ${pb.kartClass.name}`}
                </span>
                <span className="stat-value">{pb.lapTime.display}</span>
                <span className="muted small">{new Date(pb.setAt).toLocaleDateString()}</span>
              </Link>
            ))}
          </div>
        ))}

      <h2 className="section-title">Session history</h2>
      <div className="filters">
        <select value={filters.venueId} onChange={set('venueId')} aria-label="Venue">
          <option value="">All venues</option>
          {venues.data?.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
        <select value={filters.type} onChange={set('type')} aria-label="Session type">
          <option value="">All types</option>
          {SESSION_TYPES.map((t) => (
            <option key={t} value={t}>
              {typeLabel[t]}
            </option>
          ))}
        </select>
        <input placeholder="Kart #" value={filters.kart} onChange={set('kart')} aria-label="Kart number" />
        <input type="date" value={filters.from} onChange={set('from')} aria-label="From date" />
        <input type="date" value={filters.to} onChange={set('to')} aria-label="To date" />
      </div>
      {history.error && <ErrorNote error={history.error} onRetry={history.reload} />}
      {history.loading && <Loading />}
      {history.data &&
        (history.data.length === 0 ? (
          <Empty>No sessions match. Your laps appear here after the track assigns you to a kart.</Empty>
        ) : (
          <div className="list">
            {history.data.map((s) => (
              <HistoryRow key={s.session.id} s={s} />
            ))}
          </div>
        ))}

      <LocalBookings />
    </div>
  );
}

function HistoryRow({ s }: { s: DriverSession }) {
  return (
    <Link to={`/results/${s.session.id}`} className="card card-link list-item">
      <div>
        <strong>
          {s.position ? `P${s.position}/${s.fieldSize} · ` : ''}
          {s.session.name}
        </strong>
        <p className="muted">
          {typeLabel[s.session.type]} · {s.venue.name} · {s.track.name} · {new Date(s.session.startedAt).toLocaleDateString()} · kart {s.karts}
        </p>
        <p className="muted">
          {s.laps} laps · best {s.bestLap?.display ?? '—'} · avg {s.averageLap?.display ?? '—'}
        </p>
      </div>
      <StatusBadge status={s.session.resultStatus} />
    </Link>
  );
}

/** Bookings made with the demo booking flow (stored on this device only until the bookings module ships). */
function LocalBookings() {
  const { bookings, cancelBooking } = useStore();
  const upcoming = bookings.filter((b) => !b.cancelled && new Date(`${b.date}T${String(b.hour).padStart(2, '0')}:00`) >= new Date());
  if (!upcoming.length) return null;
  return (
    <>
      <h2 className="section-title">Upcoming bookings (this device)</h2>
      <div className="list">
        {upcoming.map((b) => (
          <div className="card list-item" key={b.id}>
            <div>
              <strong>{BOOKING_TYPES.find((s) => s.id === b.sessionTypeId)?.name}</strong>
              <p className="muted">
                {b.date} at {b.hour}:00 · {TRACKS.find((t) => t.id === b.trackId)?.name} · {b.drivers} driver{b.drivers > 1 ? 's' : ''} · RM{b.total}
              </p>
              <p className="muted small">Ref {b.id}</p>
            </div>
            <button className="btn btn-danger" onClick={() => confirm('Cancel this booking?') && cancelBooking(b.id)}>
              Cancel
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
