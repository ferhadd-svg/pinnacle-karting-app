import type { Lap } from '../api';

/** Bar chart of lap times; the best valid lap is highlighted, invalid laps are hatched. */
export function LapChart({ laps }: { laps: Lap[] }) {
  if (!laps.length) return null;
  const times = laps.map((l) => l.lapTime.us);
  const validTimes = laps.filter((l) => l.valid).map((l) => l.lapTime.us);
  const best = validTimes.length ? Math.min(...validTimes) : null;
  const lo = Math.min(...times);
  const span = Math.max(Math.max(...times) - lo, 1);
  return (
    <div className="lap-chart" role="list" aria-label="Lap times">
      {laps.map((l) => (
        <div key={`${l.participantId}-${l.lapNumber}`} className="lap-bar-row" role="listitem">
          <span className="lap-bar-label">L{l.lapNumber}</span>
          <div className="lap-bar-track">
            <div
              className={`lap-bar ${l.lapTime.us === best && l.valid ? 'lap-bar-best' : ''} ${l.valid ? '' : 'lap-bar-invalid'}`}
              style={{ width: `${25 + ((l.lapTime.us - lo) / span) * 75}%` }}
            />
          </div>
          <span className="lap-bar-value">
            {l.lapTime.display}
            {!l.valid && <span className="flag-tag" title={l.invalidReason ?? ''}>{l.flags.includes('pit') ? 'PIT' : l.flags.includes('start_lap') ? 'START' : '✕'}</span>}
          </span>
        </div>
      ))}
    </div>
  );
}
