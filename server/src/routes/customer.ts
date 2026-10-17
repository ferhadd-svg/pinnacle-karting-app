import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { hashPassword, isStaff, requireStaffForVenue, requireUser, verifyPassword, type UserPrincipal } from '../auth.js';
import { HttpError, many, one, withTx } from '../db.js';
import { parse, params, uuid, type AppContext } from '../http.js';
import {
  acceptFriend,
  addFriend,
  confirmOrderPaid,
  createOrder,
  currentWaiver,
  friendsLeaderboard,
  fulfilRedemption,
  homeFeed,
  issueTickets,
  myFriends,
  myOrders,
  myRewards,
  myTickets,
  profile,
  redeemReward,
  redeemTicketCode,
  removeFriend,
  signWaiver,
  transferTicket,
  useTicket,
  waiverHistory,
  waiverStatus,
} from '../services/customer.js';
import { trackLeaderboard } from '../services/queries.js';

/** A signed-in account with a driver profile. */
function requireDriver(p: Parameters<typeof requireUser>[0]): UserPrincipal & { driverId: string } {
  const u = requireUser(p);
  if (!u.driverId) throw new HttpError(403, 'This needs a driver account', 'forbidden');
  return u as UserPrincipal & { driverId: string };
}

const code = z.string().trim().min(4).max(16);

