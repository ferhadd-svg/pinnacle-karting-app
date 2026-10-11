import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, formatDateTime, typeLabel } from '../api';
import { Empty, ErrorNote, Loading, StatusBadge } from '../components/ui';
import { useAsync } from '../hooks';

export function Results() {
  const venues = useAsync(() => api.venues(), []);
  const [trackId, setTrackId] = useState<string>('');
  const sessions = useAsync(() => api.sessions({ trackId: trackId || undefined, limit: 50 }), [trackId]);

  const visible = (sessions.data ?? []).filter((s) => s.status !== 'cancelled' && s.status !== 'scheduled');
  const live = visible.filter((s) => s.resultStatus === 'live');
  const rest = visible.filter((s) => s.resultStatus !== 'live');

  return (
    <div className="page">
      <h1>Results</h1>
      {venues.data && (
        <div className="chips">
          <button className={`chip ${trackId === '' ? 'active' : ''}`} onClick={() => setTrackId('')}>
            All tracks
          </button>
          {venues.data.flatMap((v) =>
            v.tracks.map((t) => (
              <button key={t.id} className={`chip ${trackId === t.id ? 'active' : ''}`} onClick={() => setTrackId(t.id)}>
                {v.name} · {t.name}
              </button>
            )),
          )}
        </div>
      )}
      {sessions.error && <ErrorNote error={sessions.error} onRetry={sessions.reload} />}
      {sessions.loading && <Loading />}

      {live.length > 0 && (
        <>
          <h2 className="section-title">On track now</h2>
          <div className="list">
            {live.map((s) => (
              <SessionRow key={s.id} s={s} />
            ))}
          </div>
        </>
      )}
      {sessions.data && (
        <>
          <h2 className="section-title">Recent sessions</h2>
          {rest.length ? (
            <div className="list">
              {rest.map((s) => (
                <SessionRow key={s.id} s={s} />
              ))}
            </div>
          ) : (
            <Empty>No sessions yet.</Empty>
          )}
        </>
      )}
    </div>
  );
}

function SessionRow({ s }: { s: Awaited<ReturnType<typeof api.sessions>>[number] }) {
  return (
    <Link to={`/results/${s.id}`} className="card card-link list-item">
      <div>
        <strong>{s.name}</strong>
        <p className="muted">
          {typeLabel[s.type]} · {s.venueName} · {s.track.name} · {formatDateTime(s.startedAt)} · {s.participantCount} drivers
        </p>
      </div>
      <StatusBadge status={s.resultStatus} />
    </Link>
  );
}
