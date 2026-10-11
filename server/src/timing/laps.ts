import type {
  ComputedLap,
  Corrections,
  Crossing,
  LapFlag,
  LapRules,
  ParticipantLaps,
  RejectedCrossing,
  SessionWindow,
} from './types.js';

const NO_CORRECTIONS: Corrections = { excludedEventIds: new Set(), invalidatedLaps: new Map() };

/** Deterministic order: time, then event id, so out-of-order delivery never changes the result. */
export function sortCrossings(crossings: readonly Crossing[]): Crossing[] {
  return [...crossings].sort((a, b) => a.timeUs - b.timeUs || (a.eventId < b.eventId ? -1 : a.eventId > b.eventId ? 1 : 0));
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Turn one participant's crossings into laps.
 *
 * This is a pure function of (crossings, session window, rules, corrections): laps are always
 * derived from the preserved raw events, never edited in place. Re-running it after late events,
 * reconnections or operator corrections is safe and gives the same answer for the same inputs.
 *
 * Every crossing passed in must already belong to this participant (same transponder, same session).
 */
export function computeParticipantLaps(
  crossings: readonly Crossing[],
  window: SessionWindow,
  rules: LapRules,
  corrections: Corrections = NO_CORRECTIONS,
): ParticipantLaps {
  const sorted = sortCrossings(crossings);
  const rejected: RejectedCrossing[] = [];
  const accepted: Crossing[] = [];
  const pitIns: number[] = [];
  let tookChequer = false;

  const earliest = window.startUs - rules.boundaryToleranceUs;
  const chequer = window.endUs;

  for (const c of sorted) {
    if (corrections.excludedEventIds.has(c.eventId)) {
      rejected.push({ crossing: c, reason: 'excluded_by_correction' });
      continue;
    }
    if (c.timeUs < earliest) {
      rejected.push({ crossing: c, reason: 'before_session' });
      continue;
    }
    if (c.loop === 'pit_in') {
      if (!tookChequer) pitIns.push(c.timeUs);
      continue;
    }
    if (c.loop !== 'finish') continue; // pit_out / split loops don't define laps

    if (tookChequer) {
      rejected.push({ crossing: c, reason: 'after_finish' });
      continue;
    }

    const prev = accepted.at(-1);
    if (prev) {
      const gapUs = c.timeUs - prev.timeUs;
      if (gapUs < rules.dedupWindowUs) {
        rejected.push({ crossing: c, reason: 'duplicate', gapUs });
        continue;
      }
      if (gapUs < rules.minLapUs) {
        rejected.push({ crossing: c, reason: 'too_short', gapUs });
        continue;
      }
    }

    accepted.push(c);
    // The first line crossing after the chequered flag completes the participant's final lap.
    if (chequer !== null && c.timeUs >= chequer) tookChequer = true;
  }

  const laps: ComputedLap[] = [];
  let prevTime: number | null = null;
  let prevId: string | null = null;
  if (rules.startMode === 'session_start') prevTime = window.startUs;

  for (const c of accepted) {
    if (prevTime === null) {
      // first_crossing mode: the first crossing only starts the clock
      prevTime = c.timeUs;
      prevId = c.eventId;
      continue;
    }
    const startUs: number = prevTime;
    const flags: LapFlag[] = [];
    if (prevId === null) flags.push('start_lap');
    if (pitIns.some((t) => t > startUs && t <= c.timeUs)) flags.push('pit');
    if (rules.maxLapUs !== null && c.timeUs - startUs > rules.maxLapUs) flags.push('exceeds_max');
    const invalidatedReason = corrections.invalidatedLaps.get(c.eventId);
    if (invalidatedReason !== undefined) flags.push('invalidated');

    laps.push({
      lapNumber: laps.length + 1,
      startEventId: prevId,
      endEventId: c.eventId,
      startUs,
      endUs: c.timeUs,
      durationUs: c.timeUs - startUs,
      flags,
      valid: true,
      invalidReason: invalidatedReason,
    });
    prevTime = c.timeUs;
    prevId = c.eventId;
  }

  // Probable missed detection: much longer than this driver's typical lap. Needs a few clean laps first.
  const reference = laps.filter((l) => l.flags.length === 0).map((l) => l.durationUs);
  if (reference.length >= 3) {
    const limit = median(reference) * rules.missedLapFactor;
    for (const l of laps) if (!l.flags.includes('pit') && l.durationUs > limit) l.flags.push('suspect_missed');
  }

  for (const l of laps) {
    l.valid = l.flags.length === 0;
    if (!l.valid && !l.invalidReason) l.invalidReason = l.flags.join(',');
  }

  return { laps, rejected, accepted, tookChequer };
}

export interface Stint {
  driverId: string;
  /** Inclusive start, device clock. */
  startUs: number;
  /** Exclusive end; null while the stint is ongoing. */
  endUs: number | null;
}

/**
 * Attribute laps to drivers for multi-driver entries (endurance). A lap belongs to the driver whose
 * stint contains the moment the lap ended. A transponder only identifies the kart, never the driver,
 * so stints must come from the pit-lane operator (or another authorised driver-identification source).
 */
export function attributeDrivers(
  laps: readonly ComputedLap[],
  stints: readonly Stint[],
  fallbackDriverId: string | null,
): (string | null)[] {
  const sorted = [...stints].sort((a, b) => a.startUs - b.startUs);
  return laps.map((lap) => {
    const s = sorted.findLast((st) => st.startUs <= lap.endUs && (st.endUs === null || lap.endUs < st.endUs));
    return s?.driverId ?? fallbackDriverId;
  });
}
