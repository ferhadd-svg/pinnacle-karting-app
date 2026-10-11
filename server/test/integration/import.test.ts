import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { client, setupWorld, type World } from './helpers.js';

let w: World;
beforeAll(async () => {
  w = await setupWorld();
});
afterAll(() => w.close());

const CSV = `Transponder;Time;Loop
T107;14:30:00.000;L1
T107;14:31:01.200;L1
T107;14:32:02.100;L1
T103;14:30:01.000;L1
T103;14:31:00.800;L1
T103;14:31:59.900;L1
T103;bad-time;L1
`;

describe('MVP: CSV import → session results', () => {
  it('imports a passings export, sets the session window from the file and computes results', async () => {
    const api = client(w);
    const { id } = await api.post('/v1/sessions', { trackId: w.trackId, type: 'rental', name: 'Imported 14:30' });
    await api.post(`/v1/sessions/${id}/participants`, { kartId: w.karts['07'], driverName: 'Aiman' });
    await api.post(`/v1/sessions/${id}/participants`, { kartId: w.karts['03'], driverName: 'Mei Ling' });

    const r = await api.post('/v1/imports/passings', { trackId: w.trackId, csv: CSV, date: '2026-03-14', sessionId: id, setSessionWindowFromFile: true });
    expect(r).toMatchObject({ received: 6, accepted: 6, duplicates: 0 });
    expect(r.rowErrors).toEqual([{ row: 8, message: 'Unrecognised timestamp "bad-time"' }]);

    const lb = await api.get(`/v1/sessions/${id}/leaderboard`);
    expect(lb.resultStatus).toBe('provisional');
    expect(lb.entries.map((e: any) => [e.driver.name, e.lapsCompleted, e.bestLap.display])).toEqual([
      ['Mei Ling', 2, '59.100'],
      ['Aiman', 2, '1:00.900'],
    ]);

    // Re-importing the same file (or an overlapping one) adds nothing.
    const again = await api.post('/v1/imports/passings', { trackId: w.trackId, csv: CSV, date: '2026-03-14' });
    expect(again).toMatchObject({ accepted: 0, duplicates: 6 });
  });

  it('times imported races from the first crossing (a file has no start signal)', async () => {
    const api = client(w);
    const { id } = await api.post('/v1/sessions', { trackId: w.trackId, type: 'sprint', name: 'Imported race' });
    await api.post(`/v1/sessions/${id}/participants`, { kartId: w.karts['05'], driverName: 'Racer' });
    const csv = 'transponder,time\nT105,16:00:05.000\nT105,16:01:06.000\nT105,16:02:06.500';
    await api.post('/v1/imports/passings', { trackId: w.trackId, csv, date: '2026-03-14', sessionId: id, setSessionWindowFromFile: true });
    const lb = await api.get(`/v1/sessions/${id}/leaderboard`);
    expect(lb.entries[0]).toMatchObject({ lapsCompleted: 2, bestLap: { display: '1:00.500' } });
  });

  it('rejects a file with no usable rows', async () => {
    const r = await client(w).post('/v1/imports/passings', { trackId: w.trackId, csv: 'foo,bar\n1,2' }, 400);
    expect(r.message).toMatch(/No transponder column/);
  });
});
