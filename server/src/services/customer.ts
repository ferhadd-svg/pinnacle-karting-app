import type { UserPrincipal } from '../auth.js';
import { HttpError, many, one, type Queryable, type Tx } from '../db.js';
import { audit } from './audit.js';
import { formatLapUs } from '../timing/time.js';
import { driverByMemberCode, normalizeMemberCode } from './members.js';

// ── Reward rules (documented in docs/13-customer-app.md) ───────────────────
export const TOKENS = {
  /** Per RM10 spent on paid orders. */
  perRm10: 1,
  /** Each finalised session a member drove in. */
  participation: 10,
  /** Extra for P1–P3 in a finalised session. */
  podium: 5,
};

export async function tokenBalance(q: Queryable, driverId: string) {
  return Number((await q.query('SELECT coalesce(sum(delta), 0)::int AS b FROM token_ledger WHERE driver_id = $1', [driverId])).rows[0].b);
}

/** Idempotent: the same (driver, ref) is only ever credited once. */
export async function awardTokens(q: Queryable, driverId: string, delta: number, reason: string, ref: string) {
  if (delta === 0) return;
  await q.query(
    `INSERT INTO token_ledger (driver_id, delta, reason, ref) VALUES ($1, $2, $3, $4) ON CONFLICT (driver_id, ref) DO NOTHING`,
    [driverId, delta, reason, ref],
  );
}

/** Called when a session is finalised: tokens for every member who drove, plus a podium bonus. */
export async function awardSessionTokens(tx: Tx, sessionId: string) {
  const rows = await many<{ driver_id: string; position: number | null; name: string }>(
    tx,
    `SELECT DISTINCT d.id AS driver_id, r.position, s.name
       FROM session_participants p
       JOIN sessions s ON s.id = p.session_id
       LEFT JOIN session_results r ON r.participant_id = p.id
       JOIN drivers d ON d.id = p.driver_id OR d.id IN (SELECT l.driver_id FROM laps l WHERE l.participant_id = p.id)
      WHERE p.session_id = $1 AND d.user_id IS NOT NULL AND NOT coalesce(r.disqualified, false)`,
    [sessionId],
  );
  for (const r of rows) {
    await awardTokens(tx, r.driver_id, TOKENS.participation, `Raced: ${r.name}`, `session:${sessionId}:participation`);
    if (r.position !== null && r.position <= 3) await awardTokens(tx, r.driver_id, TOKENS.podium, `Podium P${r.position}: ${r.name}`, `session:${sessionId}:podium`);
  }
}

// ── Waivers ───────────────────────────────────────────────────────────────
export async function currentWaiver(q: Queryable, venueId: string) {
  const r = await q.query(
    `SELECT id, version, title, body, valid_days FROM waiver_templates WHERE venue_id = $1 AND active ORDER BY version DESC LIMIT 1`,
    [venueId],
  );
  if (!r.rowCount) throw new HttpError(404, 'This venue has no waiver set up', 'not_found');
  const w = r.rows[0];
  return { id: w.id as string, version: w.version as number, title: w.title as string, body: w.body as string, validDays: w.valid_days as number };
}

/** Latest valid signature of the venue's current waiver version, if any. */
export async function waiverStatus(q: Queryable, driverId: string, venueId: string) {
  const r = await q.query(
    `SELECT s.signed_at, s.expires_at, t.version, (t.version = (SELECT max(version) FROM waiver_templates WHERE venue_id = $2 AND active)) AS current
       FROM waiver_signatures s JOIN waiver_templates t ON t.id = s.template_id
      WHERE s.driver_id = $1 AND t.venue_id = $2 AND s.expires_at > now()
      ORDER BY t.version DESC, s.signed_at DESC LIMIT 1`,
    [driverId, venueId],
  );
  const s = r.rows[0];
  return { valid: !!s?.current, signedAt: s?.signed_at ?? null, expiresAt: s?.expires_at ?? null, version: s?.version ?? null };
}

