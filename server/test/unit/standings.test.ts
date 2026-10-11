import { describe, expect, it } from 'vitest';
import { computeStandings } from '../../src/timing/standings.js';
import type { ComputedLap } from '../../src/timing/types.js';

/** Build laps from durations in seconds; a negative value means an invalid lap. */
function laps(startSec: number, secs: number[]): ComputedLap[] {
  let t = startSec * 1e6;
  return secs.map((s, i) => {
    const d = Math.abs(s) * 1e6;
    const lap: ComputedLap = {
      lapNumber: i + 1,
      startEventId: null,
      endEventId: `e${i}`,
      startUs: t,
      endUs: t + d,
      durationUs: d,
      flags: s < 0 ? ['invalidated'] : [],
      valid: s >= 0,
    };
    t += d;
    return lap;
  });
}

describe('computeStandings — timed sessions', () => {
  it('ranks by best valid lap and ignores invalid laps', () => {
    const s = computeStandings('rental', [
      { participantId: 'a', laps: laps(0, [62, 61]) },
      { participantId: 'b', laps: laps(0, [-55, 60.5]) },
      { participantId: 'c', laps: laps(0, [63]) },
    ]);
    expect(s.map((r) => [r.participantId, r.position, r.bestLapUs])).toEqual([
      ['b', 1, 60_500_000],
      ['a', 2, 61_000_000],
      ['c', 3, 63_000_000],
    ]);
    expect(s[0].hasFastestLap).toBe(true);
    expect(s[1].gapUs).toBe(500_000);
  });

  it('breaks lap-time ties by who set the time first', () => {
    const s = computeStandings('qualifying', [
      { participantId: 'late', laps: laps(10, [61, 60]) },
      { participantId: 'early', laps: laps(0, [60]) },
    ]);
    expect(s.map((r) => r.participantId)).toEqual(['early', 'late']);
    expect(s.map((r) => r.position)).toEqual([1, 2]);
  });

  it('places drivers without a valid lap after those with one, and disqualified last', () => {
    const s = computeStandings('practice', [
      { participantId: 'dq', laps: laps(0, [50]), disqualified: true },
      { participantId: 'none', laps: laps(0, [-60, -61]) },
      { participantId: 'ok', laps: laps(0, [65]) },
    ]);
    expect(s.map((r) => [r.participantId, r.position])).toEqual([
      ['ok', 1],
      ['none', 2],
      ['dq', null],
    ]);
  });
});

describe('computeStandings — races', () => {
  it('ranks by laps completed, then by finish time, with lap gaps', () => {
    const s = computeStandings('sprint', [
      { participantId: 'slow', laps: laps(0, [62, 62, 62]) },
      { participantId: 'fast', laps: laps(0, [60, 60, 60]) },
      { participantId: 'lapped', laps: laps(0, [70, 70]) },
    ]);
    expect(s.map((r) => [r.participantId, r.position, r.gapUs, r.gapLaps])).toEqual([
      ['fast', 1, null, 0],
      ['slow', 2, 6_000_000, 0],
      ['lapped', 3, null, 1],
    ]);
  });

  it('counts invalid laps for distance and applies penalties', () => {
    const s = computeStandings('endurance', [
      { participantId: 'a', laps: laps(0, [60, -59, 60]), timePenaltyUs: 5_000_000 },
      { participantId: 'b', laps: laps(0, [61, 61, 61]) },
      { participantId: 'c', laps: laps(0, [55, 55, 55, 55]), lapPenalty: 2 },
    ]);
    expect(s.map((r) => r.participantId)).toEqual(['b', 'a', 'c']);
    expect(s[1].lapsCompleted).toBe(3);
    expect(s[2].lapsCompleted).toBe(2);
  });
});
