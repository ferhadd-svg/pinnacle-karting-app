import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { LapChart } from '../components/LapChart';
import { TrackMap } from '../components/TrackMap';
import { TRACKS, dayKey, formatGap, formatLap } from '../data';
import { createRace, standingsAt, type Race } from '../sim';
import { bestLap, useStore } from '../store';

const SPEEDS = [1, 5, 20];
const LAPS = 10;

export function Live() {
  const { profile, races, addRace } = useStore();
  const [trackId, setTrackId] = useState(TRACKS[0].id);
  const [race, setRace] = useState<Race | null>(null);
  const [t, setT] = useState(0);
  const [speed, setSpeed] = useState(5);
  const [running, setRunning] = useState(false);
  const saved = useRef(false);

  const track = TRACKS.find((x) => x.id === trackId)!;

  const start = () => {
    // Your pace improves a little with experience on this track.
    const best = bestLap(races, trackId);
    const pace = best ? best * 1.015 : track.recordMs * 1.09;
    setRace(createRace(track, profile?.name ?? 'You', pace, LAPS));
    setT(0);
    saved.current = false;
    setRunning(true);
  };

  useEffect(() => {
    if (!running || !race) return;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = now - last;
      last = now;
      setT((prev) => Math.min(race.durationMs, prev + dt * speed));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [running, race, speed]);

  const standings = useMemo(() => (race ? standingsAt(race, t) : []), [race, t]);
  const finished = !!race && t >= race.durationMs;
  const you = standings.find((s) => s.driver.isYou);
  const fastest = standings.reduce<number | null>(
    (m, s) => (s.bestLap !== null && (m === null || s.bestLap < m) ? s.bestLap : m),
    null,
  );

  useEffect(() => {
    if (finished && race && you && !saved.current) {
      saved.current = true;
      setRunning(false);
      addRace({ trackId: race.track.id, date: dayKey(new Date()), position: you.position, field: race.drivers.length, laps: you.driver.laps });
    }
  }, [finished, race, you, addRace]);

  const leaderLaps = standings[0]?.lapsDone ?? 0;

  return (
    <div className="page">
      <div className="live-head">
        <div>
          <p className="eyebrow">{race ? (finished ? 'Chequered flag' : running ? '● Live' : 'Paused') : 'Live timing'}</p>
          <h1>{track.name}</h1>
        </div>
        {race && (
          <div className="lap-counter">
            Lap <strong>{Math.min(leaderLaps + 1, LAPS)}</strong>/{LAPS}
          </div>
        )}
      </div>

      {!race && (
        <div className="card">
          <p>
            Watch a {LAPS}-lap Grand Prix with live positions, lap times and gaps. You're on the grid in kart{' '}
            <span className="you-dot" /> — your result is saved to your profile.
          </p>
          <div className="chips">
            {TRACKS.map((x) => (
              <button key={x.id} className={`chip ${x.id === trackId ? 'active' : ''}`} onClick={() => setTrackId(x.id)}>
                {x.name}
              </button>
            ))}
          </div>
          <button className="btn btn-primary" onClick={start}>
            Lights out — start race
          </button>
        </div>
      )}

      {race && (
        <>
          <div className="controls">
            {!finished && (
              <button className="btn" onClick={() => setRunning(!running)}>
                {running ? 'Pause' : 'Resume'}
              </button>
            )}
            <div className="chips">
              {SPEEDS.map((s) => (
                <button key={s} className={`chip ${s === speed ? 'active' : ''}`} onClick={() => setSpeed(s)}>
                  {s}×
                </button>
              ))}
            </div>
            <button className="btn" onClick={() => setRace(null)}>
              New race
            </button>
          </div>

          <div className="live-grid">
            <div className="card map-card">
              <TrackMap standings={standings} />
            </div>
            <div className="card table-card">
              <table className="timing">
                <thead>
                  <tr>
                    <th>P</th>
                    <th>Driver</th>
                    <th className="num">Last</th>
                    <th className="num">Best</th>
                    <th className="num">Gap</th>
                  </tr>
                </thead>
                <tbody>
                  {standings.map((s) => (
                    <tr key={s.driver.id} className={s.driver.isYou ? 'row-you' : ''}>
                      <td className="pos">{s.position}</td>
                      <td>
                        <span className="kart-badge">#{s.driver.kart}</span> {s.driver.name}
                        {s.finished && <span className="flag"> 🏁</span>}
                      </td>
                      <td className="num">{s.lastLap ? formatLap(s.lastLap) : '—'}</td>
                      <td className={`num ${s.bestLap !== null && s.bestLap === fastest ? 'purple' : ''}`}>
                        {s.bestLap ? formatLap(s.bestLap) : '—'}
                      </td>
                      <td className="num">{s.position === 1 ? 'Leader' : s.gapMs !== null ? formatGap(s.gapMs) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {finished && you && (
            <div className="card highlight">
              <p className="eyebrow">Your result</p>
              <h2>
                P{you.position} of {race.drivers.length} · best {formatLap(you.bestLap!)}
              </h2>
              <LapChart laps={you.driver.laps} />
              <div className="hero-actions">
                <button className="btn btn-primary" onClick={start}>
                  Race again
                </button>
                <Link to="/leaderboard" className="btn">
                  Leaderboard
                </Link>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
