import { Link } from 'react-router-dom';
import { api, formatDateTime, typeLabel } from '../api';
import { useAuth } from '../auth';
import { Empty, StatusBadge } from '../components/ui';
import { useAsync } from '../hooks';

export function Home() {
  const { me } = useAuth();
  const sessions = useAsync(() => api.sessions({ limit: 20 }), []);
  const pbs = useAsync(() => (me?.driver ? api.personalBests(me.driver.id) : Promise.resolve([])), [me?.driver?.id]);
  const live = (sessions.data ?? []).filter((s) => s.resultStatus === 'live');
  const recent = (sessions.data ?? []).filter((s) => s.resultStatus === 'final' || s.resultStatus === 'provisional').slice(0, 5);

  return (
    <div className="page">
      <section className="hero">
        <p className="eyebrow">Pinnacle Karting</p>
        <h1>{me?.driver ? `Welcome back, ${me.driver.name.split(' ')[0]}.` : 'Every lap, timed and saved.'}</h1>
        <p className="muted">
          Your lap times come straight from the track's timing system — check live timing, your session results and how you rank.
        </p>
        <div className="hero-actions">
          <Link to="/results" className="btn btn-primary">
            Results & live timing
          </Link>
          <Link to={me ? '/profile' : '/profile'} className="btn">
            {me ? 'My sessions' : 'Sign in'}
          </Link>
        </div>
      </section>

      {sessions.error && <p className="status-note status-note-provisional">{sessions.error}</p>}

      {live.length > 0 && (
        <>
          <h2 className="section-title">On track now</h2>
          <div className="list">
            {live.map((s) => (
              <Link key={s.id} to={`/results/${s.id}`} className="card card-link list-item highlight">
                <div>
                  <strong>{s.name}</strong>
                  <p className="muted">
                    {s.venueName} · {s.track.name} · {s.participantCount} karts
                  </p>
                </div>
                <StatusBadge status="live" />
              </Link>
            ))}
          </div>
        </>
      )}

      {pbs.data && pbs.data.length > 0 && (
        <>
          <h2 className="section-title">Your personal bests</h2>
          <div className="stats">
            {pbs.data.map((pb) => (
              <div className="stat" key={`${pb.track.id}-${pb.kartClass?.id}`}>
                <span className="stat-label">
                  {pb.track.name}
                  {pb.kartClass && ` · ${pb.kartClass.name}`}
                </span>
                <span className="stat-value">{pb.lapTime.display}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <h2 className="section-title">Latest results</h2>
      {sessions.data &&
        (recent.length ? (
          <div className="list">
            {recent.map((s) => (
              <Link key={s.id} to={`/results/${s.id}`} className="card card-link list-item">
                <div>
                  <strong>{s.name}</strong>
                  <p className="muted">
                    {typeLabel[s.type]} · {s.track.name} · {formatDateTime(s.startedAt)}
                  </p>
                </div>
                <StatusBadge status={s.resultStatus} />
              </Link>
            ))}
          </div>
        ) : (
          <Empty>No results yet.</Empty>
        ))}

      <div className="card">
        <h3>Book your next session</h3>
        <p className="muted">Arrive & Drive, Grand Prix, Junior and Team Endurance sessions.</p>
        <Link to="/book" className="btn">
          See sessions
        </Link>
      </div>
    </div>
  );
}