export async function signWaiver(
  tx: Tx,
  driverId: string,
  input: { templateId: string; signedName: string; guardianName?: string | null; userAgent?: string | null },
) {
  const t = await one<{ venue_id: string; valid_days: number; active: boolean }>(tx, 'SELECT venue_id, valid_days, active FROM waiver_templates WHERE id = $1', [
    input.templateId,
  ]);
  if (!t.active) throw new HttpError(409, 'This waiver version has been replaced; please sign the current one', 'stale_waiver');
  const d = await one<{ birth_year: number | null }>(tx, 'SELECT birth_year FROM drivers WHERE id = $1', [driverId]);
  const minor = d.birth_year !== null && new Date().getFullYear() - d.birth_year < 18;
  if (minor && !input.guardianName?.trim()) throw new HttpError(400, 'Drivers under 18 need a parent or guardian to sign', 'guardian_required');
  await tx.query(
    `INSERT INTO waiver_signatures (template_id, driver_id, signed_name, guardian_name, expires_at, user_agent)
     VALUES ($1, $2, $3, $4, now() + make_interval(days => $5), $6)`,
    [input.templateId, driverId, input.signedName.trim(), input.guardianName?.trim() || null, t.valid_days, input.userAgent ?? null],
  );
  return waiverStatus(tx, driverId, t.venue_id);
}

// ── Orders & tickets ──────────────────────────────────────────────────────
export async function createOrder(tx: Tx, user: UserPrincipal, venueId: string, items: { productId: string; quantity: number }[], provider: string) {
  if (!user.driverId) throw new HttpError(403, 'Only driver accounts can buy tickets', 'forbidden');
  const products = await many<{ id: string; name: string; price_sen: number }>(
    tx,
    'SELECT id, name, price_sen FROM products WHERE venue_id = $1 AND active AND id = ANY($2::uuid[])',
    [venueId, items.map((i) => i.productId)],
  );
  if (products.length !== new Set(items.map((i) => i.productId)).size) throw new HttpError(400, 'Unknown or unavailable product', 'invalid');
  const lines = items.map((i) => {
    const p = products.find((x) => x.id === i.productId)!;
    return { ...i, name: p.name, unitPriceSen: p.price_sen };
  });
  const total = lines.reduce((s, l) => s + l.unitPriceSen * l.quantity, 0);
  const order = await one<{ id: string }>(
    tx,
    `INSERT INTO orders (user_id, venue_id, total_sen, payment_provider) VALUES ($1, $2, $3, $4) RETURNING id`,
    [user.userId, venueId, total, provider],
  );
  for (const l of lines) {
    await tx.query('INSERT INTO order_items (order_id, product_id, name, unit_price_sen, quantity) VALUES ($1, $2, $3, $4, $5)', [
      order.id,
      l.productId,
      l.name,
      l.unitPriceSen,
      l.quantity,
    ]);
  }
  return order.id;
}

/**
 * Mark an order paid (called by the payment provider's confirmation), issue its tickets to the buyer
 * and award purchase tokens. Idempotent: confirming a paid order again does nothing.
 */
export async function confirmOrderPaid(tx: Tx, orderId: string, paymentRef: string) {
  const o = await one<{ status: string; venue_id: string; total_sen: number; driver_id: string }>(
    tx,
    `SELECT o.status, o.venue_id, o.total_sen, d.id AS driver_id FROM orders o JOIN drivers d ON d.user_id = o.user_id WHERE o.id = $1 FOR UPDATE OF o`,
    [orderId],
  );
  if (o.status === 'paid') return;
  if (o.status !== 'pending') throw new HttpError(409, `Order is ${o.status}`, 'bad_state');
  await tx.query(`UPDATE orders SET status = 'paid', paid_at = now(), payment_ref = $2 WHERE id = $1`, [orderId, paymentRef]);
  await tx.query(
    `INSERT INTO tickets (venue_id, product_id, order_id, owner_driver_id, claimed_at)
     SELECT $2, i.product_id, $1, $3, now() FROM order_items i, generate_series(1, i.quantity) WHERE i.order_id = $1`,
    [orderId, o.venue_id, o.driver_id],
  );
  await awardTokens(tx, o.driver_id, Math.floor(o.total_sen / 1000) * TOKENS.perRm10, 'Ticket purchase', `order:${orderId}`);
}

