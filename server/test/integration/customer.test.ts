import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { at, client, sendEvents, setupWorld, startedSession, type World } from './helpers.js';

let w: World;
let productId: string;
let rewardSmall: string;
let rewardBig: string;
let waiverId: string;
const users: Record<string, { token: string; driverId: string; code: string }> = {};

async function register(name: string, email: string, birthYear?: number) {
  const r = await client(w, null).post('/v1/auth/register', { email, password: 'password123', displayName: name, birthYear }, 201);
  const me = await client(w, r.token).get('/v1/me');
  users[name] = { token: r.token, driverId: me.driver.id, code: me.driver.memberCode };
  return users[name];
}
const as = (name: string) => client(w, users[name].token);

beforeAll(async () => {
  w = await setupWorld();
  productId = (
    await w.db.query(`INSERT INTO products (venue_id, name, session_type, price_sen) VALUES ($1, 'Grand Prix', 'sprint', 16000) RETURNING id`, [w.venueId])
  ).rows[0].id;
  waiverId = (await w.db.query(`INSERT INTO waiver_templates (venue_id, version, title, body) VALUES ($1, 1, 'Waiver', 'Terms') RETURNING id`, [w.venueId])).rows[0].id;
  rewardSmall = (await w.db.query(`INSERT INTO reward_items (venue_id, name, cost_tokens) VALUES ($1, 'Drink', 20) RETURNING id`, [w.venueId])).rows[0].id;
  rewardBig = (await w.db.query(`INSERT INTO reward_items (venue_id, name, cost_tokens) VALUES ($1, 'Cap', 500) RETURNING id`, [w.venueId])).rows[0].id;
  await register('Farah', 'farah@example.com');
  await register('Ben', 'ben@example.com');
  await register('Kid', 'kid@example.com', new Date().getFullYear() - 12);
});
afterAll(() => w.close());

describe('digital waiver', () => {
  it('is signed in the app and visible to staff at check-in', async () => {
    const tpl = await client(w, null).get(`/v1/venues/${w.venueId}/waiver`);
    expect(tpl).toMatchObject({ id: waiverId, version: 1, title: 'Waiver' });
    const before = await client(w).get(`/v1/drivers/by-code/${users.Farah.code}?venueId=${w.venueId}`);
    expect(before.waiver.valid).toBe(false);

    await as('Farah').post('/v1/me/waivers', { templateId: waiverId, signedName: 'Farah Aziz', accept: true }, 201);
    const after = await client(w).get(`/v1/drivers/by-code/${users.Farah.code}?venueId=${w.venueId}`);
    expect(after.waiver).toMatchObject({ valid: true, version: 1 });
    expect((await as('Farah').get('/v1/me/waivers')).waivers[0]).toMatchObject({ valid: true });
  });

  it('requires a guardian for under-18s and must be explicitly accepted', async () => {
    const r = await as('Kid').post('/v1/me/waivers', { templateId: waiverId, signedName: 'Kid', accept: true }, 400);
    expect(r.error).toBe('guardian_required');
    await as('Kid').post('/v1/me/waivers', { templateId: waiverId, signedName: 'Kid', guardianName: 'Parent', accept: true }, 201);
    await as('Ben').post('/v1/me/waivers', { templateId: waiverId, signedName: 'Ben' }, 400);
  });

  it('a new waiver version invalidates old signatures', async () => {
    await w.db.query(`UPDATE waiver_templates SET active = false WHERE id = $1`, [waiverId]);
    const v2 = (await w.db.query(`INSERT INTO waiver_templates (venue_id, version, title, body) VALUES ($1, 2, 'Waiver v2', 'New terms') RETURNING id`, [w.venueId])).rows[0].id;
    expect((await as('Farah').get('/v1/me/waivers')).waivers[0].valid).toBe(false);
    await as('Farah').post('/v1/me/waivers', { templateId: waiverId, signedName: 'Farah', accept: true }, 409);
    await as('Farah').post('/v1/me/waivers', { templateId: v2, signedName: 'Farah Aziz', accept: true }, 201);
    expect((await as('Farah').get('/v1/me/waivers')).waivers[0]).toMatchObject({ valid: true, version: 2 });
  });
});

