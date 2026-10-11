import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { client, setupWorld, type World } from './helpers.js';

let w: World;
let driverToken: string;
let operatorToken: string;
let otherOperatorToken: string;
let sessionId: string;

beforeAll(async () => {
  w = await setupWorld();
  const api = client(w);
  const reg = await api.post('/v1/auth/register', { email: 'driver@example.com', password: 'password123', displayName: 'Dee' }, 201);
  driverToken = reg.token;
  const otherVenue = (await api.post('/v1/venues', { name: 'Elsewhere' })).id;
  await api.post('/v1/users', { email: 'op@example.com', password: 'operator-pass', role: 'operator', venueId: w.venueId }, 201);
  await api.post('/v1/users', { email: 'op2@example.com', password: 'operator-pass', role: 'operator', venueId: otherVenue }, 201);
  operatorToken = (await client(w, null).post('/v1/auth/login', { email: 'op@example.com', password: 'operator-pass' })).token;
  otherOperatorToken = (await client(w, null).post('/v1/auth/login', { email: 'op2@example.com', password: 'operator-pass' })).token;
  sessionId = (await client(w, operatorToken).post('/v1/sessions', { trackId: w.trackId, type: 'rental', name: 'S' }, 201)).id;
});
afterAll(() => w.close());

describe('authentication and role-based access', () => {
  it('rejects bad credentials and bad tokens', async () => {
    await client(w, null).post('/v1/auth/login', { email: 'driver@example.com', password: 'wrong-password' }, 401);
    await client(w, 'not-a-jwt').get('/v1/me', 401);
    await client(w, null).post(`/v1/sessions/${sessionId}/start`, {}, 401);
  });

  it('drivers cannot run sessions, import, correct or see raw events', async () => {
    const d = client(w, driverToken);
    await d.post(`/v1/sessions/${sessionId}/start`, {}, 403);
    await d.post('/v1/imports/passings', { trackId: w.trackId, csv: 'transponder,timestamp\n1,1' }, 403);
    await d.get(`/v1/sessions/${sessionId}/events`, 403);
    await d.post('/v1/devices', { trackId: w.trackId, name: 'x', provider: 'y' }, 403);
  });

  it('operators are limited to their own venue', async () => {
    await client(w, otherOperatorToken).post(`/v1/sessions/${sessionId}/participants`, { kartId: w.karts['01'], driverName: 'X' }, 403);
    await client(w, operatorToken).post(`/v1/sessions/${sessionId}/participants`, { kartId: w.karts['01'], driverName: 'X' }, 201);
    // Operators cannot mint device keys (admin only).
    await client(w, operatorToken).post('/v1/devices', { trackId: w.trackId, name: 'x', provider: 'y' }, 403);
  });

  it('timing devices may only submit events, with a valid key', async () => {
    const bad = await w.app.inject({ method: 'POST', url: '/v1/timing/events', headers: { 'x-device-key': 'tdk_wrong' }, payload: { events: [] } });
    expect(bad.statusCode).toBe(401);
    const asUser = await w.app.inject({
      method: 'POST',
      url: '/v1/timing/events',
      headers: { authorization: `Bearer ${operatorToken}` },
      payload: { events: [{ transponder: '1', timestamp: 1 }] },
    });
    expect(asUser.statusCode).toBe(401);
    const deviceOnAdmin = await w.app.inject({ method: 'POST', url: `/v1/sessions/${sessionId}/start`, headers: { 'x-device-key': w.deviceKey } });
    expect(deviceOnAdmin.statusCode).toBe(403);
  });

  it('stores device keys and passwords only as hashes', async () => {
    const { rows } = await w.db.query('SELECT api_key_hash FROM timing_devices WHERE id = $1', [w.deviceId]);
    expect(rows[0].api_key_hash).not.toContain(w.deviceKey);
    const u = await w.db.query(`SELECT password_hash FROM users WHERE email = 'driver@example.com'`);
    expect(u.rows[0].password_hash).toMatch(/^scrypt\$/);
  });

  it('private drivers are hidden from others but visible to themselves', async () => {
    const d = client(w, driverToken);
    const me = await d.get('/v1/me');
    await d.patch('/v1/me/driver', { showOnLeaderboards: false });
    await client(w, null).get(`/v1/drivers/${me.driver.id}/sessions`, 403);
    await d.get(`/v1/drivers/${me.driver.id}/sessions`, 200);
  });

  it('validates input', async () => {
    const r = await client(w).post('/v1/sessions', { trackId: 'nope', type: 'drift', name: '' }, 400);
    expect(r.error).toBe('invalid');
  });
});
