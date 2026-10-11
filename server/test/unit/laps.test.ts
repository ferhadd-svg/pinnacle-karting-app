import { describe, expect, it } from 'vitest';
import { attributeDrivers, computeParticipantLaps } from '../../src/timing/laps.js';
import { DEFAULT_RULES, type Crossing, type LapRules } from '../../src/timing/types.js';
import { formatLapUs, parseTimestampUs } from '../../src/timing/time.js';

const KL = { timeZone: 'Asia/Kuala_Lumpur', date: '2026-10-11' };
const t = (clock: string) => parseTimestampUs(clock, KL);
let n = 0;
const x = (clock: string, loop: Crossing['loop'] = 'finish', id?: string): Crossing => ({
  eventId: id ?? `e${String(++n).padStart(4, '0')}`,
  timeUs: t(clock),
  loop,
  source: 'decoder',
});
const window = { startUs: t('14:29:00.000'), endUs: null };
const rules: LapRules = { ...DEFAULT_RULES };
const durations = (r: ReturnType<typeof computeParticipantLaps>) => r.laps.map((l) => formatLapUs(l.durationUs));

describe('computeParticipantLaps', () => {
  it('calculates the brief example: Kart 07 → 61.200 then 60.900', () => {
    const r = computeParticipantLaps([x('14:30:00.000'), x('14:31:01.200'), x('14:32:02.100')], window, rules);
    expect(durations(r)).toEqual(['1:01.200', '1:00.900']);
    expect(r.laps.map((l) => l.durationUs)).toEqual([61_200_000, 60_900_000]);
    expect(r.laps.every((l) => l.valid)).toBe(true);
  });

  it('is independent of delivery order (out-of-order and late events)', () => {
    const a = [x('14:30:00.000'), x('14:31:01.200'), x('14:32:02.100'), x('14:33:03.000')];
    const shuffled = [a[2], a[0], a[3], a[1]];
    expect(computeParticipantLaps(shuffled, window, rules).laps).toEqual(computeParticipantLaps(a, window, rules).laps);
  });

  it('collapses duplicate reads of one crossing', () => {
    const r = computeParticipantLaps(
      [x('14:30:00.000'), x('14:30:00.040'), x('14:31:01.200'), x('14:31:01.205'), x('14:32:02.100')],
      window,
      rules,
    );
    expect(durations(r)).toEqual(['1:01.200', '1:00.900']);
    expect(r.rejected.map((j) => j.reason)).toEqual(['duplicate', 'duplicate']);
  });

  it('rejects implausibly short laps as ghost reads and keeps timing from the previous crossing', () => {
    const r = computeParticipantLaps([x('14:30:00.000'), x('14:30:09.000'), x('14:31:01.200')], window, rules);
    expect(durations(r)).toEqual(['1:01.200']);
    expect(r.rejected[0]).toMatchObject({ reason: 'too_short', gapUs: 9_000_000 });
  });

  it('flags a probable missed detection (lap ≈ two laps long) and excludes it from valid laps', () => {
    const r = computeParticipantLaps(
      [x('14:30:00.000'), x('14:31:00.000'), x('14:32:00.500'), x('14:34:01.000'), x('14:35:01.000'), x('14:36:01.200')],
      window,
      rules,
    );
    const missed = r.laps.find((l) => l.flags.includes('suspect_missed'))!;
    expect(missed.lapNumber).toBe(3);
    expect(missed.valid).toBe(false);
    expect(r.laps.filter((l) => l.valid)).toHaveLength(4);
  });

  it('flags laps over an absolute maximum', () => {
    const r = computeParticipantLaps([x('14:30:00.000'), x('14:33:00.000')], window, { ...rules, maxLapUs: 120_000_000 });
    expect(r.laps[0].flags).toContain('exceeds_max');
    expect(r.laps[0].valid).toBe(false);
  });

  it('marks laps containing a pit-in loop crossing as pit laps', () => {
    const r = computeParticipantLaps(
      [x('14:30:00.000'), x('14:31:01.200'), x('14:31:40.000', 'pit_in'), x('14:32:30.000', 'pit_out'), x('14:33:05.000')],
      window,
      rules,
    );
    expect(r.laps.map((l) => l.flags)).toEqual([[], ['pit']]);
  });

  it('ignores crossings before the session start (with tolerance)', () => {
    const r = computeParticipantLaps(
      [x('14:28:00.000'), x('14:28:59.000'), x('14:30:00.000'), x('14:31:00.000')],
      window,
      rules,
    );
    expect(r.rejected.map((j) => j.reason)).toEqual(['before_session']);
    // 14:28:59 is inside the 2 s tolerance so it starts lap 1
    expect(durations(r)).toEqual(['1:01.000', '1:00.000']);
  });

  it('ends each kart on its first crossing after the chequered flag', () => {
    const w = { startUs: t('14:29:00.000'), endUs: t('14:32:30.000') };
    const r = computeParticipantLaps(
      [x('14:30:00.000'), x('14:31:00.000'), x('14:32:00.000'), x('14:33:00.000'), x('14:34:00.000')],
      w,
      rules,
    );
    expect(r.laps).toHaveLength(3);
    expect(r.tookChequer).toBe(true);
    expect(r.rejected.map((j) => j.reason)).toEqual(['after_finish']);
  });

  it('times lap 1 from the start signal in session_start mode (grid start)', () => {
    const r = computeParticipantLaps([x('14:30:05.000'), x('14:31:05.000')], { startUs: t('14:29:00.000'), endUs: null }, {
      ...rules,
      startMode: 'session_start',
    });
    expect(durations(r)).toEqual(['1:05.000', '1:00.000']);
    expect(r.laps[0].startEventId).toBeNull();
    // A partial lap from the grid never counts as a best lap or record.
    expect(r.laps[0]).toMatchObject({ flags: ['start_lap'], valid: false });
    expect(r.laps[1].valid).toBe(true);
  });

  it('applies operator corrections without touching the inputs', () => {
    const crossings = [x('14:30:00.000', 'finish', 'a'), x('14:31:00.000', 'finish', 'b'), x('14:31:20.000', 'finish', 'ghost'), x('14:32:00.000', 'finish', 'c')];
    const frozen = JSON.stringify(crossings);
    const r = computeParticipantLaps(crossings, window, { ...rules, minLapUs: 10_000_000 }, {
      excludedEventIds: new Set(['ghost']),
      invalidatedLaps: new Map([['c', 'Track limits']]),
    });
    expect(durations(r)).toEqual(['1:00.000', '1:00.000']);
    expect(r.laps[1]).toMatchObject({ valid: false, invalidReason: 'Track limits', flags: ['invalidated'] });
    expect(JSON.stringify(crossings)).toBe(frozen);
  });

  it('recovers when a manual crossing fills a missed detection', () => {
    const base = [x('14:30:00.000', 'finish', 'a'), x('14:32:01.000', 'finish', 'b')];
    const manual: Crossing = { eventId: 'm1', timeUs: t('14:31:00.400'), loop: 'finish', source: 'manual' };
    expect(durations(computeParticipantLaps([...base, manual], window, rules))).toEqual(['1:00.400', '1:00.600']);
  });

  it('handles an empty or single-crossing participant', () => {
    expect(computeParticipantLaps([], window, rules).laps).toEqual([]);
    expect(computeParticipantLaps([x('14:30:00.000')], window, rules).laps).toEqual([]);
  });
});

describe('attributeDrivers', () => {
  it('assigns endurance laps to the driver whose stint contains the lap end', () => {
    const r = computeParticipantLaps(
      [x('14:30:00.000'), x('14:31:00.000'), x('14:32:00.000'), x('14:33:00.000'), x('14:34:00.000')],
      window,
      rules,
    );
    const drivers = attributeDrivers(
      r.laps,
      [
        { driverId: 'ana', startUs: t('14:29:00.000'), endUs: t('14:31:30.000') },
        { driverId: 'ben', startUs: t('14:31:30.000'), endUs: null },
      ],
      null,
    );
    expect(drivers).toEqual(['ana', 'ben', 'ben', 'ben']);
  });
});
