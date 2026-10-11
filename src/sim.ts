import { RIVALS, seeded, type Track } from './data';

export interface SimDriver {
  id: string;
  name: string;
  kart: number;
  laps: number[];
  /** cumulative[i] = race time at which lap i+1 finished */
  cumulative: number[];
  isYou?: boolean;
}

export interface Standing {
  driver: SimDriver;
  position: number;
  lapsDone: number;
  progress: number;
  lastLap: number | null;
  bestLap: number | null;
  gapMs: number | null;
  finished: boolean;
}

export interface Race {
  track: Track;
  totalLaps: number;
  drivers: SimDriver[];
  durationMs: number;
}

export function createRace(track: Track, yourName: string, yourPaceMs: number, totalLaps: number, seed = Date.now()): Race {
  const rand = seeded(seed);
  const scale = track.recordMs / 38_412;
  const rivals = [...RIVALS].sort(() => rand() - 0.5).slice(0, 7);
  const field = [
    { id: 'you', name: yourName, paceMs: yourPaceMs, isYou: true },
    ...rivals.map((r) => ({ ...r, paceMs: r.paceMs * scale, isYou: false })),
  ];
  const karts = [...Array(20)].map((_, i) => i + 1).sort(() => rand() - 0.5);

  const drivers: SimDriver[] = field.map((d, i) => {
    const laps: number[] = [];
    for (let lap = 0; lap < totalLaps; lap++) {
      // first lap is slower (standing start), then drivers warm up and get consistent
      const startPenalty = lap === 0 ? 1.12 : 1;
      const warmup = Math.max(0, 0.025 - lap * 0.006);
      const noise = (rand() - 0.35) * 0.04;
      laps.push(Math.max(track.recordMs, Math.round(d.paceMs * startPenalty * (1 + warmup + noise))));
    }
    const cumulative = laps.reduce<number[]>((acc, l) => [...acc, (acc.at(-1) ?? 0) + l], []);
    return { id: d.id, name: d.name, kart: karts[i], laps, cumulative, isYou: d.isYou };
  });

  return { track, totalLaps, drivers, durationMs: Math.max(...drivers.map((d) => d.cumulative.at(-1)!)) };
}

export function standingsAt(race: Race, t: number): Standing[] {
  const rows = race.drivers.map((driver) => {
    const lapsDone = driver.cumulative.filter((c) => c <= t).length;
    const finished = lapsDone >= race.totalLaps;
    const lapStart = lapsDone === 0 ? 0 : driver.cumulative[lapsDone - 1];
    const progress = finished ? 0 : (t - lapStart) / driver.laps[lapsDone];
    const done = driver.laps.slice(0, lapsDone);
    return {
      driver,
      lapsDone,
      progress,
      finished,
      lastLap: done.at(-1) ?? null,
      bestLap: done.length ? Math.min(...done) : null,
    };
  });

  // Like transponder timing: order by laps completed, then by who crossed the line first.
  rows.sort((a, b) => {
    if (a.lapsDone !== b.lapsDone) return b.lapsDone - a.lapsDone;
    if (a.lapsDone === 0) return b.progress - a.progress;
    return a.driver.cumulative[a.lapsDone - 1] - b.driver.cumulative[b.lapsDone - 1];
  });

  const leader = rows[0];
  return rows.map((r, i) => {
    let gapMs: number | null = null;
    if (i > 0 && r.lapsDone > 0) {
      // gap = time between leader and this driver crossing the same lap line
      const lapIdx = Math.min(r.lapsDone, leader.lapsDone) - 1;
      gapMs = r.driver.cumulative[lapIdx] - leader.driver.cumulative[lapIdx];
    }
    return { ...r, position: i + 1, gapMs };
  });
}