export async function myOrders(q: Queryable, userId: string) {
  return many(
    q,
    `SELECT o.id, o.status, o.total_sen AS "totalSen", o.currency, o.created_at AS "createdAt", o.paid_at AS "paidAt",
            o.payment_provider AS "paymentProvider", v.name AS "venueName",
            (SELECT json_agg(json_build_object('name', i.name, 'quantity', i.quantity, 'unitPriceSen', i.unit_price_sen) ORDER BY i.name)
               FROM order_items i WHERE i.order_id = o.id) AS items
       FROM orders o JOIN venues v ON v.id = o.venue_id
      WHERE o.user_id = $1 ORDER BY o.created_at DESC LIMIT 100`,
    [userId],
  );
}

const TICKET_SELECT = `
  SELECT t.id, t.code, t.status, t.issued_at AS "issuedAt", t.used_at AS "usedAt", t.order_id AS "orderId",
         p.name AS "productName", p.session_type AS "sessionType", p.description, v.id AS "venueId", v.name AS "venueName"
    FROM tickets t JOIN products p ON p.id = t.product_id JOIN venues v ON v.id = t.venue_id`;

export async function myTickets(q: Queryable, driverId: string) {
  return many(q, `${TICKET_SELECT} WHERE t.owner_driver_id = $1 ORDER BY (t.status = 'active') DESC, t.issued_at DESC LIMIT 200`, [driverId]);
}

/** Staff issue unclaimed tickets (kiosk/counter sales); the printed code is redeemed in the app. */
export async function issueTickets(tx: Tx, actor: UserPrincipal, productId: string, quantity: number) {
  const p = await one<{ venue_id: string }>(tx, 'SELECT venue_id FROM products WHERE id = $1', [productId]);
  const r = await tx.query(
    `INSERT INTO tickets (venue_id, product_id, issued_by) SELECT $1, $2, $3 FROM generate_series(1, $4) RETURNING id, code`,
    [p.venue_id, productId, actor.userId, quantity],
  );
  await audit(tx, actor, 'tickets.issue', 'product', productId, { after: { quantity, codes: r.rows.map((x) => x.code) } });
  return { venueId: p.venue_id, tickets: r.rows as { id: string; code: string }[] };
}

const normalizeCode = (code: string) => normalizeMemberCode(code);

export async function redeemTicketCode(tx: Tx, driverId: string, code: string) {
  const t = await tx.query('SELECT id, owner_driver_id, status FROM tickets WHERE code = $1 FOR UPDATE', [normalizeCode(code)]);
  if (!t.rowCount) throw new HttpError(404, 'No ticket with that code', 'not_found');
  const row = t.rows[0];
  if (row.owner_driver_id === driverId) throw new HttpError(409, 'This ticket is already in your wallet', 'conflict');
  if (row.owner_driver_id) throw new HttpError(409, 'This ticket has already been redeemed', 'conflict');
  if (row.status !== 'active') throw new HttpError(409, `This ticket is ${row.status}`, 'bad_state');
  await tx.query('UPDATE tickets SET owner_driver_id = $2, claimed_at = now() WHERE id = $1', [row.id, driverId]);
  return one(tx, `${TICKET_SELECT} WHERE t.id = $1`, [row.id]);
}

export async function transferTicket(tx: Tx, driverId: string, ticketId: string, memberCode: string) {
  const t = await one<{ owner_driver_id: string | null; status: string }>(tx, 'SELECT owner_driver_id, status FROM tickets WHERE id = $1 FOR UPDATE', [
    ticketId,
  ]);
  if (t.owner_driver_id !== driverId) throw new HttpError(403, 'Not your ticket', 'forbidden');
  if (t.status !== 'active') throw new HttpError(409, `This ticket is ${t.status}`, 'bad_state');
  const to = await driverByMemberCode(tx, memberCode);
  if (to.id === driverId) throw new HttpError(400, "That's your own member code", 'invalid');
  const hasAccount = (await tx.query('SELECT 1 FROM drivers WHERE id = $1 AND user_id IS NOT NULL', [to.id])).rowCount;
  if (!hasAccount) throw new HttpError(400, 'Tickets can only be sent to app members', 'invalid');
  await tx.query('UPDATE tickets SET owner_driver_id = $2 WHERE id = $1', [ticketId, to.id]);
  await tx.query('INSERT INTO ticket_transfers (ticket_id, from_driver_id, to_driver_id) VALUES ($1, $2, $3)', [ticketId, driverId, to.id]);
  return { to };
}

