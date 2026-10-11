import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { Empty, ErrorNote, Loading } from '../components/ui';
import { useAsync } from '../hooks';

type Period = 'day' | 'week' | 'month' | 'all';
const PERIODS: { id: Period; label: string }[] = [
  { id: 'day', label: 'Today' },
  { id: 'week', label: 'This week' },
  { id: 'month', label: 'This month' },
  { id: 'all', label: 'All time' },
];

export function Leaderboard() {
  const { me } = useAuth();
  const venues = useAsync(() => api.venues(), []);
  const tracks = (venues.data ?? []).flatMap((v) => v.tracks.map((t) => ({ ...t, venue: v.name })));
  const [trackId, setTrackId] = useState('');
  const [period, setPeriod] = useState<Period>('all');
  const [classId, setClassId] = useState('');
  useEffect(() => {
    if (!trackId && tracks.length) setTrackId(tracks[0].id);
  }, [trackId, tracks]);

  const board = useAsync(() => (trackId ? api.trackLeaderboard(trackId, period, classId || undefined) : Promise.resolve(null)), [trackId, period, classId]);
  const records = useAsync(() => (trackId ? api.trackRecords(trackId) : Promise.resolve([])), [trackId]);

  if (venues.error) return <ErrorNote error={venues.error} onRetry={venues.reload} />;
  return (
    <div className="page">
      <h1>Leaderboards</h1>
      <div className="chips">
        {tracks.map((t) => (
          <button key={t.id} className={`chip ${t.id === trackId ? 'active' : ''}`} onClick={() => { setTrackId(t.id); setClassId(''); }}>
            {t.venue} · {t.name}
          </button>
        ))}
      </div>
      <div className="chips">
        {PERIODS.map((p) => (
          <button key={p.id} className={`chip ${p.id === period ? 'active' : ''}`} onClick={() => setPeriod(p.id)}>
            {p.label}
          </button>
        ))}
      </div>

      {records.data && records.data.length > 0 && (
        <div className="stats">
          {records.data.map((r, i) => (
            <div className="stat" key={i}>
              <span className="stat-label">Track record · {r.kartClass?.name ?? 'Unclassified'}</span>
              <span className="stat-value">{r.lapTime.display}</span>
              <span className="muted small">{r.driver?.name}</span>
            </div>
          ))}
        </div>
      )}

      {board.data && board.data.classesIncluded.length > 1 && (
        <div className="chips">
          <button className={`chip ${classId === '' ? 'active' : ''}`} onClick={() => setClassId('')}>
            All classes
          </button>
          {board.data.classesIncluded.map((c) => (
            <button key={c.id ?? 'none'} className={`chip ${classId === c.id ? 'active' : ''}`} onClick={() => setClassId(c.id ?? '')}>
              {c.name ?? 'Unclassified'}
            </button>
          ))}
        </div>
      )}
      {board.data?.note && <p className="status-note status-note-provisional">{board.data.note}</p>}
      {board.error && <ErrorNote error={board.error} onRetry={board.reload} />}
      {board.loading && <Loading />}
      {board.data &&
        (board.data.entries.length === 0 ? (
          <Empty>No final results for this period yet.</Empty>
        ) : (
          <div className="card table-card">
            <table className="timing">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Driver</th>
                  <th className="num">Best lap</th>
                  <th className="num">Gap</th>
                  <th className="num hide-sm">Class</th>
                  <th className="num hide-sm">Date</th>
                </tr>
              </thead>
              <tbody>
                {board.data.entries.map((e) => (
                  <tr key={`${e.driver.id}-${e.kartClass?.name}`} className={me?.driver?.id === e.driver.id ? 'row-you' : ''}>
                    <td className="pos">{e.position <= 3 ? ['🥇', '🥈', '🥉'][e.position - 1] : e.position}</td>
                    <td>
                      <Link to={`/results/${e.sessionId}`}>{e.driver.name}</Link>
                    </td>
                    <td className="num">{e.lapTime.display}</td>
                    <td className="num">{e.gapUs ? `+${(e.gapUs / 1e6).toFixed(3)}` : '—'}</td>
                    <td className="num hide-sm">{e.kartClass?.name ?? '—'}</td>
                    <td className="num hide-sm">{new Date(e.setAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      <p className="muted small">
        Only final (officially confirmed) results count. Each track layout has its own leaderboard; kart classes are shown separately
        when mixed. Equal times are ranked by who set them first.
      </p>
    </div>
  );
}
