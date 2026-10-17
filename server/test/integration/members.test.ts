import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { at, client, sendEvents, setupWorld, startedSession, type World } from './helpers.js';

let w: World;
let token: string;
let me: any;
beforeAll(async () => {
  w = await setupWorld();
  token = (await client(w, null).post('/v1/auth/register', { email: 'nadia@example.com', password: 'password123', displayName: 'Nadia' }, 201)).token;
  me = await client(w, token).get('/v1/me');
});
afterAll(() => w.close());

describe('member cards: customers get their own laps', () => {
  it('gives every driver a readable member code', () => {
    expect(me.driver.memberCode).toMatch(/^[A-HJKMNP-Z2-9]{6}$/);
  });

  it('staff look up a member by code (case and spacing tolerant); drivers cannot', async () => {
    const code = me.driver.memberCode as string;
    const loose = `${code.slice(0, 3).toLowerCase()} ${code.slice(3)}`;
    expect(await client(w).get(`/v1/drivers/by-code/${encodeURIComponent(loose)}`)).toEqual({ id: me.driver.id, name: 'Nadia' });
    await client(w, token).get(`/v1/drivers/by-code/${code}`, 403);
    await client(w).get('/v1/drivers/by-code/ZZZZZZ', 404);
  });

  it('assigning by member code puts the session in the customer’s history', async () => {
    const api = client(w);
    const { id } = await api.post('/v1/sessions', { trackId: w.trackId, type: 'rental', name: 'Member session' });
    await api.post(`/v1/sessions/${id}/participants`, { kartId: w.karts['01'], memberCode: me.driver.memberCode }, 201);
    await api.post(`/v1/sessions/${id}/start`, { at: at('10:00:00.000') });
    await sendEvents(w, [
      { transponder: 'T101', clock: '10:00:10.000' },
      { transponder: 'T101', clock: '10:01:10.500' },
    ]);
    const lb = await api.get(`/v1/sessions/${id}/leaderboard`);
    expect(lb.entries[0].driver).toEqual({ id: me.driver.id, name: 'Nadia', isMember: true });
    const history = (await client(w, token).get(`/v1/drivers/${me.driver.id}/sessions`)).sessions;
    expect(history.map((h: any) => [h.session.name, h.bestLap.display])).toEqual([['Member session', '1:00.500']]);
  });

  it('links a walk-in profile’s earlier results to the member account (audited, once)', async () => {
    const api = client(w);
    const s = await startedSession(w, { '02': 'Nadia (walk-in)' }, '11:00:00.000');
    await sendEvents(w, [
      { transponder: 'T102', clock: '11:00:10.000' },
      { transponder: 'T102', clock: '11:01:09.000' },
    ]);
    await api.post(`/v1/sessions/${s.id}/finish`, { at: at('11:01:30.000') });
    await api.post(`/v1/sessions/${s.id}/finalize`);
    const walkIn = s.participants['02'].driverId;

    await client(w, token).post(`/v1/drivers/${walkIn}/link`, { memberCode: me.driver.memberCode, reason: 'x' }, 403);
    const r = await api.post(`/v1/drivers/${walkIn}/link`, { memberCode: me.driver.memberCode, reason: 'Customer showed receipt' });
    expect(r).toMatchObject({ entries: 1, laps: 1 });

    const history = (await client(w, token).get(`/v1/drivers/${me.driver.id}/sessions`)).sessions;
    expect(history).toHaveLength(2);
    const pbs = (await client(w, token).get(`/v1/drivers/${me.driver.id}/personal-best`)).personalBests;
    expect(pbs[0].lapTime.display).toBe('59.000');
    // Recalculation keeps the new owner.
    await api.post(`/v1/sessions/${s.id}/reopen`, { reason: 'check' });
    expect((await api.get(`/v1/sessions/${s.id}/leaderboard`)).entries[0].driver.name).toBe('Nadia');
    await api.post(`/v1/drivers/${walkIn}/link`, { memberCode: me.driver.memberCode, reason: 'again' }, 409);
    const trail = (await api.get(`/v1/audit?entityType=driver&entityId=${walkIn}`)).entries;
    expect(trail[0].action).toBe('driver.link');
  });
});
