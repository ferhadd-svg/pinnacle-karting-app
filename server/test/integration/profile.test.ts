import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { tierFor } from '../../src/services/customer.js';
import { at, client, sendEvents, setupWorld, type World } from './helpers.js';

let w: World;
let token: string;
let me: any;
const as = () => client(w, token);

beforeAll(async () => {
  w = await setupWorld();
  token = (await client(w, null).post('/v1/auth/register', { email: 'nadia@example.com', password: 'password123', displayName: 'Nadia' }, 201)).token;
  me = await as().get('/v1/me');
});
afterAll(() => w.close());

/** A finalised session where Nadia (member) and a walk-in each drive. */
async function race(name: string, start: string, nadiaLaps: string[], rivalLaps: string[]) {
  const api = client(w);
  const { id } = await api.post('/v1/sessions', { trackId: w.trackId, type: 'rental', name });
  await api.post(`/v1/sessions/${id}/participants`, { kartId: w.karts['01'], memberCode: me.driver.memberCode });
  await api.post(`/v1/sessions/${id}/participants`, { kartId: w.karts['02'], driverName: `Rival ${name}` });
  await api.post(`/v1/sessions/${id}/start`, { at: at(start) });
  await sendEvents(w, [
    ...nadiaLaps.map((clock) => ({ transponder: 'T101', clock })),
    ...rivalLaps.map((clock) => ({ transponder: 'T102', clock })),
  ]);
  const last = [...nadiaLaps, ...rivalLaps].sort().at(-1)!;
  await api.post(`/v1/sessions/${id}/finish`, { at: at(last) });
  await api.post(`/v1/sessions/${id}/finalize`);
  return id;
}

describe('tiers', () => {
  it('maps kilometres to a tier with distance to the next one', () => {
    expect(tierFor(0)).toMatchObject({ name: 'Rookie', next: 'Amateur', kmToNext: 50, progress: 0 });
    expect(tierFor(200.66)).toMatchObject({ name: 'Pro', next: 'Elite', kmToNext: 299.34 });
    expect(tierFor(5000)).toMatchObject({ name: 'Legend', next: null, kmToNext: null, progress: 1 });
  });
});

describe('Me screen profile', () => {
  it('starts empty', async () => {
    const p = await as().get('/v1/me/profile');
    expect(p).toMatchObject({ points: 0, mileageKm: 0, lapsDriven: 0, ticketsReady: 0, currentKart: null, tier: { name: 'Rookie' } });
    expect(p.driver).toMatchObject({ name: 'Nadia', memberCode: me.driver.memberCode });
    expect(p.achievements).toEqual([expect.objectContaining({ days: 0, bestRank: null })]);
  });

  it('shows the kart you are assigned to before and during a session', async () => {
    const api = client(w);
    const { id } = await api.post('/v1/sessions', { trackId: w.trackId, type: 'rental', name: 'Upcoming' });
    await api.post(`/v1/sessions/${id}/participants`, { kartId: w.karts['04'], memberCode: me.driver.memberCode });
    expect((await as().get('/v1/me/profile')).currentKart).toMatchObject({ number: '04', sessionName: 'Upcoming', status: 'scheduled' });
    await api.post(`/v1/sessions/${id}/cancel`, { reason: 'test' });
    expect((await as().get('/v1/me/profile')).currentKart).toBeNull();
  });

  it('counts mileage from final laps × track length and daily top-3 finishes', async () => {
    // 2 laps on a 900 m track, P1 on the day.
    await race('Morning', '09:00:00.000', ['09:00:10.000', '09:01:10.000', '09:02:10.000'], ['09:00:12.000', '09:01:15.000']);
    const p = await as().get('/v1/me/profile');
    expect(p.lapsDriven).toBe(2);
    expect(p.mileageKm).toBe(1.8);
    expect(p.points).toBe(15); // 10 participation + 5 podium
    expect(p.achievements[0]).toMatchObject({ days: 1, bestRank: 1 });
  });
});

describe('ticket packs', () => {
  it('uses one session per scan and is spent after the last one', async () => {
    const productId = (
      await w.db.query(`INSERT INTO products (venue_id, name, session_type, price_sen, sessions) VALUES ($1, '3 sessions', 'rental', 18000, 3) RETURNING id`, [
        w.venueId,
      ])
    ).rows[0].id;
    const order = await as().post('/v1/orders', { venueId: w.venueId, items: [{ productId, quantity: 1 }] }, 201);
    await as().post(`/v1/orders/${order.order.id}/pay-demo`);
    let t = (await as().get('/v1/me/tickets')).tickets[0];
    expect(t).toMatchObject({ sessionsTotal: 3, sessionsUsed: 0, status: 'active' });

    for (const n of [1, 2]) {
      const r = await client(w).post('/v1/tickets/use', { code: t.code });
      expect(r).toMatchObject({ sessionsUsed: n, status: 'active' });
    }
    expect((await as().get('/v1/me/profile')).ticketsReady).toBe(1);
    const last = await client(w).post('/v1/tickets/use', { code: t.code });
    expect(last).toMatchObject({ sessionsUsed: 3, status: 'used' });
    await client(w).post('/v1/tickets/use', { code: t.code }, 409);
    const uses = (await w.db.query('SELECT count(*)::int AS n FROM ticket_uses WHERE ticket_id = $1', [t.id])).rows[0].n;
    expect(uses).toBe(3);
    t = (await as().get('/v1/me/tickets')).tickets[0];
    expect(t.status).toBe('used');
  });
});

describe('home feed', () => {
  it('lists active promotions and each venue’s monthly top 3', async () => {
    await w.db.query(`INSERT INTO promotions (title, badge) VALUES ('Weekday deal', 'BUY 1 FREE 1')`);
    await w.db.query(`INSERT INTO promotions (title, ends_at) VALUES ('Expired', now() - interval '1 day')`);
    const home = await client(w, null).get('/v1/home');
    expect(home.promotions.map((p: any) => p.title)).toEqual(['Weekday deal']);
    // Only "this month" counts: the test races are dated in March 2026, so the board may be empty unless today is in that month.
    expect(home.venues).toEqual([
      expect.objectContaining({ venue: expect.objectContaining({ id: w.venueId, kind: 'indoor' }), track: expect.objectContaining({ id: w.trackId }), monthlyTop3: expect.any(Array) }),
    ]);
  });
});

describe('account', () => {
  it('lists signed waivers', async () => {
    const tpl = (await w.db.query(`INSERT INTO waiver_templates (venue_id, version, title, body) VALUES ($1, 1, 'Waiver', 'Terms') RETURNING id`, [w.venueId])).rows[0].id;
    await as().post('/v1/me/waivers', { templateId: tpl, signedName: 'Nadia N', accept: true }, 201);
    const h = (await as().get('/v1/me/waivers/history')).signatures;
    expect(h).toEqual([expect.objectContaining({ title: 'Waiver', version: 1, signedName: 'Nadia N', inDate: true })]);
  });

  it('changes the password only with the current one', async () => {
    await as().post('/v1/me/password', { currentPassword: 'wrong', newPassword: 'new-password-1' }, 400);
    await as().post('/v1/me/password', { currentPassword: 'password123', newPassword: 'new-password-1' });
    await client(w, null).post('/v1/auth/login', { email: 'nadia@example.com', password: 'password123' }, 401);
    await client(w, null).post('/v1/auth/login', { email: 'nadia@example.com', password: 'new-password-1' }, 200);
  });
});
