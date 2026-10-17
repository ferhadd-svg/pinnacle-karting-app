import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { hashPassword, newDeviceKey, requireStaffForVenue, requireUser, type Principal } from '../auth.js';
import { HttpError, many, one, withTx, type Queryable } from '../db.js';
import { isoDate, parse, params, uuid, type AppContext } from '../http.js';
import { audit } from '../services/audit.js';
import { waiverStatus } from '../services/customer.js';
import { driverByMemberCode } from '../services/members.js';
import { ingestPassings } from '../services/ingest.js';
import { computeSession, recomputeSession, SESSION_COLUMNS, type SessionRow } from '../services/processing.js';
import { sessionLaps, sessionLeaderboard } from '../services/queries.js';
import {
  addCorrection,
  addParticipant,
  cancelSession,
  changeKart,
  linkWalkInToMember,
  createSession,
  finalizeSession,
  finishSession,
  recordDriverChange,
  reopenSession,
  revokeCorrection,
  startSession,
} from '../services/sessions.js';
import { csvToPassings } from '../timing/csv.js';
import { formatLapUs, usToIso } from '../timing/time.js';

const venueOf = {
  track: (q: Queryable, id: string) => one<{ venue_id: string }>(q, 'SELECT venue_id FROM tracks WHERE id = $1', [id]).then((r) => r.venue_id),
  session: (q: Queryable, id: string) =>
    one<{ venue_id: string }>(q, 'SELECT t.venue_id FROM sessions s JOIN tracks t ON t.id = s.track_id WHERE s.id = $1', [id]).then((r) => r.venue_id),
  participant: (q: Queryable, id: string) =>
    one<{ venue_id: string }>(
      q,
      `SELECT t.venue_id FROM session_participants p JOIN sessions s ON s.id = p.session_id JOIN tracks t ON t.id = s.track_id WHERE p.id = $1`,
      [id],
    ).then((r) => r.venue_id),
};

const sessionType = z.enum(['practice', 'rental', 'qualifying', 'sprint', 'endurance']);
const rulesSchema = z
  .object({
    dedupWindowUs: z.number().int().min(0),
    minLapUs: z.number().int().min(0),
    maxLapUs: z.number().int().positive().nullable(),
    missedLapFactor: z.number().min(1.2).max(5),
    startMode: z.enum(['first_crossing', 'session_start']),
    boundaryToleranceUs: z.number().int().min(0).max(60_000_000),
  })
  .partial();
const reasonBody = z.object({ reason: z.string().trim().min(3).max(500) });

