import type { UserPrincipal } from '../auth.js';
import { HttpError, many, one, type Tx } from '../db.js';
import type { LapRules, SessionType } from '../timing/types.js';
import { audit } from './audit.js';
import { awardSessionTokens } from './customer.js';
import { driverByMemberCode } from './members.js';
import { lockSession, recomputeSession } from './processing.js';

export interface CreateSessionInput {
  trackId: string;
  type: SessionType;
  name: string;
  scheduledStart?: string | null;
  kartClassId?: string | null;
  rules?: Partial<LapRules>;
}

export async function createSession(tx: Tx, actor: UserPrincipal, input: CreateSessionInput) {
  const track = await one<{ default_rules: Partial<LapRules> }>(tx, 'SELECT default_rules FROM tracks WHERE id = $1', [input.trackId]);
  // Races start from a grid behind the line, so lap 1 is timed from the start signal by default.
  const typeDefaults: Partial<LapRules> = input.type === 'sprint' || input.type === 'endurance' ? { startMode: 'session_start' } : {};
  const rules = { ...typeDefaults, ...track.default_rules, ...input.rules };
  const s = await one<{ id: string }>(
    tx,
    `INSERT INTO sessions (track_id, type, name, scheduled_start, kart_class_id, rules, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [input.trackId, input.type, input.name, input.scheduledStart ?? null, input.kartClassId ?? null, JSON.stringify(rules), actor.userId],
  );
  await audit(tx, actor, 'session.create', 'session', s.id, { after: { ...input, rules } });
  return s.id;
}

/**
 * Move a walk-in driver's results to a member's account (customer drove before signing up).
 * Only profiles without an account can be merged; the walk-in row is kept and marked merged.
 */
export async function linkWalkInToMember(tx: Tx, actor: UserPrincipal, walkInId: string, memberCode: string, reason: string) {
  const w = await one<{ user_id: string | null; merged_into: string | null; display_name: string }>(
    tx,
    'SELECT user_id, merged_into, display_name FROM drivers WHERE id = $1 FOR UPDATE',
    [walkInId],
  );
  if (w.user_id) throw new HttpError(409, 'This driver already has an account', 'bad_state');
  if (w.merged_into) throw new HttpError(409, 'Already linked to a member', 'bad_state');
  const member = await driverByMemberCode(tx, memberCode);
  if (member.id === walkInId) throw new HttpError(400, 'Cannot link a driver to itself', 'invalid');
  const counts = {
    entries: (await tx.query('UPDATE session_participants SET driver_id = $2 WHERE driver_id = $1', [walkInId, member.id])).rowCount,
    laps: (await tx.query('UPDATE laps SET driver_id = $2 WHERE driver_id = $1', [walkInId, member.id])).rowCount,
    stints: (await tx.query('UPDATE stints SET driver_id = $2 WHERE driver_id = $1', [walkInId, member.id])).rowCount,
  };
  await tx.query('UPDATE drivers SET merged_into = $2 WHERE id = $1', [walkInId, member.id]);
  await audit(tx, actor, 'driver.link', 'driver', walkInId, { before: { name: w.display_name }, after: { memberId: member.id, ...counts }, reason });
  return { member, ...counts };
}

/** The transponder fitted to a kart at a given instant, per the assignment history. */
async function transponderForKart(tx: Tx, kartId: string, at: string) {
  const r = await tx.query(
    `SELECT transponder_id FROM transponder_assignments WHERE kart_id = $1 AND valid_during @> $2::timestamptz`,
    [kartId, at],
  );
  return (r.rows[0]?.transponder_id as string | undefined) ?? null;
}

export async function addParticipant(
  tx: Tx,
  actor: UserPrincipal,
  sessionId: string,
  input: { kartId: string; driverId?: string | null; memberCode?: string | null; driverName?: string | null; teamName?: string | null },
) {
  const s = await lockSession(tx, sessionId);
  if (s.status === 'final' || s.status === 'cancelled') throw new HttpError(409, `Session is ${s.status}`, 'session_closed');
  let driverId = input.driverId ?? null;
  if (!driverId && input.memberCode) driverId = (await driverByMemberCode(tx, input.memberCode)).id;
  if (!driverId && input.driverName) {
    // Walk-in customer without an app account; can be linked to an account later.
    driverId = (await one<{ id: string }>(tx, 'INSERT INTO drivers (display_name) VALUES ($1) RETURNING id', [input.driverName])).id;
  }
  if (!driverId && !input.teamName) throw new HttpError(400, 'A participant needs a driver or a team name', 'invalid');

  const p = await one<{ id: string }>(
    tx,
    'INSERT INTO session_participants (session_id, driver_id, team_name) VALUES ($1, $2, $3) RETURNING id',
    [sessionId, driverId, input.teamName ?? null],
  );
  const now = new Date().toISOString();
  const transponderId = await transponderForKart(tx, input.kartId, now);
  // A participant joining a running session is active from now on.
  await tx.query(
    `INSERT INTO participant_karts (participant_id, kart_id, transponder_id, active_during)
     VALUES ($1, $2, $3, CASE WHEN $4 THEN tstzrange(now(), NULL) END)`,
    [p.id, input.kartId, transponderId, s.status === 'running'],
  );
  await audit(tx, actor, 'participant.add', 'session', sessionId, { after: { participantId: p.id, ...input, driverId } });
  return { participantId: p.id, driverId };
}

/**
 * Move a participant to another kart. Before the start this just edits the entry; during a session
 * (breakdown, endurance kart change) the current kart's range is closed and a new one opened, so laps
 * on both karts stay attributed to the participant.
 */
export async function changeKart(tx: Tx, actor: UserPrincipal, participantId: string, kartId: string, reason: string) {
  const { session_id } = await one<{ session_id: string }>(tx, 'SELECT session_id FROM session_participants WHERE id = $1', [participantId]);
  const s = await lockSession(tx, session_id);
  if (s.status === 'final' || s.status === 'cancelled') throw new HttpError(409, `Session is ${s.status}`, 'session_closed');
  const before = await many(tx, 'SELECT kart_id, transponder_id, active_during::text FROM participant_karts WHERE participant_id = $1', [participantId]);
  const transponderId = await transponderForKart(tx, kartId, new Date().toISOString());
  if (s.status === 'scheduled') {
    await tx.query('UPDATE participant_karts SET kart_id = $2, transponder_id = $3 WHERE participant_id = $1', [participantId, kartId, transponderId]);
  } else {
    if (!transponderId) throw new HttpError(409, 'That kart has no transponder fitted', 'no_transponder');
    await tx.query(
      `UPDATE participant_karts SET active_during = tstzrange(lower(active_during), now())
        WHERE participant_id = $1 AND upper_inf(active_during)`,
      [participantId],
    );
    await tx.query(
      `INSERT INTO participant_karts (participant_id, kart_id, transponder_id, active_during) VALUES ($1, $2, $3, tstzrange(now(), NULL))`,
      [participantId, kartId, transponderId],
    );
  }
  await audit(tx, actor, 'participant.change_kart', 'participant', participantId, { before, after: { kartId, transponderId }, reason });
  if (s.status !== 'scheduled') await recomputeSession(tx, session_id);
}

/** Explicit start/finish times are for backfilling; they may not be in the future. */
function assertNotFuture(at: string | undefined) {
  if (at !== undefined && Date.parse(at) > Date.now() + 60_000) {
    throw new HttpError(400, 'Start/finish time is in the future', 'invalid');
  }
}

async function primaryClockOffset(tx: Tx, trackId: string) {
  const r = await tx.query(
    `SELECT clock_offset_us FROM timing_devices WHERE track_id = $1 AND disabled_at IS NULL AND provider <> 'csv-import'
      ORDER BY last_seen_at DESC NULLS LAST LIMIT 1`,
    [trackId],
  );
  return Number(r.rows[0]?.clock_offset_us ?? 0);
}

export async function startSession(tx: Tx, actor: UserPrincipal, sessionId: string, at?: string) {
  assertNotFuture(at);
  const s = await lockSession(tx, sessionId);
  if (s.status !== 'scheduled') throw new HttpError(409, `Cannot start a ${s.status} session`, 'bad_state');
  const startAt = at ?? new Date().toISOString();

  // Re-resolve transponders at the start instant: karts may have been re-fitted since entry.
  const pks = await many<{ id: string; kart_id: string; number: string }>(
    tx,
    `SELECT pk.id, pk.kart_id, k.number FROM participant_karts pk
       JOIN session_participants p ON p.id = pk.participant_id JOIN karts k ON k.id = pk.kart_id
      WHERE p.session_id = $1`,
    [sessionId],
  );
  const missing: string[] = [];
  for (const pk of pks) {
    const t = await transponderForKart(tx, pk.kart_id, startAt);
    if (!t) missing.push(pk.number);
    else await tx.query('UPDATE participant_karts SET transponder_id = $2 WHERE id = $1', [pk.id, t]);
  }
  if (missing.length) throw new HttpError(409, `No transponder assigned to kart(s) ${missing.join(', ')}`, 'no_transponder');

  // Hand transponders over from earlier, already-finished sessions (back-to-back rental sessions, or a
  // back-filled session inserted between two others): their range now ends where this one starts.
  await tx.query(
    `UPDATE participant_karts old SET active_during = tstzrange(lower(old.active_during), $2::timestamptz)
       FROM session_participants op JOIN sessions os ON os.id = op.session_id
      WHERE old.participant_id = op.id AND os.status IN ('finished', 'final') AND os.id <> $1
        AND old.active_during @> $2::timestamptz AND lower(old.active_during) < $2::timestamptz
        AND old.transponder_id IN (SELECT pk.transponder_id FROM participant_karts pk
                                     JOIN session_participants p ON p.id = pk.participant_id WHERE p.session_id = $1)`,
    [sessionId, startAt],
  );
  try {
    // Open-ended from the start — unless this is a backfill and a later session already uses the
    // transponder, in which case the range ends where that session's begins.
    await tx.query(
      `UPDATE participant_karts pk
          SET active_during = tstzrange($2::timestamptz,
                (SELECT min(lower(o.active_during)) FROM participant_karts o
                  WHERE o.transponder_id = pk.transponder_id AND o.id <> pk.id AND lower(o.active_during) > $2::timestamptz))
         FROM session_participants p WHERE p.id = pk.participant_id AND p.session_id = $1`,
      [sessionId, startAt],
    );
  } catch (e) {
    if ((e as { code?: string }).code === '23P01') {
      throw new HttpError(
        409,
        'A kart in this session is already assigned to another session at this time (still running, or overlapping times)',
        'transponder_in_use',
      );
    }
    throw e;
  }
  await tx.query(`UPDATE sessions SET status = 'running', started_at = $2, clock_offset_us = $3 WHERE id = $1`, [
    sessionId,
    startAt,
    await primaryClockOffset(tx, s.track_id),
  ]);
  await audit(tx, actor, 'session.start', 'session', sessionId, { after: { startedAt: startAt } });
  await recomputeSession(tx, sessionId);
}

export async function finishSession(tx: Tx, actor: UserPrincipal, sessionId: string, at?: string) {
  assertNotFuture(at);
  const s = await lockSession(tx, sessionId);
  if (s.status !== 'running') throw new HttpError(409, `Cannot finish a ${s.status} session`, 'bad_state');
  const endAt = at ?? new Date().toISOString();
  const r = await tx.query(`UPDATE sessions SET status = 'finished', ended_at = $2 WHERE id = $1 AND started_at <= $2 RETURNING id`, [
    sessionId,
    endAt,
  ]);
  if (!r.rowCount) throw new HttpError(400, 'Finish time is before the start time', 'invalid');
  await tx.query(`UPDATE stints SET ended_at = $2 FROM session_participants p
                   WHERE p.id = stints.participant_id AND p.session_id = $1 AND stints.ended_at IS NULL`, [sessionId, endAt]);
  await audit(tx, actor, 'session.finish', 'session', sessionId, { after: { endedAt: endAt } });
  await recomputeSession(tx, sessionId);
}

export async function finalizeSession(tx: Tx, actor: UserPrincipal, sessionId: string) {
  const s = await lockSession(tx, sessionId);
  if (s.status !== 'finished') throw new HttpError(409, `Only finished sessions can be finalised (this one is ${s.status})`, 'bad_state');
  await recomputeSession(tx, sessionId, { force: true });
  await tx.query(`UPDATE sessions SET status = 'final', finalized_at = now(), finalized_by = $2 WHERE id = $1`, [sessionId, actor.userId]);
  await awardSessionTokens(tx, sessionId);
  await audit(tx, actor, 'session.finalize', 'session', sessionId);
}

export async function reopenSession(tx: Tx, actor: UserPrincipal, sessionId: string, reason: string) {
  const s = await lockSession(tx, sessionId);
  if (s.status !== 'final') throw new HttpError(409, 'Only final sessions can be reopened', 'bad_state');
  await tx.query(`UPDATE sessions SET status = 'finished', finalized_at = NULL, finalized_by = NULL WHERE id = $1`, [sessionId]);
  await audit(tx, actor, 'session.reopen', 'session', sessionId, { reason });
  await recomputeSession(tx, sessionId);
}

export async function cancelSession(tx: Tx, actor: UserPrincipal, sessionId: string, reason: string) {
  const s = await lockSession(tx, sessionId);
  if (s.status === 'final') throw new HttpError(409, 'Final sessions cannot be cancelled; reopen first', 'bad_state');
  await tx.query(`UPDATE sessions SET status = 'cancelled' WHERE id = $1`, [sessionId]);
  // Release transponders immediately.
  await tx.query(
    `UPDATE participant_karts pk SET active_during = NULL FROM session_participants p WHERE p.id = pk.participant_id AND p.session_id = $1`,
    [sessionId],
  );
  await tx.query('DELETE FROM laps WHERE session_id = $1', [sessionId]);
  await tx.query('DELETE FROM session_results WHERE session_id = $1', [sessionId]);
  await audit(tx, actor, 'session.cancel', 'session', sessionId, { reason });
}

/** Endurance driver change, recorded by the pit-lane operator. */
export async function recordDriverChange(tx: Tx, actor: UserPrincipal, participantId: string, driverId: string, at?: string) {
  const { session_id } = await one<{ session_id: string }>(tx, 'SELECT session_id FROM session_participants WHERE id = $1', [participantId]);
  assertNotFuture(at);
  const s = await lockSession(tx, session_id);
  if (s.status !== 'running') throw new HttpError(409, 'Driver changes can only be recorded during a running session', 'bad_state');
  const when = at ?? new Date().toISOString();
  await tx.query('UPDATE stints SET ended_at = $2 WHERE participant_id = $1 AND ended_at IS NULL', [participantId, when]);
  const st = await one<{ id: string }>(
    tx,
    'INSERT INTO stints (participant_id, driver_id, started_at, recorded_by) VALUES ($1, $2, $3, $4) RETURNING id',
    [participantId, driverId, when, actor.userId],
  );
  await audit(tx, actor, 'stint.start', 'participant', participantId, { after: { driverId, at: when } });
  await recomputeSession(tx, session_id);
  return st.id;
}

export type CorrectionInput =
  | { kind: 'exclude_event'; targetRef: string; reason: string }
  | { kind: 'invalidate_lap'; targetRef: string; reason: string }
  | { kind: 'add_crossing'; participantId: string; crossingUs: number; loop?: 'finish' | 'pit_in'; reason: string }
  | { kind: 'time_penalty'; participantId: string; valueUs: number; reason: string }
  | { kind: 'lap_penalty'; participantId: string; laps: number; reason: string }
  | { kind: 'disqualify'; participantId: string; reason: string };

export async function addCorrection(tx: Tx, actor: UserPrincipal, sessionId: string, c: CorrectionInput) {
  const s = await lockSession(tx, sessionId);
  if (s.status === 'scheduled' || s.status === 'cancelled') throw new HttpError(409, `Cannot correct a ${s.status} session`, 'bad_state');
  if (s.status === 'final') throw new HttpError(409, 'Session is final; reopen it (with a reason) before correcting', 'session_final');
  const participantId = 'participantId' in c ? c.participantId : null;
  if (participantId) {
    await one(tx, 'SELECT 1 FROM session_participants WHERE id = $1 AND session_id = $2', [participantId, sessionId]).catch(() => {
      throw new HttpError(400, 'Participant is not in this session', 'invalid');
    });
  }
  const row = await one<{ id: string }>(
    tx,
    `INSERT INTO timing_corrections (session_id, participant_id, kind, target_ref, crossing_us, crossing_loop, value_us, value_int, reason, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
    [
      sessionId,
      participantId,
      c.kind,
      'targetRef' in c ? c.targetRef : null,
      c.kind === 'add_crossing' ? c.crossingUs : null,
      c.kind === 'add_crossing' ? (c.loop ?? 'finish') : null,
      c.kind === 'time_penalty' ? c.valueUs : null,
      c.kind === 'lap_penalty' ? c.laps : null,
      c.reason,
      actor.userId,
    ],
  );
  await audit(tx, actor, `correction.${c.kind}`, 'session', sessionId, { after: { correctionId: row.id, ...c }, reason: c.reason });
  await recomputeSession(tx, sessionId);
  return row.id;
}

export async function revokeCorrection(tx: Tx, actor: UserPrincipal, correctionId: string, reason: string) {
  const c = await one<{ session_id: string; revoked_at: string | null }>(tx, 'SELECT session_id, revoked_at FROM timing_corrections WHERE id = $1', [
    correctionId,
  ]);
  const s = await lockSession(tx, c.session_id);
  if (s.status === 'final') throw new HttpError(409, 'Session is final; reopen it before changing corrections', 'session_final');
  if (c.revoked_at) throw new HttpError(409, 'Correction already revoked', 'bad_state');
  await tx.query('UPDATE timing_corrections SET revoked_at = now(), revoked_by = $2, revoke_reason = $3 WHERE id = $1', [
    correctionId,
    actor.userId,
    reason,
  ]);
  await audit(tx, actor, 'correction.revoke', 'correction', correctionId, { reason });
  await recomputeSession(tx, c.session_id);
}
