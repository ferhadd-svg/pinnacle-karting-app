import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, formatDateTime, typeLabel, watchSession, type Lap, type LeaderboardEntry } from '../api';
import { useAuth } from '../auth';
import { LapChart } from '../components/LapChart';
import { ErrorNote, Loading, ResultStatusNote, StatusBadge } from '../components/ui';
import { useAsync } from '../hooks';

const gapText = (e: LeaderboardEntry) => (!e.gap ? '' : 'laps' in e.gap ? `+${e.gap.laps} lap${e.gap.laps > 1 ? 's' : ''}` : e.gap.display);
const RACES = ['sprint', 'endurance'];

export function SessionResult() {
  const { id = '' } = useParams();
  const { me } = useAuth();
  const board = useAsync(() => api.sessionLeaderboard(id), [id]);
  const laps = useAsync(() => api.sessionLaps(id), [id]);
  const [open, setOpen] = useState<string | null>(null);

  // Refetch when the server says results changed (live and provisional sessions).
  useEffect(() => {
    const status = board.data?.resultStatus;
    if (status !== 'live' && status !== 'provisional') return;
    return watchSession(id, () => {
      void board.reload();
      void laps.reload();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, board.data?.resultStatus]);

  const lapsBy = useMemo(() => {
    const m = new Map<string, Lap[]>();
    for (const l of laps.data ?? []) m.set(l.participantId, [...(m.get(l.participantId) ?? []), l]);
    return m;
  }, [laps.data]);

  if (board.error) return <ErrorNote error={board.error} onRetry={board.reload} />;
  if (!board.data) return <Loading />;
  const { session, entries, resultStatus } = board.data;
  const isRace = RACES.includes(session.type);
  const myDriverId = me?.driver?.id;

  return (
    <div className="page">
      <Link to="/results" className="back">
        ← Results
      </Link>
      <div className="title-row">
        <div>
          <p className="eyebrow">
            {typeLabel[session.type]} · {session.venue.name} · {session.track.name}
          </p>
          <h1>{session.name}</h1>
          <p className="muted">
            {formatDateTime(session.startedAt, session.venue.timezone)}
            {session.kartClass && ` · ${session.kartClass.name}`}
          </p>
        </div>
        <StatusBadge status={resultStatus} />
      </div>
      <ResultStatusNote status={resultStatus} />

      <div className="card table-card">
        <table className="timing">
          <thead>
            <tr>
              <th>P</th>
              <th>Driver</th>
              <th className="num">{isRace ? 'Laps' : 'Best'}</th>
              <th className="num">{isRace ? 'Best' : 'Laps'}</th>
              <th className="num hide-sm">Avg</th>
              <th className="num">Gap</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => {
              const mine = !!myDriverId && e.driver?.id === myDriverId;
              const expanded = open === e.participantId;
              return (
                <Fragment key={e.participantId}>
                  <tr className={`clickable ${mine ? 'row-you' : ''}`} onClick={() => setOpen(expanded ? null : e.participantId)} aria-expanded={expanded}>
                    <td className="pos">{e.disqualified ? 'DQ' : (e.position ?? '—')}</td>
                    <td>
                      <span className="kart-badge">#{e.karts}</span> {e.teamName ?? e.driver?.name ?? '—'}
                      {e.teamName && e.driver && <span className="muted small"> ({e.driver.name})</span>}
                    </td>
                    <td className={`num ${!isRace && e.hasFastestLap ? 'purple' : ''}`}>{isRace ? e.lapsCompleted : (e.bestLap?.display ?? '—')}</td>
                    <td className={`num ${isRace && e.hasFastestLap ? 'purple' : ''}`}>{isRace ? (e.bestLap?.display ?? '—') : e.lapsCompleted}</td>
                    <td className="num hide-sm">{e.averageLap?.display ?? '—'}</td>
                    <td className="num">{e.position === 1 ? '' : gapText(e)}</td>
                  </tr>
                  {expanded && (
                    <tr className="detail-row">
                      <td colSpan={6}>
                        <LapChart laps={lapsBy.get(e.participantId) ?? []} />
                        {(lapsBy.get(e.participantId) ?? []).some((l) => l.driver?.id !== e.driver?.id) && (
                          <p className="muted small">Team entry — laps are attributed to the driver in the kart at the time.</p>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="muted small">
        Tap a row for lap-by-lap times. Purple = fastest lap. ✕ = lap not counted for best times (e.g. suspected missed detection or
        invalidated by the operator); PIT = pit lap; START = lap 1 timed from the race start (counts for distance, not best laps).
      </p>
    </div>
  );
}

