import { randomUUID } from 'node:crypto';
import { withTx, type Db } from '../db.js';
import type { NormalizedPassing } from '../timing/csv.js';
import { recomputeSession, rulesFor, SESSION_COLUMNS, type SessionRow } from './processing.js';

const POST_CHEQUER_WINDOW_US = 10 * 60 * 1_000_000;

export interface IngestResult {
  batchId: string;
  received: number;
  accepted: number;
  duplicates: number;
  recomputedSessions: string[];
  /** Final sessions whose window contains newly accepted events: needs operator review (reopen). */
  lateEventsForFinalSessions: string[];
}

/**
 * Store raw passings for a device, idempotently, then recalculate the sessions they affect.
 * Re-sending a batch after a network failure is always safe: (device_id, event_key) is unique.
 */
export async function ingestPassings(db: Db, deviceId: string, passings: NormalizedPassing[]): Promise<IngestResult> {
  const batchId = randomUUID();
  const { inserted, trackId } = await withTx(db, async (tx) => {
    const dev = await tx.query('SELECT track_id FROM timing_devices WHERE id = $1', [deviceId]);
    const rows = passings.map((p) => ({
      event_key: p.eventKey,
      transponder_code: p.transponderCode,
      loop_code: p.loopCode,
      detected_us: p.detectedUs,
      sequence: p.sequence,
      source_status: null,
      payload: p.raw,
    }));
    const r = await tx.query(
      `INSERT INTO raw_timing_events (device_id, ingest_batch, event_key, transponder_code, loop_code, detected_us, sequence, source_status, payload)
       SELECT $1, $2, x.* FROM jsonb_to_recordset($3::jsonb) AS x(
         event_key text, transponder_code text, loop_code text, detected_us bigint, sequence bigint, source_status text, payload jsonb)
       ON CONFLICT (device_id, event_key) DO NOTHING
       RETURNING detected_us`,
      [deviceId, batchId, JSON.stringify(rows)],
    );
    const maxSeq = passings.reduce<number | null>((m, p) => (p.sequence !== null && (m === null || p.sequence > m) ? p.sequence : m), null);
    await tx.query(
      `UPDATE timing_devices SET last_seen_at = now(), last_sequence = GREATEST(coalesce(last_sequence, 0), coalesce($2, 0)) WHERE id = $1`,
      [deviceId, maxSeq],
    );
    return { inserted: r.rows.map((x) => Number(x.detected_us)), trackId: dev.rows[0].track_id as string };
  });

  const result: IngestResult = {
    batchId,
    received: passings.length,
    accepted: inserted.length,
    duplicates: passings.length - inserted.length,
    recomputedSessions: [],
    lateEventsForFinalSessions: [],
  };
  if (!inserted.length) return result;

  const minUs = Math.min(...inserted);
  const maxUs = Math.max(...inserted);
  const sessions = (
    await db.query(
      `SELECT ${SESSION_COLUMNS} FROM sessions s
        WHERE s.track_id = $1 AND s.status IN ('running', 'finished', 'final') AND s.started_at IS NOT NULL`,
      [trackId],
    )
  ).rows as SessionRow[];

  for (const s of sessions) {
    const from = s.started_us! + Number(s.clock_offset_us) - rulesFor(s).boundaryToleranceUs;
    const to = s.ended_us === null ? Infinity : s.ended_us + Number(s.clock_offset_us) + POST_CHEQUER_WINDOW_US;
    if (maxUs < from || minUs > to) continue;
    if (s.status === 'final') {
      result.lateEventsForFinalSessions.push(s.id);
      continue;
    }
    await withTx(db, (tx) => recomputeSession(tx, s.id));
    result.recomputedSessions.push(s.id);
  }
  return result;
}
