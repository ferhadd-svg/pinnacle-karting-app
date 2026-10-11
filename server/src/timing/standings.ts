import type { ComputedLap, SessionType } from './types.js';

export interface StandingInput {
  participantId: string;
  laps: readonly ComputedLap[];
  /** Total time penalties (added to race time). */
  timePenaltyUs?: number;
  /** Lap penalties (deducted from laps completed). */
  lapPenalty?: number;
  /** Disqualified participants are classified last without a position. */
  disqualified?: boolean;
}

export interface Standing {
  participantId: string;
  /** null for disqualified / no-time participants in timed sessions. */
  position: number | null;
  lapsCompleted: number;
  bestLapUs: number | null;
  bestLapNumber: number | null;
  avgLapUs: number | null;
  /** Race time from the start of the first lap to the last crossing, plus time penalties. */
  totalTimeUs: number | null;
  /** Gap to the leader in time (same lap count) — null for the leader. */
  gapUs: number | null;
  /** Laps behind the leader (races only). */
  gapLaps: number;
  hasFastestLap: boolean;
  disqualified: boolean;
}

export const RACE_TYPES: readonly SessionType[] = ['sprint', 'endurance'];

function bestValid(laps: readonly ComputedLap[]) {
  let best: ComputedLap | null = null;
  // Tie on lap time: the lap set first ranks higher.
  for (const l of laps) if (l.valid && (!best || l.durationUs < best.durationUs)) best = l;
  return best;
}

/**
 * Rank participants.
 *
 * Timed sessions (practice, rental, qualifying): best valid lap; equal lap times are separated by
 * who set the time first; participants without a valid lap are ranked after, by laps completed.
 *
 * Races (sprint, endurance): laps completed (after lap penalties) then the time of the final crossing
 * (plus time penalties). Invalid laps still count towards distance in a race — they only stop the lap
 * from being a fastest lap or record.
 */
export function computeStandings(type: SessionType, inputs: readonly StandingInput[]): Standing[] {
  const isRace = RACE_TYPES.includes(type);

  const rows = inputs.map((p) => {
    const best = bestValid(p.laps);
    const valid = p.laps.filter((l) => l.valid);
    const lapsCompleted = Math.max(0, p.laps.length - (p.lapPenalty ?? 0));
    const first = p.laps[0];
    const last = p.laps.at(-1);
    const totalTimeUs = first && last ? last.endUs - first.startUs + (p.timePenaltyUs ?? 0) : null;
    return {
      p,
      best,
      lapsCompleted,
      totalTimeUs,
      finishUs: last ? last.endUs + (p.timePenaltyUs ?? 0) : Infinity,
      avgLapUs: valid.length ? Math.round(valid.reduce((s, l) => s + l.durationUs, 0) / valid.length) : null,
    };
  });

  const cmp = (a: (typeof rows)[number], b: (typeof rows)[number]): number => {
    if (!!a.p.disqualified !== !!b.p.disqualified) return a.p.disqualified ? 1 : -1;
    if (isRace) {
      return b.lapsCompleted - a.lapsCompleted || a.finishUs - b.finishUs;
    }
    if (a.best && b.best) return a.best.durationUs - b.best.durationUs || a.best.endUs - b.best.endUs;
    if (a.best || b.best) return a.best ? -1 : 1;
    return b.lapsCompleted - a.lapsCompleted;
  };

  rows.sort((a, b) => cmp(a, b) || (a.p.participantId < b.p.participantId ? -1 : 1));

  const fastest = rows.reduce<ComputedLap | null>((m, r) => {
    if (!r.best || r.p.disqualified) return m;
    return !m || r.best.durationUs < m.durationUs || (r.best.durationUs === m.durationUs && r.best.endUs < m.endUs) ? r.best : m;
  }, null);

  const leader = rows[0];
  let position = 0;
  return rows.map((r, i) => {
    const classified = !r.p.disqualified && (isRace ? r.lapsCompleted > 0 : r.best !== null || r.lapsCompleted > 0);
    // Exact ties (identical keys) share a position.
    if (classified && (i === 0 || cmp(rows[i - 1], r) !== 0)) position = i + 1;
    let gapUs: number | null = null;
    let gapLaps = 0;
    if (i > 0 && classified) {
      if (isRace) {
        gapLaps = leader.lapsCompleted - r.lapsCompleted;
        if (gapLaps === 0) gapUs = r.finishUs - leader.finishUs;
      } else if (r.best && leader.best) {
        gapUs = r.best.durationUs - leader.best.durationUs;
      }
    }
    return {
      participantId: r.p.participantId,
      position: classified ? position : null,
      lapsCompleted: r.lapsCompleted,
      bestLapUs: r.best?.durationUs ?? null,
      bestLapNumber: r.best?.lapNumber ?? null,
      avgLapUs: r.avgLapUs,
      totalTimeUs: r.totalTimeUs,
      gapUs,
      gapLaps,
      hasFastestLap: !!fastest && r.best === fastest,
      disqualified: !!r.p.disqualified,
    };
  });
}