/** Staff scan a ticket at check-in. Optionally links it to the session entry it paid for. */
export async function useTicket(tx: Tx, actor: UserPrincipal, code: string, participantId?: string | null) {
  const t = await tx.query('SELECT id, code, status, venue_id FROM tickets WHERE code = $1 FOR UPDATE', [normalizeCode(code)]);
  if (!t.rowCount) throw new HttpError(404, 'No ticket with that code', 'not_found');
  const row = t.rows[0];
  if (actor.role === 'operator' && actor.venueId !== row.venue_id) throw new HttpError(403, 'Ticket is for another venue', 'forbidden');
  if (row.status !== 'active') throw new HttpError(409, `Ticket already ${row.status}`, 'bad_state');
  await tx.query(`UPDATE tickets SET status = 'used', used_at = now(), used_by = $2, participant_id = $3 WHERE id = $1`, [row.id, actor.userId, participantId ?? null]);
  await audit(tx, actor, 'ticket.use', 'ticket', row.id, { after: { code: row.code, participantId } });
  return one(tx, `${TICKET_SELECT} WHERE t.id = $1`, [row.id]);
}

// ── Rewards ───────────────────────────────────────────────────────────────
export async function myRewards(q: Queryable, driverId: string) {
  const [balance, ledger, items, redemptions] = await Promise.all([
    tokenBalance(q, driverId),
    many(q, `SELECT delta, reason, created_at AS "createdAt" FROM token_ledger WHERE driver_id = $1 ORDER BY created_at DESC, id DESC LIMIT 100`, [driverId]),
    many(
      q,
      `SELECT r.id, r.name, r.description, r.cost_tokens AS "costTokens", v.name AS "venueName"
         FROM reward_items r JOIN venues v ON v.id = r.venue_id WHERE r.active ORDER BY r.sort, r.cost_tokens`,
    ),
    many(
      q,
      `SELECT x.id, x.code, x.status, x.cost_tokens AS "costTokens", x.created_at AS "createdAt", r.name
         FROM reward_redemptions x JOIN reward_items r ON r.id = x.item_id WHERE x.driver_id = $1 ORDER BY x.created_at DESC LIMIT 50`,
      [driverId],
    ),
  ]);
  return { balance, ledger, items, redemptions, rules: TOKENS };
}

export async function redeemReward(tx: Tx, driverId: string, itemId: string) {
  // Lock the driver row so two redemptions can't both spend the same balance.
  await tx.query('SELECT 1 FROM drivers WHERE id = $1 FOR UPDATE', [driverId]);
  const item = await one<{ name: string; cost_tokens: number; active: boolean }>(tx, 'SELECT name, cost_tokens, active FROM reward_items WHERE id = $1', [itemId]);
  if (!item.active) throw new HttpError(409, 'This reward is no longer available', 'bad_state');
  const balance = await tokenBalance(tx, driverId);
  if (balance < item.cost_tokens) throw new HttpError(409, `Not enough tokens (${balance} of ${item.cost_tokens})`, 'insufficient_tokens');
  const r = await one<{ id: string; code: string }>(
    tx,
    'INSERT INTO reward_redemptions (item_id, driver_id, cost_tokens) VALUES ($1, $2, $3) RETURNING id, code',
    [itemId, driverId, item.cost_tokens],
  );
  await awardTokens(tx, driverId, -item.cost_tokens, `Redeemed: ${item.name}`, `redemption:${r.id}`);
  return { ...r, name: item.name, costTokens: item.cost_tokens, balance: balance - item.cost_tokens };
}

export async function fulfilRedemption(tx: Tx, actor: UserPrincipal, code: string) {
  const r = await tx.query(
    `UPDATE reward_redemptions SET status = 'fulfilled', fulfilled_at = now(), fulfilled_by = $2
      WHERE code = $1 AND status = 'pending' RETURNING id, item_id`,
    [normalizeCode(code), actor.userId],
  );
  if (!r.rowCount) throw new HttpError(404, 'No pending voucher with that code', 'not_found');
  await audit(tx, actor, 'reward.fulfil', 'reward_redemption', r.rows[0].id);
  return { ok: true };
}

