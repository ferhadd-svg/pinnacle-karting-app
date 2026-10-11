import type { Tx } from '../db.js';
import { HttpError } from '../db.js';
import { attributeDrivers, computeParticipantLaps, type Stint } from '../timing/laps.js';
import { computeStandings, type StandingInput } from '../timing/standings.js';
import {
  DEFAULT_RULES,
  type ComputedLap,
  type Corrections,
  type Crossing,
  type LapRules,
  type LoopRole,
  type RejectedCrossing,
  type SessionType,
} from '../timing/types.js';

/** Extra time after the chequered flag in which crossings may still complete a final lap. */
const POST_CHEQUER_WINDOW_US = 10 * 60 * 1_000_000;

export interface SessionRow {
  id: string;
  track_id: string;
  type: SessionType;
  status: 'scheduled' | 'running' | 'finished' | 'final' | 'cancelled';
  started_us: number | null;
  ended_us: number | null;
  clock_offset_us: number;
  rules: Partial<LapRules>;
}

export const SESSION_COLUMNS = `
  s.id, s.track_id, s.type, s.status, s.clock_offset_us, s.rules,
  (extract(epoch FROM s.started_at) * 1000000)::bigint AS started_us,
  (extract(epoch FROM s.ended_at) * 1000000)::bigint AS ended_us`;

export const rulesFor = (s: Pick<SessionRow, 'rules'>): LapRules => ({ ...DEFAULT_RULES, ...s.rules });

interface ParticipantKart {
  participant_id: string;
  kart_id: string;
  transponder_code: string;
  from_us: number;
  to_us: number | null;
}

export interface ParticipantComputation {
  participantId: string;
  driverId: string | null;
  laps: (ComputedLap & { driverId: string | null; kartId: string | null })[];
  rejected: RejectedCrossing[];
}

export interface SessionComputation {
  session: SessionRow;
  participants: ParticipantComputation[];
  standings: ReturnType<typeof computeStandings>;
  /** Raw events in the session window on this track whose transponder isn't assigned to any participant. */
  unmatched: { id: number; transponder_code: string; loop_code: string; detected_us: number }[];
  unknownLoops: string[];
}

/**
 * Compute laps and standings for a session from raw events + corrections. Read-only; used both by
 * recalculation (which persists the result) and by the anomaly report (which doesn't).
 */
