import { formatLap } from '../data';

export function LapChart({ laps }: { laps: number[] }) {
  const best = Math.min(...laps);
  const worst = Math.max(...laps);
  const span = Math.max(worst - best, 1);
  return (
    <div className="lap-chart" role="list">
      {laps.map((l, i) => (
        <div key={i} className="lap-bar-row" role="listitem">
          <span className="lap-bar-label">L{i + 1}</span>
          <div className="lap-bar-track">
            <div
              className={`lap-bar ${l === best ? 'lap-bar-best' : ''}`}
              style={{ width: `${30 + ((l - best) / span) * 70}%` }}
            />
          </div>
          <span className="lap-bar-value">{formatLap(l)}</span>
        </div>
      ))}
    </div>
  );
}