// ── Friends ───────────────────────────────────────────────────────────────
export async function myFriends(q: Queryable, driverId: string) {
  return many(
    q,
    `SELECT CASE WHEN f.requester_id = $1 THEN f.addressee_id ELSE f.requester_id END AS "driverId",
            d.display_name AS name, f.status,
            CASE WHEN f.status = 'pending' AND f.addressee_id = $1 THEN 'incoming'
                 WHEN f.status = 'pending' THEN 'outgoing' ELSE 'friends' END AS direction
       FROM friendships f
       JOIN drivers d ON d.id = CASE WHEN f.requester_id = $1 THEN f.addressee_id ELSE f.requester_id END
      WHERE $1 IN (f.requester_id, f.addressee_id)
      ORDER BY f.status DESC, d.display_name`,
    [driverId],
  );
}

export async function addFriend(tx: Tx, driverId: string, memberCode: string) {
  const other = await driverByMemberCode(tx, memberCode);
  if (other.id === driverId) throw new HttpError(400, "That's your own member code", 'invalid');
  const existing = await tx.query(
    `SELECT requester_id, status FROM friendships WHERE LEAST(requester_id, addressee_id) = LEAST($1::uuid, $2::uuid)
        AND GREATEST(requester_id, addressee_id) = GREATEST($1::uuid, $2::uuid) FOR UPDATE`,
    [driverId, other.id],
  );
  if (existing.rowCount) {
    const e = existing.rows[0];
    // They already asked me: adding them back accepts.
    if (e.status === 'pending' && e.requester_id === other.id) {
      await tx.query(`UPDATE friendships SET status = 'accepted', accepted_at = now() WHERE requester_id = $1 AND addressee_id = $2`, [other.id, driverId]);
      return { friend: other, status: 'accepted' };
    }
    return { friend: other, status: e.status };
  }
  await tx.query('INSERT INTO friendships (requester_id, addressee_id) VALUES ($1, $2)', [driverId, other.id]);
  return { friend: other, status: 'pending' };
}

export async function acceptFriend(q: Queryable, driverId: string, requesterId: string) {
  const r = await q.query(
    `UPDATE friendships SET status = 'accepted', accepted_at = now() WHERE requester_id = $1 AND addressee_id = $2 AND status = 'pending'`,
    [requesterId, driverId],
  );
  if (!r.rowCount) throw new HttpError(404, 'No pending request from this driver', 'not_found');
}

export async function removeFriend(q: Queryable, driverId: string, otherId: string) {
  await q.query(
    `DELETE FROM friendships WHERE (requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1)`,
    [driverId, otherId],
  );
}

/** Best final lap on a track for me and my accepted friends (friends see each other even if private). */
export async function friendsLeaderboard(q: Queryable, driverId: string, trackId: string) {
  const rows = await many<Record<string, any>>(
    q,
    `WITH circle AS (
       SELECT $1::uuid AS id
       UNION SELECT CASE WHEN requester_id = $1 THEN addressee_id ELSE requester_id END
         FROM friendships WHERE status = 'accepted' AND $1 IN (requester_id, addressee_id)
     )
     SELECT DISTINCT ON (l.driver_id) l.driver_id, d.display_name, l.duration_us, l.session_id, s.started_at
       FROM laps l JOIN sessions s ON s.id = l.session_id JOIN drivers d ON d.id = l.driver_id
      WHERE l.driver_id IN (SELECT id FROM circle) AND s.track_id = $2 AND s.status = 'final' AND l.valid
      ORDER BY l.driver_id, l.duration_us, l.ended_us`,
    [driverId, trackId],
  );
  rows.sort((a, b) => a.duration_us - b.duration_us);
  return rows.map((r, i) => ({
    position: i + 1,
    driver: { id: r.driver_id, name: r.display_name },
    isYou: r.driver_id === driverId,
    lapTime: { us: Number(r.duration_us), display: formatLapUs(Number(r.duration_us)) },
    gapUs: Number(r.duration_us) - Number(rows[0].duration_us),
    sessionId: r.session_id,
    setAt: r.started_at,
  }));
}
