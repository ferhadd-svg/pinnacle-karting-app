import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { hashPassword, isStaff, requireUser, verifyPassword, type Principal } from '../auth.js';
import { HttpError, many, one, withTx } from '../db.js';
import { isoDate, parse, params, uuid, type AppContext } from '../http.js';
import {
  driverProfile,
  driverSessions,
  getSession,
  listSessions,
  personalBests,
  sessionLaps,
  sessionLeaderboard,
  trackLeaderboard,
  trackRecords,
  type Viewer,
} from '../services/queries.js';

const viewerOf = (p: Principal | null): Viewer => ({
  driverId: p?.kind === 'user' ? p.driverId : null,
  staff: isStaff(p),
});

/** A driver's history is visible to the driver, staff, and — if they opted in — everyone. */
async function assertCanViewDriver(ctx: AppContext, p: Principal | null, driverId: string) {
  if (isStaff(p) || (p?.kind === 'user' && p.driverId === driverId)) return;
  const d = await one<{ show_on_leaderboards: boolean }>(ctx.db, 'SELECT show_on_leaderboards FROM drivers WHERE id = $1', [driverId]);
  if (!d.show_on_leaderboards) throw new HttpError(403, 'This driver profile is private', 'forbidden');
}

export function publicRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db } = ctx;

  // ── Auth ────────────────────────────────────────────────────────────────
  app.post('/auth/register', async (req, reply) => {
    const body = parse(
      z.object({ email: z.string().email(), password: z.string().min(8).max(200), displayName: z.string().trim().min(1).max(60), birthYear: z.number().int().optional() }),
      req.body,
    );
    const result = await withTx(db, async (tx) => {
      const exists = await tx.query('SELECT 1 FROM users WHERE lower(email) = lower($1)', [body.email]);
      if (exists.rowCount) throw new HttpError(409, 'Email already registered', 'conflict');
      const u = await one<{ id: string }>(tx, `INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id`, [
        body.email,
        await hashPassword(body.password),
      ]);
      const d = await one<{ id: string }>(tx, 'INSERT INTO drivers (user_id, display_name, birth_year) VALUES ($1, $2, $3) RETURNING id', [
        u.id,
        body.displayName,
        body.birthYear ?? null,
      ]);
      return { userId: u.id, driverId: d.id };
    });
    const token = await ctx.issueToken({ ...result, role: 'driver', venueId: null });
    reply.code(201);
    return { token, user: { id: result.userId, role: 'driver', driverId: result.driverId } };
  });

  app.post('/auth/login', async (req) => {
    const body = parse(z.object({ email: z.string(), password: z.string() }), req.body);
    const r = await db.query(
      `SELECT u.id, u.password_hash, u.role, u.venue_id, d.id AS driver_id FROM users u LEFT JOIN drivers d ON d.user_id = u.id
        WHERE lower(u.email) = lower($1) AND u.disabled_at IS NULL`,
      [body.email],
    );
    const u = r.rows[0];
    if (!u || !(await verifyPassword(body.password, u.password_hash))) throw new HttpError(401, 'Incorrect email or password', 'unauthorized');
    const token = await ctx.issueToken({ userId: u.id, role: u.role, venueId: u.venue_id, driverId: u.driver_id });
    return { token, user: { id: u.id, role: u.role, venueId: u.venue_id, driverId: u.driver_id } };
  });

  app.get('/me', async (req) => {
    const u = requireUser(req.principal);
    const row = await one<Record<string, any>>(
      db,
      `SELECT u.id, u.email, u.role, u.venue_id, d.id AS driver_id, d.display_name, d.show_on_leaderboards, d.member_code
         FROM users u LEFT JOIN drivers d ON d.user_id = u.id WHERE u.id = $1`,
      [u.userId],
    );
    return {
      id: row.id,
      email: row.email,
      role: row.role,
      venueId: row.venue_id,
      driver: row.driver_id
        ? { id: row.driver_id, name: row.display_name, showOnLeaderboards: row.show_on_leaderboards, memberCode: row.member_code }
        : null,
    };
  });

  app.patch('/me/driver', async (req) => {
    const u = requireUser(req.principal);
    if (!u.driverId) throw new HttpError(404, 'No driver profile', 'not_found');
    const body = parse(z.object({ displayName: z.string().trim().min(1).max(60).optional(), showOnLeaderboards: z.boolean().optional() }), req.body);
    await db.query(
      `UPDATE drivers SET display_name = coalesce($2, display_name), show_on_leaderboards = coalesce($3, show_on_leaderboards) WHERE id = $1`,
      [u.driverId, body.displayName ?? null, body.showOnLeaderboards ?? null],
    );
    return driverProfile(db, u.driverId, viewerOf(u));
  });

  // ── Venues & tracks ─────────────────────────────────────────────────────
  app.get('/venues', async () =>
    many(db, `SELECT v.id, v.name, v.timezone,
                     coalesce(json_agg(json_build_object('id', t.id, 'name', t.name, 'layout', t.layout, 'lengthM', t.length_m))
                              FILTER (WHERE t.id IS NOT NULL AND t.active), '[]') AS tracks
                FROM venues v LEFT JOIN tracks t ON t.venue_id = v.id GROUP BY v.id ORDER BY v.name`),
  );

  app.get('/tracks/:id/leaderboard', async (req) => {
    const q = parse(z.object({ period: z.enum(['day', 'week', 'month', 'all']).default('all'), classId: uuid.optional(), limit: z.coerce.number().int().min(1).max(200).default(50) }), req.query);
    return trackLeaderboard(db, params(req), q.period, q.classId ?? null, viewerOf(req.principal), q.limit);
  });

  app.get('/tracks/:id/records', async (req) => ({ records: await trackRecords(db, params(req)) }));

  // ── Sessions ────────────────────────────────────────────────────────────
  app.get('/sessions', async (req) => {
    const q = parse(
      z.object({
        venueId: uuid.optional(),
        trackId: uuid.optional(),
        status: z.enum(['scheduled', 'running', 'finished', 'final', 'cancelled']).optional(),
        type: z.enum(['practice', 'rental', 'qualifying', 'sprint', 'endurance']).optional(),
        from: isoDate.optional(),
        to: isoDate.optional(),
        limit: z.coerce.number().int().min(1).max(200).default(50),
      }),
      req.query,
    );
    return { sessions: await listSessions(db, q) };
  });

  app.get('/sessions/:id', async (req) => getSession(db, params(req)));

  app.get('/sessions/:id/leaderboard', async (req) => sessionLeaderboard(db, params(req), viewerOf(req.principal)));

  app.get('/sessions/:id/laps', async (req) => {
    const q = parse(z.object({ participantId: uuid.optional() }), req.query);
    const id = params(req);
    const session = await getSession(db, id);
    return { resultStatus: session.resultStatus, laps: await sessionLaps(db, id, viewerOf(req.principal), q.participantId) };
  });

  // Server-sent events: pushes a small "results changed" message; clients refetch the leaderboard.
  app.get('/sessions/:id/stream', async (req, reply) => {
    const id = params(req);
    const session = await getSession(db, id);
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': (req.headers.origin as string) ?? '*',
    });
    const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    send('hello', { sessionId: id, version: session.resultsVersion, resultStatus: session.resultStatus });
    const onChange = (m: unknown) => send('results', m);
    ctx.realtime?.on(`session:${id}`, onChange);
    const ping = setInterval(() => res.write(': ping\n\n'), 15_000);
    req.raw.on('close', () => {
      clearInterval(ping);
      ctx.realtime?.off(`session:${id}`, onChange);
    });
  });

  // ── Drivers ─────────────────────────────────────────────────────────────
  app.get('/drivers/:id', async (req) => {
    const id = params(req);
    await assertCanViewDriver(ctx, req.principal, id);
    return driverProfile(db, id, viewerOf(req.principal));
  });

  app.get('/drivers/:id/sessions', async (req) => {
    const id = params(req);
    await assertCanViewDriver(ctx, req.principal, id);
    const q = parse(
      z.object({
        venueId: uuid.optional(),
        trackId: uuid.optional(),
        type: z.enum(['practice', 'rental', 'qualifying', 'sprint', 'endurance']).optional(),
        kart: z.string().optional(),
        from: isoDate.optional(),
        to: isoDate.optional(),
        limit: z.coerce.number().int().min(1).max(200).default(50),
      }),
      req.query,
    );
    return { sessions: await driverSessions(db, id, { ...q, kartNumber: q.kart }) };
  });

  app.get('/drivers/:id/personal-best', async (req) => {
    const id = params(req);
    await assertCanViewDriver(ctx, req.principal, id);
    return { personalBests: await personalBests(db, id) };
  });
}
