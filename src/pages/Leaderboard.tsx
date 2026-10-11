import { useMemo, useState } from 'react';
import { TRACKS, dayKey, formatGap, formatLap, seededLeaderboard, type LeaderboardEntry } from '../data';
import { useStore } from '../store';

type Period = 'day' | 'month' | 'all';
const PERIODS: { id: Period; label: string }[] = [
  { id: 'day', label: 'Today' },
  { id: 'month', label: 'This month' },
  { id: 'all', label: 'All time' },
];

export function Leaderboard() {
  const { profile, races } = useStore();
  const [trackId, setTrackId] = useState(TRACKS[0].id);
  const [period, setPeriod] = useState<Period>('all');
  const track = TRACKS.find((t) => t.id === trackId)!;

  const rows = useMemo(() => {
    const today = dayKey(new Date());
    const inPeriod = races.filter(
      (r) => r.trackId === trackId && (period === 'all' || (period === 'day' ? r.date === today : r.date.slice(0, 7) === today.slice(0, 7))),
    );
    const entries: LeaderboardEntry[] = seededLeaderboard(track, period);
    if (inPeriod.length) {
      const best = inPeriod.reduce<{ lapMs: number; date: string }>(
        (acc, r) => {
          const l = Math.min(...r.laps);
          return l < acc.lapMs ? { lapMs: l, date: r.date } : acc;
        },
        { lapMs: Infinity, date: today },
      );
      entries.push({ name: profile?.name ?? 'You', lapMs: best.lapMs, date: best.date, isYou: true });
    }
    return entries.sort((a, b) => a.lapMs - b.lapMs);
  }, [races, trackId, period, track, profile]);

  const top = rows[0]?.lapMs ?? 0;

  return (
    <div className="page">
      <h1>Leaderboard</h1>
      <div className="chips">
        {TRACKS.map((t) => (
          <button key={t.id} className={`chip ${t.id === trackId ? 'active' : ''}`} onClick={() => setTrackId(t.id)}>
            {t.name}
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
      <p className="muted">Track record: {formatLap(track.recordMs)}</p>

      <div className="card table-card">
        <table className="timing">
          <thead>
            <tr>
              <th>#</th>
              <th>Driver</th>
              <th className="num">Lap</th>
              <th className="num">Gap</th>
              <th className="num hide-sm">Date</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.name}-${i}`} className={r.isYou ? 'row-you' : ''}>
                <td className="pos">{i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</td>
                <td>{r.name}</td>
                <td className="num">{formatLap(r.lapMs)}</td>
                <td className="num">{i === 0 ? '—' : formatGap(r.lapMs - top)}</td>
                <td className="num hide-sm">{r.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.some((r) => r.isYou) && <p className="muted">Race on this track to get your name on the board.</p>}
    </div>
  );
}