describe('tickets', () => {
  let ticketId: string;

  it('buys tickets in the app: order → payment → tickets in wallet, receipt and tokens', async () => {
    const r = await as('Farah').post('/v1/orders', { venueId: w.venueId, items: [{ productId, quantity: 2 }] }, 201);
    expect(r.order).toMatchObject({ status: 'pending', totalSen: 32000, currency: 'MYR' });
    expect(r.payment).toEqual({ provider: 'demo', demo: true });

    await as('Ben').post(`/v1/orders/${r.order.id}/pay-demo`, {}, 404); // not Ben's order
    await as('Farah').post(`/v1/orders/${r.order.id}/pay-demo`);
    await as('Farah').post(`/v1/orders/${r.order.id}/pay-demo`); // confirming twice is harmless

    const tickets = (await as('Farah').get('/v1/me/tickets')).tickets;
    expect(tickets).toHaveLength(2);
    expect(tickets[0]).toMatchObject({ status: 'active', productName: 'Grand Prix', code: expect.stringMatching(/^[A-Z2-9]{8}$/) });
    ticketId = tickets[0].id;

    const orders = (await as('Farah').get('/v1/me/orders')).orders;
    expect(orders[0]).toMatchObject({ status: 'paid', totalSen: 32000, items: [{ name: 'Grand Prix', quantity: 2, unitPriceSen: 16000 }] });
    const rewards = await as('Farah').get('/v1/me/rewards');
    expect(rewards.balance).toBe(32); // 1 token per RM10
  });

  it('refuses in-app purchase when no payment provider is configured', async () => {
    const app = await buildApp({ db: w.db, jwtSecret: 'test-secret', logLevel: 'silent', paymentsProvider: 'none' });
    const r = await app.inject({
      method: 'POST',
      url: '/v1/orders',
      headers: { authorization: `Bearer ${users.Farah.token}` },
      payload: { venueId: w.venueId, items: [{ productId, quantity: 1 }] },
    });
    expect(r.statusCode).toBe(503);
    expect((await app.inject({ method: 'POST', url: '/v1/orders/00000000-0000-0000-0000-000000000000/pay-demo', headers: { authorization: `Bearer ${users.Farah.token}` } })).statusCode).toBe(404);
    await app.close();
  });

  it('redeems a ticket bought at the kiosk with its printed code (once)', async () => {
    const issued = await client(w).post('/v1/tickets/issue', { productId, quantity: 1 }, 201);
    const printed = issued.tickets[0].code as string;
    const typed = `${printed.slice(0, 4).toLowerCase()}-${printed.slice(4)}`;
    const t = await as('Ben').post('/v1/me/tickets/redeem', { code: typed });
    expect(t).toMatchObject({ code: printed, productName: 'Grand Prix' });
    await as('Farah').post('/v1/me/tickets/redeem', { code: printed }, 409);
    await as('Ben').post('/v1/tickets/issue', { productId, quantity: 1 }, 403);
  });

  it('transfers a ticket to another member by member code', async () => {
    await as('Farah').post(`/v1/tickets/${ticketId}/transfer`, { memberCode: users.Farah.code }, 400);
    const r = await as('Farah').post(`/v1/tickets/${ticketId}/transfer`, { memberCode: users.Ben.code });
    expect(r.to.name).toBe('Ben');
    expect((await as('Ben').get('/v1/me/tickets')).tickets.map((t: any) => t.id)).toContain(ticketId);
    expect((await as('Farah').get('/v1/me/tickets')).tickets.map((t: any) => t.id)).not.toContain(ticketId);
    await as('Farah').post(`/v1/tickets/${ticketId}/transfer`, { memberCode: users.Ben.code }, 403);
  });

  it('is used once at check-in by staff', async () => {
    const t = (await as('Ben').get('/v1/me/tickets')).tickets.find((x: any) => x.id === ticketId);
    const used = await client(w).post('/v1/tickets/use', { code: t.code });
    expect(used.status).toBe('used');
    await client(w).post('/v1/tickets/use', { code: t.code }, 409);
    await as('Ben').post(`/v1/tickets/${ticketId}/transfer`, { memberCode: users.Farah.code }, 409);
    await as('Ben').post('/v1/tickets/use', { code: t.code }, 403);
  });
});