export async function computeSession(tx: Tx, session: SessionRow): Promise<SessionComputation> {
  if (session.started_us === null) throw new HttpError(409, 'Session has not started', 'not_started');
  const rules = rulesFor(session);
  // Session boundaries were recorded on the server clock; convert to the timing device clock.
  const startUs = session.started_us + Number(session.clock_offset_us);
  const endUs = session.ended_us === null ? null : session.ended_us + Number(session.clock_offset_us);
  const fromUs = startUs - rules.boundaryToleranceUs;
  const toUs = endUs === null ? Number.MAX_SAFE_INTEGER : endUs + POST_CHEQUER_WINDOW_US;

  const participants = (
    await tx.query(`SELECT id, driver_id FROM session_participants WHERE session_id = $1 ORDER BY created_at, id`, [session.id])
  ).rows as { id: string; driver_id: string | null }[];

  const pks = (
    await tx.query(
      `SELECT pk.participant_id, pk.kart_id, t.code AS transponder_code,
              (extract(epoch FROM lower(pk.active_during)) * 1000000)::bigint + $2::bigint AS from_us,
              CASE WHEN upper_inf(pk.active_during) THEN NULL
                   ELSE (extract(epoch FROM upper(pk.active_during)) * 1000000)::bigint + $2::bigint END AS to_us
         FROM participant_karts pk
         JOIN session_participants p ON p.id = pk.participant_id
         JOIN transponders t ON t.id = pk.transponder_id
        WHERE p.session_id = $1 AND pk.active_during IS NOT NULL`,
      [session.id, session.clock_offset_us],
    )
  ).rows as ParticipantKart[];

  const loops = new Map<string, LoopRole>(
    (await tx.query(`SELECT code, role FROM timing_loops WHERE track_id = $1`, [session.track_id])).rows.map((r) => [r.code, r.role]),
  );

  const events = (
    await tx.query(
      `SELECT e.id, e.transponder_code, e.loop_code, e.detected_us
         FROM raw_timing_events e
         JOIN timing_devices d ON d.id = e.device_id
        WHERE d.track_id = $1 AND e.detected_us BETWEEN $2 AND $3
        ORDER BY e.detected_us, e.id`,
      [session.track_id, fromUs, toUs],
    )
  ).rows as { id: number; transponder_code: string; loop_code: string; detected_us: number }[];

  const corrections = (
    await tx.query(`SELECT * FROM timing_corrections WHERE session_id = $1 AND revoked_at IS NULL ORDER BY created_at`, [session.id])
  ).rows;

  const stints = (
    await tx.query(
      `SELECT st.participant_id, st.driver_id,
              (extract(epoch FROM st.started_at) * 1000000)::bigint + $2::bigint AS start_us,
              (extract(epoch FROM st.ended_at) * 1000000)::bigint + $2::bigint AS end_us
         FROM stints st JOIN session_participants p ON p.id = st.participant_id
        WHERE p.session_id = $1`,
      [session.id, session.clock_offset_us],
    )
  ).rows as { participant_id: string; driver_id: string; start_us: number; end_us: number | null }[];

  const excluded = new Set<string>(corrections.filter((c) => c.kind === 'exclude_event').map((c) => c.target_ref));
  const invalidated = new Map<string, string>(corrections.filter((c) => c.kind === 'invalidate_lap').map((c) => [c.target_ref, c.reason]));
  const fix: Corrections = { excludedEventIds: excluded, invalidatedLaps: invalidated };

  const unknownLoops = new Set<string>();
  const roleOf = (code: string): LoopRole | null => {
    const role = loops.get(code) ?? (loops.size === 0 ? 'finish' : null);
    if (!role) unknownLoops.add(code);
    return role;
  };

  const matched = new Set<number>();
  const results: ParticipantComputation[] = participants.map((p) => {
    const myKarts = pks.filter((k) => k.participant_id === p.id);
    const crossings: Crossing[] = [];
    const kartAt = (us: number) => myKarts.find((k) => us >= k.from_us - rules.boundaryToleranceUs && (k.to_us === null || us < k.to_us))?.kart_id ?? null;

    for (const e of events) {
      const k = myKarts.find(
        (k) =>
          k.transponder_code === e.transponder_code &&
          e.detected_us >= k.from_us - rules.boundaryToleranceUs &&
          (k.to_us === null || e.detected_us < k.to_us),
      );
      if (!k) continue;
      matched.add(e.id);
      const loop = roleOf(e.loop_code);
      if (loop) crossings.push({ eventId: `r:${e.id}`, timeUs: e.detected_us, loop, source: 'decoder' });
    }
    for (const c of corrections) {
      if (c.kind === 'add_crossing' && c.participant_id === p.id) {
        crossings.push({ eventId: `m:${c.id}`, timeUs: Number(c.crossing_us), loop: c.crossing_loop ?? 'finish', source: 'manual' });
      }
    }

    const { laps, rejected } = computeParticipantLaps(crossings, { startUs, endUs }, rules, fix);
    const myStints: Stint[] = stints
      .filter((s) => s.participant_id === p.id)
      .map((s) => ({ driverId: s.driver_id, startUs: s.start_us, endUs: s.end_us }));
    const drivers = attributeDrivers(laps, myStints, p.driver_id);
    return {
      participantId: p.id,
      driverId: p.driver_id,
      laps: laps.map((l, i) => ({ ...l, driverId: drivers[i], kartId: kartAt(l.endUs) })),
      rejected,
    };
  });

  const penalties = (pid: string) => {
    const mine = corrections.filter((c) => c.participant_id === pid);
    return {
      timePenaltyUs: mine.filter((c) => c.kind === 'time_penalty').reduce((s, c) => s + Number(c.value_us ?? 0), 0),
      lapPenalty: mine.filter((c) => c.kind === 'lap_penalty').reduce((s, c) => s + (c.value_int ?? 0), 0),
      disqualified: mine.some((c) => c.kind === 'disqualify'),
    };
  };
  const inputs: StandingInput[] = results.map((r) => ({ participantId: r.participantId, laps: r.laps, ...penalties(r.participantId) }));
  const standings = computeStandings(session.type, inputs);

  const assignedCodes = new Set(pks.map((k) => k.transponder_code));
  const unmatched = events.filter(
    (e) => !matched.has(e.id) && (endUs === null || e.detected_us <= endUs) && !assignedCodes.has(e.transponder_code),
  );

  return { session, participants: results, standings, unmatched, unknownLoops: [...unknownLoops] };
}

