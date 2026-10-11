/**
 * Types for the pure timing engine. All times are integer microseconds since the
 * Unix epoch (UTC) in the *timing device's* clock. Durations are microseconds.
 * Microsecond epochs (~1.8e15) are well inside Number.MAX_SAFE_INTEGER (~9e15).
 */

export type LoopRole = 'finish' | 'pit_in' | 'pit_out' | 'split';

export type CrossingSource = 'decoder' | 'import' | 'manual';

export interface Crossing {
  /** Stable id of the raw timing event (or manual correction) that produced this crossing. */
  eventId: string;
  timeUs: number;
  loop: LoopRole;
  source: CrossingSource;
}

export type SessionType = 'practice' | 'rental' | 'qualifying' | 'sprint' | 'endurance';

export interface LapRules {
  /** Crossings closer than this to the previous accepted crossing are duplicate reads. */
  dedupWindowUs: number;
  /** Laps shorter than this are physically impossible: the later crossing is rejected. */
  minLapUs: number;
  /** Laps longer than this are flagged as a probable missed detection (null = no absolute limit). */
  maxLapUs: number | null;
  /** Laps longer than factor × median valid lap are flagged as a probable missed detection. */
  missedLapFactor: number;
  /**
   * first_crossing: the first crossing after the start starts lap 1 (rolling/pit-lane start; rental default).
   * session_start: lap 1 is timed from the session start signal (grid start behind the line).
   */
  startMode: 'first_crossing' | 'session_start';
  /** Tolerance for residual decoder/server clock difference at the session start. */
  boundaryToleranceUs: number;
}

export interface SessionWindow {
  /** Green flag, in device clock. */
  startUs: number;
  /** Chequered flag, in device clock. null while the session is running. */
  endUs: number | null;
}

export interface Corrections {
  /** Raw/manual events an operator has excluded (e.g. a ghost read). */
  excludedEventIds: ReadonlySet<string>;
  /** Laps invalidated by an operator, keyed by the event id of the crossing that ends the lap. */
  invalidatedLaps: ReadonlyMap<string, string>;
}

/**
 * start_lap: lap 1 timed from the start signal (grid start). It counts for race distance and time
 * but is a partial lap, so it is never a fastest lap, personal best or record.
 */
export type LapFlag = 'pit' | 'suspect_missed' | 'invalidated' | 'exceeds_max' | 'start_lap';

export interface ComputedLap {
  lapNumber: number;
  /** null when lap 1 is timed from the session start signal. */
  startEventId: string | null;
  endEventId: string;
  startUs: number;
  endUs: number;
  durationUs: number;
  flags: LapFlag[];
  /** Counts towards fastest lap, personal bests and records. */
  valid: boolean;
  invalidReason?: string;
}

export type RejectReason =
  | 'excluded_by_correction'
  | 'before_session'
  | 'after_finish'
  | 'duplicate'
  | 'too_short';

export interface RejectedCrossing {
  crossing: Crossing;
  reason: RejectReason;
  /** Gap to the previously accepted crossing, when relevant. */
  gapUs?: number;
}

export interface ParticipantLaps {
  laps: ComputedLap[];
  rejected: RejectedCrossing[];
  /** Accepted finish-line crossings, in order. */
  accepted: Crossing[];
  /** True once the participant has crossed the line after the chequered flag. */
  tookChequer: boolean;
}

export const DEFAULT_RULES: LapRules = {
  dedupWindowUs: 2_000_000,
  minLapUs: 15_000_000,
  maxLapUs: null,
  missedLapFactor: 1.8,
  startMode: 'first_crossing',
  boundaryToleranceUs: 2_000_000,
};