describe('reward tokens', () => {
  it('awards participation and podium tokens on finalisation, once', async () => {
    const api = client(w);
    const { id } = await api.post('/v1/sessions', { trackId: w.trackId, type: 'rental', name: 'Token race' });
    await api.post(`/v1/sessions/${id}/participants`, { kartId: w.karts['01'], memberCode: users.Ben.code });
    await api.post(`/v1/sessions/${id}/participants`, { kartId: w.karts['02'], driverName: 'Walk-in' });
    await api.post(`/v1/sessions/${id}/start`, { at: at('10:00:00.000') });
    await sendEvents(w, [
      { transponder: 'T101', clock: '10:00:10.000' },
      { transponder: 'T101', clock: '10:01:10.000' },
      { transponder: 'T102', clock: '10:00:12.000' },
      { transponder: 'T102', clock: '10:01:15.000' },
    ]);
    await api.post(`/v1/sessions/${id}/finish`, { at: at('10:01:30.000') });
    const before = (await as('Ben').get('/v1/me/rewards')).balance;
    await api.post(`/v1/sessions/${id}/finalize`);
    const after = await as('Ben').get('/v1/me/rewards');
    expect(after.balance - before).toBe(15); // 10 participation + 5 podium
    expect(after.ledger.slice(0, 2).map((l: any) => l.reason).sort()).toEqual(['Podium P1: Token race', 'Raced: Token race']);

    await api.post(`/v1/sessions/${id}/reopen`, { reason: 'check' });
    await api.post(`/v1/sessions/${id}/finalize`);
    expect((await as('Ben').get('/v1/me/rewards')).balance).toBe(after.balance);
  });

  it('redeems rewards from the balance and staff hand them over with the voucher code', async () => {
    const start = (await as('Farah').get('/v1/me/rewards')).balance; // 32 from the purchase
    const big = await as('Farah').post('/v1/me/rewards/redeem', { itemId: rewardBig }, 409);
    expect(big.error).toBe('insufficient_tokens');
    const v = await as('Farah').post('/v1/me/rewards/redeem', { itemId: rewardSmall }, 201);
    expect(v).toMatchObject({ name: 'Drink', costTokens: 20, balance: start - 20, code: expect.stringMatching(/^[A-Z2-9]{8}$/) });
    await client(w).post('/v1/reward-redemptions/fulfil', { code: v.code });
    await client(w).post('/v1/reward-redemptions/fulfil', { code: v.code }, 404);
    const r = await as('Farah').get('/v1/me/rewards');
    expect(r.redemptions[0]).toMatchObject({ status: 'fulfilled', name: 'Drink' });
  });

  it('never lets two simultaneous redemptions overspend', async () => {
    const balance = (await as('Farah').get('/v1/me/rewards')).balance; // 12: one more 20-token reward is not affordable
    await w.db.query(`INSERT INTO token_ledger (driver_id, delta, reason, ref) VALUES ($1, $2, 'Test top-up', 'test:topup')`, [users.Farah.driverId, 20 - balance + 5]);
    const results = await Promise.all(
      [1, 2, 3].map(() =>
        w.app.inject({ method: 'POST', url: '/v1/me/rewards/redeem', headers: { authorization: `Bearer ${users.Farah.token}` }, payload: { itemId: rewardSmall } }),
      ),
    );
    expect(results.map((r) => r.statusCode).sort()).toEqual([201, 409, 409]);
    expect((await as('Farah').get('/v1/me/rewards')).balance).toBe(5);
  });
});

describe('friends', () => {
  it('adds a friend by member code, accepts, compares, removes', async () => {
    const req = await as('Farah').post('/v1/me/friends', { memberCode: users.Ben.code }, 201);
    expect(req.status).toBe('pending');
    expect((await as('Ben').get('/v1/me/friends')).friends).toEqual([{ driverId: users.Farah.driverId, name: 'Farah', status: 'pending', direction: 'incoming' }]);
    await as('Ben').post(`/v1/me/friends/${users.Farah.driverId}/accept`);
    expect((await as('Farah').get('/v1/me/friends')).friends[0]).toMatchObject({ name: 'Ben', status: 'accepted', direction: 'friends' });

    // Farah drives a final session; Ben (private) already has one. Kid isn't a friend.
    await as('Ben').patch('/v1/me/driver', { showOnLeaderboards: false });
    const s = await startedSession(w, { '03': 'placeholder' }, '11:00:00.000');
    await w.db.query('UPDATE session_participants SET driver_id = $1 WHERE id = $2', [users.Farah.driverId, s.participants['03'].participantId]);
    await sendEvents(w, [
      { transponder: 'T103', clock: '11:00:10.000' },
      { transponder: 'T103', clock: '11:01:12.500' },
    ]);
    await client(w).post(`/v1/sessions/${s.id}/finish`, { at: at('11:01:30.000') });
    await client(w).post(`/v1/sessions/${s.id}/finalize`);

    const board = (await as('Farah').get(`/v1/me/friends/leaderboard?trackId=${w.trackId}`)).entries;
    expect(board.map((e: any) => [e.driver.name, e.lapTime.display, e.isYou])).toEqual([
      ['Ben', '1:00.000', false],
      ['Farah', '1:02.500', true],
    ]);
    // Adding twice or adding yourself is harmless/refused.
    expect((await as('Ben').post('/v1/me/friends', { memberCode: users.Farah.code }, 201)).status).toBe('accepted');
    await as('Farah').post('/v1/me/friends', { memberCode: users.Farah.code }, 400);

    await as('Farah').del(`/v1/me/friends/${users.Ben.driverId}`);
    expect((await as('Ben').get('/v1/me/friends')).friends).toEqual([]);
  });
});