export async function lockSession(tx: Tx, sessionId: string): Promise<SessionRow> {
  const r = await tx.query(`SELECT ${SESSION_COLUMNS} FROM sessions s WHERE s.id = $1 FOR UPDATE`, [sessionId]);
  if (!r.rowCount) throw new HttpError(404, 'Session not found', 'not_found');
  return r.rows[0];
}

/**
 * Rebuild the session's derived laps and results. Idempotent; serialised per session by the row lock.
 * Final sessions are frozen unless `force` (used when finalising and after an audited reopen).
 */
export async function recomputeSession(tx: Tx, sessionId: string, opts: { force?: boolean } = {}) {
  const session = await lockSession(tx, sessionId);
  if (session.status === 'scheduled' || session.status === 'cancelled') return null;
  if (session.status === 'final' && !opts.force) return null;

  const c = await computeSession(tx, session);

  await tx.query('DELETE FROM laps WHERE session_id = $1', [sessionId]);
  await tx.query('DELETE FROM session_results WHERE session_id = $1', [sessionId]);

  const lapRows = c.participants.flatMap((p) =>
    p.laps.map((l) => ({
      participant_id: p.participantId,
      driver_id: l.driverId,
      kart_id: l.kartId,
      lap_number: l.lapNumber,
      start_ref: l.startEventId,
      end_ref: l.endEventId,
      started_us: l.startUs,
      ended_us: l.endUs,
      duration_us: l.durationUs,
      flags: l.flags,
      valid: l.valid,
      invalid_reason: l.invalidReason ?? null,
    })),
  );
  await tx.query(
    `INSERT INTO laps (session_id, participant_id, driver_id, kart_id, lap_number, start_ref, end_ref,
                       started_us, ended_us, duration_us, flags, valid, invalid_reason)
     SELECT $1, x.* FROM jsonb_to_recordset($2::jsonb) AS x(
       participant_id uuid, driver_id uuid, kart_id uuid, lap_number int, start_ref text, end_ref text,
       started_us bigint, ended_us bigint, duration_us bigint, flags text[], valid boolean, invalid_reason text)`,
    [sessionId, JSON.stringify(lapRows)],
  );

  const resultRows = c.standings.map((r) => ({
    participant_id: r.participantId,
    position: r.position,
    laps_completed: r.lapsCompleted,
    best_lap_us: r.bestLapUs,
    best_lap_number: r.bestLapNumber,
    avg_lap_us: r.avgLapUs,
    total_time_us: r.totalTimeUs,
    gap_us: r.gapUs,
    gap_laps: r.gapLaps,
    has_fastest_lap: r.hasFastestLap,
    disqualified: r.disqualified,
  }));
  await tx.query(
    `INSERT INTO session_results (session_id, participant_id, position, laps_completed, best_lap_us, best_lap_number,
                                  avg_lap_us, total_time_us, gap_us, gap_laps, has_fastest_lap, disqualified)
     SELECT $1, x.* FROM jsonb_to_recordset($2::jsonb) AS x(
       participant_id uuid, position int, laps_completed int, best_lap_us bigint, best_lap_number int, avg_lap_us bigint,
       total_time_us bigint, gap_us bigint, gap_laps int, has_fastest_lap boolean, disqualified boolean)`,
    [sessionId, JSON.stringify(resultRows)],
  );

  const v = await tx.query(
    `UPDATE sessions SET results_version = results_version + 1, results_updated_at = now() WHERE id = $1 RETURNING results_version`,
    [sessionId],
  );
  // Fan out to every API instance (SSE subscribers) once the transaction commits.
  await tx.query(`SELECT pg_notify('session_results', $1)`, [JSON.stringify({ sessionId, version: v.rows[0].results_version })]);
  return { laps: lapRows.length, version: v.rows[0].results_version as number };
}