function csvCell(v: unknown) {
  const s = v === null || v === undefined ? '' : String(v);
  // Quote, and neutralise spreadsheet formula injection.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
const toCsv = (rows: unknown[][]) => rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';

export function adminRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db } = ctx;
  const staffFor = async (p: Principal | null, venueId: Promise<string> | string) => requireStaffForVenue(p, await venueId);

  // ── Venue setup ─────────────────────────────────────────────────────────
  app.post('/venues', async (req, reply) => {
    const u = requireUser(req.principal, 'admin');
    const b = parse(
      z.object({
        name: z.string().min(1),
        timezone: z.string().default('Asia/Kuala_Lumpur'),
        shortName: z.string().max(20).optional(),
        kind: z.enum(['indoor', 'outdoor', 'hybrid', 'circuit']).default('indoor'),
        accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#3ee07f'),
        tagline: z.string().max(120).default(''),
        sort: z.number().int().default(0),
      }),
      req.body,
    );
    try {
      new Intl.DateTimeFormat('en', { timeZone: b.timezone });
    } catch {
      throw new HttpError(400, 'Unknown timezone', 'invalid');
    }
    const v = await one<{ id: string }>(
      db,
      'INSERT INTO venues (name, timezone, short_name, kind, accent_color, tagline, sort) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
      [b.name, b.timezone, b.shortName ?? null, b.kind, b.accentColor, b.tagline, b.sort],
    );
    await audit(db, u, 'venue.create', 'venue', v.id, { after: b });
    reply.code(201);
    return v;
  });

  app.post('/users', async (req, reply) => {
    const u = requireUser(req.principal, 'admin');
    const b = parse(
      z.object({ email: z.string().email(), password: z.string().min(10), role: z.enum(['operator', 'admin']), venueId: uuid.optional() }),
      req.body,
    );
    if (b.role === 'operator' && !b.venueId) throw new HttpError(400, 'Operators need a venueId', 'invalid');
    const row = await one<{ id: string }>(db, 'INSERT INTO users (email, password_hash, role, venue_id) VALUES ($1, $2, $3, $4) RETURNING id', [
      b.email,
      await hashPassword(b.password),
      b.role,
      b.venueId ?? null,
    ]);
    await audit(db, u, 'user.create', 'user', row.id, { after: { email: b.email, role: b.role, venueId: b.venueId } });
    reply.code(201);
    return row;
  });

  app.post('/tracks', async (req, reply) => {
    const b = parse(
      z.object({
        venueId: uuid,
        name: z.string().min(1),
        layout: z.string().default('standard'),
        lengthM: z.number().int().positive().optional(),
        defaultRules: rulesSchema.default({}),
        // SVG path in a 0..100 box, e.g. "M10 50 C10 20 ...Z"
        mapPath: z.string().max(4000).regex(/^[MmLlHhVvCcSsQqTtAaZz0-9 .,-]+$/).optional(),
      }),
      req.body,
    );
    const u = await staffFor(req.principal, b.venueId);
    const t = await one<{ id: string }>(
      db,
      'INSERT INTO tracks (venue_id, name, layout, length_m, default_rules, map_path) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      [b.venueId, b.name, b.layout, b.lengthM ?? null, JSON.stringify(b.defaultRules), b.mapPath ?? null],
    );
    await audit(db, u, 'track.create', 'track', t.id, { after: b });
    reply.code(201);
    return t;
  });

  app.post('/tracks/:id/loops', async (req, reply) => {
    const trackId = params(req);
    const u = await staffFor(req.principal, venueOf.track(db, trackId));
    const b = parse(z.object({ code: z.string().min(1), role: z.enum(['finish', 'pit_in', 'pit_out', 'split']) }), req.body);
    const l = await one<{ id: string }>(
      db,
      `INSERT INTO timing_loops (track_id, code, role) VALUES ($1, $2, $3)
       ON CONFLICT (track_id, code) DO UPDATE SET role = EXCLUDED.role RETURNING id`,
      [trackId, b.code, b.role],
    );
    await audit(db, u, 'loop.upsert', 'track', trackId, { after: b });
    reply.code(201);
    return l;
  });

  app.post('/kart-classes', async (req, reply) => {
    const b = parse(z.object({ venueId: uuid, name: z.string().min(1) }), req.body);
    const u = await staffFor(req.principal, b.venueId);
    const c = await one<{ id: string }>(db, 'INSERT INTO kart_classes (venue_id, name) VALUES ($1, $2) RETURNING id', [b.venueId, b.name]);
    await audit(db, u, 'kart_class.create', 'kart_class', c.id, { after: b });
    reply.code(201);
    return c;
  });

  app.post('/karts', async (req, reply) => {
    const b = parse(z.object({ venueId: uuid, number: z.string().min(1).max(10), classId: uuid.optional() }), req.body);
    const u = await staffFor(req.principal, b.venueId);
    const k = await one<{ id: string }>(db, 'INSERT INTO karts (venue_id, number, class_id) VALUES ($1, $2, $3) RETURNING id', [
      b.venueId,
      b.number,
      b.classId ?? null,
    ]);
    await audit(db, u, 'kart.create', 'kart', k.id, { after: b });
    reply.code(201);
    return k;
  });

  app.patch('/karts/:id', async (req) => {
    const id = params(req);
    const k = await one<{ venue_id: string; status: string; class_id: string | null }>(db, 'SELECT venue_id, status, class_id FROM karts WHERE id = $1', [id]);
    const u = await staffFor(req.principal, k.venue_id);
    const b = parse(z.object({ status: z.enum(['active', 'maintenance', 'retired']).optional(), classId: uuid.nullable().optional() }), req.body);
    await db.query('UPDATE karts SET status = coalesce($2, status), class_id = CASE WHEN $4 THEN $3 ELSE class_id END WHERE id = $1', [
      id,
      b.status ?? null,
      b.classId ?? null,
      b.classId !== undefined,
    ]);
    await audit(db, u, 'kart.update', 'kart', id, { before: k, after: b });
    return { ok: true };
  });

  app.get('/karts', async (req) => {
    const q = parse(z.object({ venueId: uuid }), req.query);
    await staffFor(req.principal, q.venueId);
    return {
      karts: await many(
        db,
        `SELECT k.id, k.number, k.status, kc.name AS class_name, t.id AS transponder_id, t.code AS transponder_code
           FROM karts k LEFT JOIN kart_classes kc ON kc.id = k.class_id
           LEFT JOIN transponder_assignments a ON a.kart_id = k.id AND a.valid_during @> now()
           LEFT JOIN transponders t ON t.id = a.transponder_id
          WHERE k.venue_id = $1 ORDER BY length(k.number), k.number`,
        [q.venueId],
      ),
    };
  });

  app.post('/transponders', async (req, reply) => {
    const b = parse(z.object({ venueId: uuid, code: z.string().min(1).max(64), kind: z.string().optional() }), req.body);
    const u = await staffFor(req.principal, b.venueId);
    const t = await one<{ id: string }>(db, 'INSERT INTO transponders (venue_id, code, kind) VALUES ($1, $2, $3) RETURNING id', [
      b.venueId,
      b.code,
      b.kind ?? null,
    ]);
    await audit(db, u, 'transponder.create', 'transponder', t.id, { after: b });
    reply.code(201);
    return t;
  });

  /**
   * Fit a transponder to a kart from `from` (default now). Any open assignment of either the transponder
   * or the kart is closed at that instant, so history stays intact and ranges never overlap.
   */
  app.post('/transponder-assignments', async (req, reply) => {
    const b = parse(z.object({ transponderId: uuid, kartId: uuid, from: isoDate.optional(), note: z.string().max(200).optional() }), req.body);
    const venue = await one<{ venue_id: string }>(
      db,
      `SELECT t.venue_id FROM transponders t JOIN karts k ON k.venue_id = t.venue_id WHERE t.id = $1 AND k.id = $2`,
      [b.transponderId, b.kartId],
    ).catch(() => {
      throw new HttpError(400, 'Transponder and kart must belong to the same venue', 'invalid');
    });
    const u = await staffFor(req.principal, venue.venue_id);
    const from = b.from ?? new Date().toISOString();
    const id = await withTx(db, async (t) => {
      const closed = await t.query(
        `UPDATE transponder_assignments SET valid_during = tstzrange(lower(valid_during), $3::timestamptz)
          WHERE (transponder_id = $1 OR kart_id = $2) AND valid_during @> $3::timestamptz AND lower(valid_during) < $3::timestamptz
          RETURNING id, transponder_id, kart_id`,
        [b.transponderId, b.kartId, from],
      );
      const a = await one<{ id: string }>(
        t,
        `INSERT INTO transponder_assignments (transponder_id, kart_id, valid_during, note, created_by)
         VALUES ($1, $2, tstzrange($3::timestamptz, NULL), $4, $5) RETURNING id`,
        [b.transponderId, b.kartId, from, b.note ?? null, u.userId],
      );
      await audit(t, u, 'transponder.assign', 'transponder', b.transponderId, { before: closed.rows, after: { ...b, from, assignmentId: a.id } });
      return a.id;
    });
    reply.code(201);
    return { id };
  });

  app.post('/drivers', async (req, reply) => {
    requireUser(req.principal, 'operator', 'admin');
    const b = parse(z.object({ displayName: z.string().trim().min(1).max(60), birthYear: z.number().int().optional() }), req.body);
    const d = await one<{ id: string }>(db, 'INSERT INTO drivers (display_name, birth_year) VALUES ($1, $2) RETURNING id', [b.displayName, b.birthYear ?? null]);
    await audit(db, req.principal, 'driver.create', 'driver', d.id, { after: b });
    reply.code(201);
    return d;
  });

  /** Look up a member by the code on their card (check-in). */
  app.get('/drivers/by-code/:code', async (req) => {
    requireUser(req.principal, 'operator', 'admin');
    const { code } = parse(z.object({ code: z.string().min(4).max(12) }), req.params);
    const q = parse(z.object({ venueId: uuid.optional() }), req.query);
    const driver = await driverByMemberCode(db, code);
    // At check-in staff also need to know whether the driver's waiver is valid for this venue.
    return q.venueId ? { ...driver, waiver: await waiverStatus(db, driver.id, q.venueId) } : driver;
  });

  app.post('/drivers/:id/link', async (req) => {
    const u = requireUser(req.principal, 'operator', 'admin');
    const id = params(req);
    const b = parse(z.object({ memberCode: z.string().min(4).max(12), reason: z.string().trim().min(3).max(500) }), req.body);
    return withTx(db, (t) => linkWalkInToMember(t, u, id, b.memberCode, b.reason));
  });

  app.get('/drivers', async (req) => {
    requireUser(req.principal, 'operator', 'admin');
    const q = parse(z.object({ q: z.string().min(1) }), req.query);
    return { drivers: await many(db, `SELECT id, display_name AS name FROM drivers WHERE display_name ILIKE '%' || $1 || '%' ORDER BY display_name LIMIT 20`, [q.q]) };
  });

  // ── Devices ─────────────────────────────────────────────────────────────
  app.post('/devices', async (req, reply) => {
    const u = requireUser(req.principal, 'admin');
    const b = parse(z.object({ trackId: uuid, name: z.string().min(1), provider: z.string().min(1) }), req.body);
    const venueId = await venueOf.track(db, b.trackId);
    const { key, hash } = newDeviceKey();
    const d = await one<{ id: string }>(
      db,
      'INSERT INTO timing_devices (venue_id, track_id, name, provider, api_key_hash) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [venueId, b.trackId, b.name, b.provider, hash],
    );
    await audit(db, u, 'device.create', 'device', d.id, { after: b });
    reply.code(201);
    // The key is only ever shown here.
    return { id: d.id, apiKey: key };
  });

  app.get('/devices', async (req) => {
    const q = parse(z.object({ venueId: uuid }), req.query);
    await staffFor(req.principal, q.venueId);
    const rows = await many<Record<string, any>>(
      db,
      `SELECT d.id, d.name, d.provider, d.track_id, d.last_seen_at, d.last_sequence, d.clock_offset_us, d.disabled_at,
              extract(epoch FROM now() - d.last_seen_at)::int AS seconds_since_seen,
              (SELECT count(*)::int FROM raw_timing_events e WHERE e.device_id = d.id AND e.received_at > now() - interval '5 minutes') AS events_5m
         FROM timing_devices d WHERE d.venue_id = $1 ORDER BY d.name`,
      [q.venueId],
    );
    return {
      devices: rows.map((d) => ({
        ...d,
        health: d.disabled_at ? 'disabled' : d.seconds_since_seen === null ? 'never_seen' : d.seconds_since_seen <= 30 ? 'online' : 'offline',
      })),
    };
  });

  // ── Sessions ────────────────────────────────────────────────────────────
  app.post('/sessions', async (req, reply) => {
    const b = parse(
      z.object({ trackId: uuid, type: sessionType, name: z.string().min(1).max(100), scheduledStart: isoDate.optional(), kartClassId: uuid.optional(), rules: rulesSchema.optional() }),
      req.body,
    );
    const u = await staffFor(req.principal, venueOf.track(db, b.trackId));
    const id = await withTx(db, (t) => createSession(t, u, b));
    reply.code(201);
    return { id };
  });

  app.post('/sessions/:id/participants', async (req, reply) => {
    const id = params(req);
    const u = await staffFor(req.principal, venueOf.session(db, id));
    const b = parse(
      z.object({
        kartId: uuid,
        driverId: uuid.optional(),
        memberCode: z.string().trim().min(4).max(12).optional(),
        driverName: z.string().trim().min(1).max(60).optional(),
        teamName: z.string().trim().min(1).max(60).optional(),
      }),
      req.body,
    );
    const r = await withTx(db, (t) => addParticipant(t, u, id, b));
    reply.code(201);
    return r;
  });

  app.post('/participants/:id/kart', async (req) => {
    const id = params(req);
    const u = await staffFor(req.principal, venueOf.participant(db, id));
    const b = parse(z.object({ kartId: uuid, reason: z.string().trim().min(3) }), req.body);
    await withTx(db, (t) => changeKart(t, u, id, b.kartId, b.reason));
    return { ok: true };
  });

  app.post('/participants/:id/stints', async (req, reply) => {
    const id = params(req);
    const u = await staffFor(req.principal, venueOf.participant(db, id));
    const b = parse(z.object({ driverId: uuid, at: isoDate.optional() }), req.body);
    const stintId = await withTx(db, (t) => recordDriverChange(t, u, id, b.driverId, b.at));
    reply.code(201);
    return { id: stintId };
  });

  const lifecycle = z.object({ at: isoDate.optional() });
  app.post('/sessions/:id/start', async (req) => {
    const id = params(req);
    const u = await staffFor(req.principal, venueOf.session(db, id));
    const b = parse(lifecycle, req.body ?? {});
    await withTx(db, (t) => startSession(t, u, id, b.at));
    return { ok: true };
  });

  app.post('/sessions/:id/finish', async (req) => {
    const id = params(req);
    const u = await staffFor(req.principal, venueOf.session(db, id));
    const b = parse(lifecycle, req.body ?? {});
    await withTx(db, (t) => finishSession(t, u, id, b.at));
    return { ok: true };
  });

  app.post('/sessions/:id/finalize', async (req) => {
    const id = params(req);
    const u = await staffFor(req.principal, venueOf.session(db, id));
    await withTx(db, (t) => finalizeSession(t, u, id));
    return { ok: true };
  });

  app.post('/sessions/:id/reopen', async (req) => {
    const id = params(req);
    const u = await staffFor(req.principal, venueOf.session(db, id));
    const b = parse(reasonBody, req.body);
    await withTx(db, (t) => reopenSession(t, u, id, b.reason));
    return { ok: true };
  });

  app.post('/sessions/:id/cancel', async (req) => {
    const id = params(req);
    const u = await staffFor(req.principal, venueOf.session(db, id));
    const b = parse(reasonBody, req.body);
    await withTx(db, (t) => cancelSession(t, u, id, b.reason));
    return { ok: true };
  });

  app.post('/sessions/:id/recalculate', async (req) => {
    const id = params(req);
    const u = await staffFor(req.principal, venueOf.session(db, id));
    const r = await withTx(db, (t) => recomputeSession(t, id));
    await audit(db, u, 'session.recalculate', 'session', id);
    if (!r) throw new HttpError(409, 'Session is not in a recalculable state (scheduled, cancelled or final)', 'bad_state');
    return r;
  });

  // ── Corrections & anomalies ─────────────────────────────────────────────
  const correctionSchema = z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('exclude_event'), targetRef: z.string().regex(/^[rm]:/), reason: z.string().trim().min(3) }),
    z.object({ kind: z.literal('invalidate_lap'), targetRef: z.string().regex(/^[rm]:/), reason: z.string().trim().min(3) }),
    z.object({
      kind: z.literal('add_crossing'),
      participantId: uuid,
      at: z.union([isoDate, z.number().int()]),
      loop: z.enum(['finish', 'pit_in']).optional(),
      reason: z.string().trim().min(3),
    }),
    z.object({ kind: z.literal('time_penalty'), participantId: uuid, seconds: z.number().positive().max(3600), reason: z.string().trim().min(3) }),
    z.object({ kind: z.literal('lap_penalty'), participantId: uuid, laps: z.number().int().positive().max(100), reason: z.string().trim().min(3) }),
    z.object({ kind: z.literal('disqualify'), participantId: uuid, reason: z.string().trim().min(3) }),
  ]);

  app.post('/sessions/:id/corrections', async (req, reply) => {
    const id = params(req);
    const u = await staffFor(req.principal, venueOf.session(db, id));
    const b = parse(correctionSchema, req.body);
    const input =
      b.kind === 'add_crossing'
        ? { kind: b.kind, participantId: b.participantId, loop: b.loop, reason: b.reason, crossingUs: typeof b.at === 'number' ? b.at : Date.parse(b.at) * 1000 }
        : b.kind === 'time_penalty'
          ? { kind: b.kind, participantId: b.participantId, reason: b.reason, valueUs: Math.round(b.seconds * 1e6) }
          : b;
    const correctionId = await withTx(db, (t) => addCorrection(t, u, id, input));
    reply.code(201);
    return { id: correctionId };
  });

  app.get('/sessions/:id/corrections', async (req) => {
    const id = params(req);
    await staffFor(req.principal, venueOf.session(db, id));
    return { corrections: await many(db, 'SELECT * FROM timing_corrections WHERE session_id = $1 ORDER BY created_at', [id]) };
  });

  app.post('/corrections/:id/revoke', async (req) => {
    const id = params(req);
    const c = await one<{ session_id: string }>(db, 'SELECT session_id FROM timing_corrections WHERE id = $1', [id]);
    const u = await staffFor(req.principal, venueOf.session(db, c.session_id));
    const b = parse(reasonBody, req.body);
    await withTx(db, (t) => revokeCorrection(t, u, id, b.reason));
    return { ok: true };
  });

  /** Everything an operator should look at before finalising. Computed fresh; never persisted. */
  app.get('/sessions/:id/anomalies', async (req) => {
    const id = params(req);
    await staffFor(req.principal, venueOf.session(db, id));
    return withTx(db, async (t) => {
      const s = await one<SessionRow & { status: string }>(t, `SELECT ${SESSION_COLUMNS} FROM sessions s WHERE s.id = $1`, [id]);
      const missingTransponders = await many(
        t,
        `SELECT p.id AS participant_id, k.number AS kart FROM participant_karts pk JOIN session_participants p ON p.id = pk.participant_id
           JOIN karts k ON k.id = pk.kart_id WHERE p.session_id = $1 AND pk.transponder_id IS NULL`,
        [id],
      );
      if (s.started_us === null) return { status: s.status, missingTransponders, rejectedCrossings: [], flaggedLaps: [], unmatchedEvents: [], unknownLoops: [] };
      const c = await computeSession(t, s);
      const lateForFinal =
        s.status === 'final'
          ? (
              await t.query(
                `SELECT count(*)::int AS n FROM raw_timing_events e JOIN timing_devices d ON d.id = e.device_id
                  WHERE d.track_id = $1 AND e.received_at > (SELECT finalized_at FROM sessions WHERE id = $2)
                    AND e.detected_us BETWEEN $3 AND coalesce($4, $3) + 600000000`,
                [s.track_id, id, s.started_us + Number(s.clock_offset_us), s.ended_us === null ? null : s.ended_us + Number(s.clock_offset_us)],
              )
            ).rows[0].n
          : 0;
      return {
        status: s.status,
        missingTransponders,
        lateEventsAfterFinalisation: lateForFinal,
        rejectedCrossings: c.participants.flatMap((p) =>
          p.rejected
            .filter((r) => r.reason !== 'after_finish')
            .map((r) => ({
              participantId: p.participantId,
              ref: r.crossing.eventId,
              at: usToIso(r.crossing.timeUs),
              reason: r.reason,
              gap: r.gapUs === undefined ? null : formatLapUs(r.gapUs),
            })),
        ),
        flaggedLaps: c.participants.flatMap((p) =>
          p.laps
            .filter((l) => l.flags.length)
            .map((l) => ({ participantId: p.participantId, lapNumber: l.lapNumber, lapTime: formatLapUs(l.durationUs), flags: l.flags, endRef: l.endEventId })),
        ),
        unmatchedEvents: c.unmatched.map((e) => ({ ref: `r:${e.id}`, transponder: e.transponder_code, loop: e.loop_code, at: usToIso(e.detected_us) })),
        unknownLoops: c.unknownLoops,
      };
    });
  });

  /** Raw events in the session window, for review. */
  app.get('/sessions/:id/events', async (req) => {
    const id = params(req);
    await staffFor(req.principal, venueOf.session(db, id));
    const s = await one<SessionRow>(db, `SELECT ${SESSION_COLUMNS} FROM sessions s WHERE s.id = $1`, [id]);
    if (s.started_us === null) return { events: [] };
    const from = s.started_us + Number(s.clock_offset_us) - 60_000_000;
    const to = s.ended_us === null ? Number.MAX_SAFE_INTEGER : s.ended_us + Number(s.clock_offset_us) + 600_000_000;
    const rows = await many<Record<string, any>>(
      db,
      `SELECT e.id, e.transponder_code, e.loop_code, e.detected_us, e.sequence, e.received_at, d.name AS device
         FROM raw_timing_events e JOIN timing_devices d ON d.id = e.device_id
        WHERE d.track_id = $1 AND e.detected_us BETWEEN $2 AND $3 ORDER BY e.detected_us, e.id LIMIT 20000`,
      [s.track_id, from, to],
    );
    return {
      events: rows.map((e) => ({
        ref: `r:${e.id}`,
        transponder: e.transponder_code,
        loop: e.loop_code,
        detectedAt: usToIso(e.detected_us),
        sequence: e.sequence,
        receivedAt: e.received_at,
        device: e.device,
      })),
    };
  });

  // ── CSV import / export ─────────────────────────────────────────────────
  /**
   * Import a passings CSV for a track. Events go through the same idempotent ingest path as live
   * decoder events, attributed to the track's "CSV import" device. Optionally sets the session's
   * start/finish from the file (for sessions that ran without the live integration).
   */
  app.post('/imports/passings', { bodyLimit: 20 * 1024 * 1024 }, async (req) => {
    const b = parse(
      z.object({
        trackId: uuid,
        csv: z.string().min(1),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        timeZone: z.string().optional(),
        defaultLoop: z.string().optional(),
        columns: z.object({ transponder: z.string(), timestamp: z.string(), loop: z.string(), sequence: z.string() }).partial().optional(),
        sessionId: uuid.optional(),
        setSessionWindowFromFile: z.boolean().default(false),
      }),
      req.body,
    );
    const venueId = await venueOf.track(db, b.trackId);
    const u = await staffFor(req.principal, venueId);
    const tz = b.timeZone ?? (await one<{ timezone: string }>(db, 'SELECT timezone FROM venues WHERE id = $1', [venueId])).timezone;
    // Rows without a loop column are start/finish crossings: default to the track's finish loop code.
    const finishLoops = await many<{ code: string }>(db, `SELECT code FROM timing_loops WHERE track_id = $1 AND role = 'finish'`, [b.trackId]);
    const defaultLoop = b.defaultLoop ?? (finishLoops.length === 1 ? finishLoops[0].code : 'finish');
    const { passings, errors } = csvToPassings(b.csv, { timeZone: tz, date: b.date, defaultLoop, columns: b.columns });
    if (!passings.length) throw new HttpError(400, `No valid rows: ${errors.slice(0, 5).map((e) => `row ${e.row}: ${e.message}`).join('; ')}`, 'invalid');

    const device =
      (await db.query(`SELECT id FROM timing_devices WHERE track_id = $1 AND provider = 'csv-import'`, [b.trackId])).rows[0] ??
      (await one(db, `INSERT INTO timing_devices (venue_id, track_id, name, provider) VALUES ($1, $2, 'CSV import', 'csv-import') RETURNING id`, [
        venueId,
        b.trackId,
      ]));

    if (b.sessionId && b.setSessionWindowFromFile) {
      const s = await one<{ status: string; track_id: string }>(db, 'SELECT status, track_id FROM sessions WHERE id = $1', [b.sessionId]);
      if (s.track_id !== b.trackId) throw new HttpError(400, 'Session is on a different track', 'invalid');
      if (s.status !== 'scheduled') throw new HttpError(409, 'Session window can only be set from a file for a scheduled session', 'bad_state');
      // The file has no start signal, so lap 1 can't be timed from the start: time from the first crossing.
      const rules = await one<{ start_mode: string | null }>(db, `SELECT rules->>'startMode' AS start_mode FROM sessions WHERE id = $1`, [b.sessionId]);
      if (rules.start_mode === 'session_start') {
        await db.query(`UPDATE sessions SET rules = rules || '{"startMode":"first_crossing"}' WHERE id = $1`, [b.sessionId]);
        await audit(db, u, 'session.rules', 'session', b.sessionId, {
          before: { startMode: 'session_start' },
          after: { startMode: 'first_crossing' },
          reason: 'Session window taken from an import file: no start signal available',
        });
      }
      const times = passings.map((p) => p.detectedUs);
      const startAt = usToIso(Math.min(...times) - 1_000_000);
      const endAt = usToIso(Math.max(...times));
      await withTx(db, async (t) => {
        await startSession(t, u, b.sessionId!, startAt);
      });
      // Ingest before finishing so the chequered-flag logic sees every crossing.
      const result = await ingestPassings(db, device.id, passings);
      await withTx(db, (t) => finishSession(t, u, b.sessionId!, endAt));
      await audit(db, u, 'import.passings', 'track', b.trackId, { after: { rows: passings.length, accepted: result.accepted, sessionId: b.sessionId } });
      return { ...result, rowErrors: errors, sessionWindow: { startedAt: startAt, endedAt: endAt } };
    }

    const result = await ingestPassings(db, device.id, passings);
    await audit(db, u, 'import.passings', 'track', b.trackId, { after: { rows: passings.length, accepted: result.accepted } });
    return { ...result, rowErrors: errors };
  });

  app.get('/sessions/:id/export.csv', async (req, reply) => {
    const id = params(req);
    await staffFor(req.principal, venueOf.session(db, id));
    const q = parse(z.object({ type: z.enum(['results', 'laps']).default('results') }), req.query);
    const viewer = { driverId: null, staff: true };
    let csv: string;
    if (q.type === 'results') {
      const r = await sessionLeaderboard(db, id, viewer);
      csv = toCsv([
        ['session', 'result_status', 'position', 'driver', 'team', 'karts', 'laps', 'best_lap', 'best_lap_number', 'average_lap', 'gap'],
        ...r.entries.map((e) => [
          r.session.name,
          r.resultStatus,
          e.position ?? (e.disqualified ? 'DQ' : ''),
          e.driver?.name,
          e.teamName,
          e.karts,
          e.lapsCompleted,
          e.bestLap?.display,
          e.bestLapNumber,
          e.averageLap?.display,
          e.gap ? ('laps' in e.gap ? `+${e.gap.laps} lap(s)` : e.gap.display) : '',
        ]),
      ]);
    } else {
      const laps = await sessionLaps(db, id, viewer);
      csv = toCsv([
        ['participant_id', 'driver', 'kart', 'lap', 'lap_time', 'lap_time_us', 'valid', 'flags', 'ended_at'],
        ...laps.map((l) => [l.participantId, l.driver?.name, l.kart, l.lapNumber, l.lapTime?.display, l.lapTime?.us, l.valid, l.flags.join('|'), l.endedAt]),
      ]);
    }
    reply.header('Content-Type', 'text/csv; charset=utf-8').header('Content-Disposition', `attachment; filename="session-${id}-${q.type}.csv"`);
    return csv;
  });

  app.get('/audit', async (req) => {
    const u = requireUser(req.principal, 'operator', 'admin');
    const q = parse(z.object({ entityType: z.string().optional(), entityId: z.string().optional(), limit: z.coerce.number().int().min(1).max(500).default(100) }), req.query);
    // Operators may read the trail of their own venue's sessions; the full log is admin-only.
    if (u.role === 'operator') {
      if (q.entityType !== 'session' || !q.entityId) throw new HttpError(403, 'Operators can view the audit trail per session', 'forbidden');
      await staffFor(u, venueOf.session(db, q.entityId));
    }
    return {
      entries: await many(
        db,
        `SELECT a.*, u.email AS actor_email FROM audit_log a LEFT JOIN users u ON u.id = a.actor_user_id
          WHERE ($1::text IS NULL OR a.entity_type = $1) AND ($2::text IS NULL OR a.entity_id = $2)
          ORDER BY a.at DESC LIMIT $3`,
        [q.entityType ?? null, q.entityId ?? null, q.limit],
      ),
    };
  });
}