export function customerRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db } = ctx;

  // ── Catalogue (public) ──────────────────────────────────────────────────
  app.get('/venues/:id/products', async (req) => ({
    products: await many(
      db,
      `SELECT id, name, description, session_type AS "sessionType", price_sen AS "priceSen", min_age AS "minAge", sessions
         FROM products WHERE venue_id = $1 AND active ORDER BY sort, price_sen`,
      [params(req)],
    ),
    payments: ctx.paymentsProvider,
  }));

  app.get('/venues/:id/waiver', async (req) => currentWaiver(db, params(req)));

  /** Home screen: promotions and every venue's monthly top 3. */
  app.get('/home', async (req) => {
    const p = req.principal;
    const viewer = { driverId: p?.kind === 'user' ? p.driverId : null, staff: isStaff(p) };
    return homeFeed(db, (trackId) => trackLeaderboard(db, trackId, 'month', null, viewer, 3));
  });

  /** Everything the Me screen shows in one call. */
  app.get('/me/profile', async (req) => profile(db, requireDriver(req.principal)));

  app.get('/me/waivers/history', async (req) => ({ signatures: await waiverHistory(db, requireDriver(req.principal).driverId) }));

  app.post('/me/password', async (req) => {
    const u = requireUser(req.principal);
    const b = parse(z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8).max(200) }), req.body);
    const row = await one<{ password_hash: string }>(db, 'SELECT password_hash FROM users WHERE id = $1', [u.userId]);
    if (!(await verifyPassword(b.currentPassword, row.password_hash))) throw new HttpError(400, 'Current password is incorrect', 'wrong_password');
    await db.query('UPDATE users SET password_hash = $2 WHERE id = $1', [u.userId, await hashPassword(b.newPassword)]);
    return { ok: true };
  });

  // ── Waivers ─────────────────────────────────────────────────────────────
  app.get('/me/waivers', async (req) => {
    const u = requireDriver(req.principal);
    const venues = await many<{ id: string; name: string }>(db, `SELECT DISTINCT v.id, v.name FROM venues v JOIN waiver_templates t ON t.venue_id = v.id WHERE t.active ORDER BY v.name`);
    return { waivers: await Promise.all(venues.map(async (v) => ({ venue: v, ...(await waiverStatus(db, u.driverId, v.id)) }))) };
  });

  app.post('/me/waivers', async (req, reply) => {
    const u = requireDriver(req.principal);
    const b = parse(
      z.object({ templateId: uuid, signedName: z.string().trim().min(2).max(100), guardianName: z.string().trim().max(100).optional(), accept: z.literal(true) }),
      req.body,
    );
    const status = await withTx(db, (t) => signWaiver(t, u.driverId, { ...b, userAgent: req.headers['user-agent'] ?? null }));
    reply.code(201);
    return status;
  });

  // ── Orders (in-app purchase) ────────────────────────────────────────────
  app.post('/orders', async (req, reply) => {
    const u = requireDriver(req.principal);
    if (ctx.paymentsProvider === 'none') throw new HttpError(503, 'In-app payment is not available yet. Please buy at the counter.', 'payments_unavailable');
    const b = parse(z.object({ venueId: uuid, items: z.array(z.object({ productId: uuid, quantity: z.number().int().min(1).max(20) })).min(1).max(10) }), req.body);
    const orderId = await withTx(db, (t) => createOrder(t, u, b.venueId, b.items, ctx.paymentsProvider));
    const order = await one(db, 'SELECT id, status, total_sen AS "totalSen", currency FROM orders WHERE id = $1', [orderId]);
    reply.code(201);
    // A real gateway would return its hosted checkout URL here.
    return { order, payment: { provider: ctx.paymentsProvider, demo: ctx.paymentsProvider === 'demo' } };
  });

  /** Demo provider only: confirm without charging. Refused unless PAYMENTS_PROVIDER=demo (never in production). */
  app.post('/orders/:id/pay-demo', async (req) => {
    const u = requireDriver(req.principal);
    if (ctx.paymentsProvider !== 'demo') throw new HttpError(404, 'Not found', 'not_found');
    const id = params(req);
    await withTx(db, async (t) => {
      const o = await one<{ user_id: string }>(t, 'SELECT user_id FROM orders WHERE id = $1', [id]);
      if (o.user_id !== u.userId) throw new HttpError(404, 'Order not found', 'not_found');
      await confirmOrderPaid(t, id, `demo:${id}`);
    });
    return { ok: true };
  });

  app.get('/me/orders', async (req) => ({ orders: await myOrders(db, requireDriver(req.principal).userId) }));

  // ── Tickets ─────────────────────────────────────────────────────────────
  app.get('/me/tickets', async (req) => ({ tickets: await myTickets(db, requireDriver(req.principal).driverId) }));

  app.post('/me/tickets/redeem', async (req) => {
    const u = requireDriver(req.principal);
    const b = parse(z.object({ code }), req.body);
    return withTx(db, (t) => redeemTicketCode(t, u.driverId, b.code));
  });

  app.post('/tickets/:id/transfer', async (req) => {
    const u = requireDriver(req.principal);
    const b = parse(z.object({ memberCode: code }), req.body);
    return withTx(db, (t) => transferTicket(t, u.driverId, params(req), b.memberCode));
  });

  /** Staff: sell at the counter/kiosk; the printed codes are redeemed in the app. */
  app.post('/tickets/issue', async (req, reply) => {
    const b = parse(z.object({ productId: uuid, quantity: z.number().int().min(1).max(50) }), req.body);
    const venue = await one<{ venue_id: string }>(db, 'SELECT venue_id FROM products WHERE id = $1', [b.productId]);
    const u = requireStaffForVenue(req.principal, venue.venue_id);
    reply.code(201);
    return withTx(db, (t) => issueTickets(t, u, b.productId, b.quantity));
  });

  /** Staff: scan a ticket at check-in. */
  app.post('/tickets/use', async (req) => {
    const u = requireUser(req.principal, 'operator', 'admin');
    const b = parse(z.object({ code, participantId: uuid.optional() }), req.body);
    return withTx(db, (t) => useTicket(t, u, b.code, b.participantId));
  });

  // ── Rewards ─────────────────────────────────────────────────────────────
  app.get('/me/rewards', async (req) => myRewards(db, requireDriver(req.principal).driverId));

  app.post('/me/rewards/redeem', async (req, reply) => {
    const u = requireDriver(req.principal);
    const b = parse(z.object({ itemId: uuid }), req.body);
    reply.code(201);
    return withTx(db, (t) => redeemReward(t, u.driverId, b.itemId));
  });

  app.post('/reward-redemptions/fulfil', async (req) => {
    const u = requireUser(req.principal, 'operator', 'admin');
    const b = parse(z.object({ code }), req.body);
    return withTx(db, (t) => fulfilRedemption(t, u, b.code));
  });

  // ── Friends ─────────────────────────────────────────────────────────────
  app.get('/me/friends', async (req) => ({ friends: await myFriends(db, requireDriver(req.principal).driverId) }));

  app.post('/me/friends', async (req, reply) => {
    const u = requireDriver(req.principal);
    const b = parse(z.object({ memberCode: code }), req.body);
    reply.code(201);
    return withTx(db, (t) => addFriend(t, u.driverId, b.memberCode));
  });

  app.post('/me/friends/:id/accept', async (req) => {
    await acceptFriend(db, requireDriver(req.principal).driverId, params(req));
    return { ok: true };
  });

  app.delete('/me/friends/:id', async (req) => {
    await removeFriend(db, requireDriver(req.principal).driverId, params(req));
    return { ok: true };
  });

  app.get('/me/friends/leaderboard', async (req) => {
    const u = requireDriver(req.principal);
    const q = parse(z.object({ trackId: uuid }), req.query);
    return { entries: await friendsLeaderboard(db, u.driverId, q.trackId) };
  });
}
