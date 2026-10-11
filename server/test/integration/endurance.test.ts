import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { at, client, sendEvents, setupWorld, type World } from './helpers.js';

let w: World;
beforeAll(async () => {
  w = await setupWorld();
});
afterAll(() => w.close());

describe('endurance', () => {
  it('attributes laps to drivers by stint, counts team laps, applies penalties', async () => {
    const api = client(w);
    const { id } = await api.post('/v1/sessions', { trackId: w.trackId, type: 'endurance', name: '1 Hour Enduro' });
    const ana = (await api.post('/v1/drivers', { displayName: 'Ana' })).id;
    const ben = (await api.post('/v1/drivers', { displayName: 'Ben' })).id;
    const red = await api.post(`/v1/sessions/${id}/participants`, { kartId: w.karts['01'], teamName: 'Red Bulls', driverId: ana });
    await api.post(`/v1/sessions/${id}/participants`, { kartId: w.karts['02'], teamName: 'Blue Team', driverName: 'Cara' });
    await api.post(`/v1/sessions/${id}/start`, { at: at('12:00:00.000') });
    await api.post(`/v1/participants/${red.participantId}/stints`, { driverId: ana, at: at('12:00:00.000') });

    // Race start from the grid: lap 1 is timed from the start signal.
    const ev = [];
    for (let i = 1; i <= 6; i++) ev.push({ transponder: 'T101', clock: `12:0${i}:00.500` });
    for (let i = 1; i <= 6; i++) ev.push({ transponder: 'T102', clock: `12:0${i}:01.000` });
    ev.push({ transponder: 'T101', clock: '12:03:40.000', loop: 'PIT' });
    await sendEvents(w, ev);
    // Pit-lane operator records the swap to Ben at 12:03:50.
    await api.post(`/v1/participants/${red.participantId}/stints`, { driverId: ben, at: at('12:03:50.000') });
    await api.post(`/v1/sessions/${id}/corrections`, { kind: 'time_penalty', participantId: red.participantId, seconds: 5, reason: 'Unsafe release' });

    const laps = (await api.get(`/v1/sessions/${id}/laps?participantId=${red.participantId}`)).laps;
    expect(laps.map((l: any) => l.driver.name)).toEqual(['Ana', 'Ana', 'Ana', 'Ben', 'Ben', 'Ben']);
    expect(laps[0].lapTime.display).toBe('1:00.500');
    expect(laps[3].flags).toEqual(['pit']);

    await api.post(`/v1/sessions/${id}/finish`, { at: at('12:06:30.000') });
    const lb = await api.get(`/v1/sessions/${id}/leaderboard`);
    // Equal laps; Red would lead on the line (12:06:00.5 vs 12:06:01.0) but the 5 s penalty drops them.
    expect(lb.entries.map((e: any) => [e.position, e.teamName, e.lapsCompleted])).toEqual([
      [1, 'Blue Team', 6],
      [2, 'Red Bulls', 6],
    ]);
    expect(lb.entries[1].gap.display).toBe('+4.500');

    await api.post(`/v1/sessions/${id}/finalize`);
    // Ben's history shows only his own laps from the team entry.
    const benHistory = (await api.get(`/v1/drivers/${ben}/sessions`)).sessions;
    expect(benHistory).toHaveLength(1);
    expect(benHistory[0]).toMatchObject({ laps: 3, position: 2 });
  });

  it('processes a high-volume race (30 karts × 120 laps) without duplicates', async () => {
    const api = client(w);
    // Extra karts/transponders for a full grid.
    for (let n = 11; n <= 30; n++) {
      const k = (await api.post('/v1/karts', { venueId: w.venueId, number: String(n), classId: w.classId })).id;
      const t = (await api.post('/v1/transponders', { venueId: w.venueId, code: `T1${n}` })).id;
      await api.post('/v1/transponder-assignments', { transponderId: t, kartId: k, from: '2026-01-01T00:00:00Z' });
      w.karts[String(n)] = k;
    }
    const { id } = await api.post('/v1/sessions', { trackId: w.trackId, type: 'endurance', name: '2 Hour Enduro' });
    const nums = Array.from({ length: 30 }, (_, i) => (i < 9 ? `0${i + 1}` : String(i + 1)));
    for (const n of nums) await api.post(`/v1/sessions/${id}/participants`, { kartId: w.karts[n], teamName: `Team ${n}` });
    const startMs = Date.parse(at('14:00:00.000'));
    await api.post(`/v1/sessions/${id}/start`, { at: new Date(startMs).toISOString() });

    const all: { transponder: string; timestamp: number; eventKey: string }[] = [];
    nums.forEach((n, i) => {
      let t = startMs * 1000;
      for (let lap = 1; lap <= 120; lap++) {
        t += 58_000_000 + i * 50_000 + ((lap * 7919 + i * 104_729) % 1_500_000);
        all.push({ transponder: `T1${n}`, timestamp: t, eventKey: `${n}:${lap}` });
      }
    });
    all.sort((a, b) => a.timestamp - b.timestamp);
    const t0 = Date.now();
    for (let i = 0; i < all.length; i += 500) {
      const r = await w.app.inject({
        method: 'POST',
        url: '/v1/timing/events',
        headers: { 'x-device-key': w.deviceKey },
        payload: { events: all.slice(i, i + 500).map((e) => ({ ...e, loop: 'L1' })) },
      });
      expect(r.statusCode).toBe(201);
    }
    const elapsed = Date.now() - t0;
    const { rows } = await w.db.query('SELECT count(*)::int AS n, count(DISTINCT (participant_id, lap_number))::int AS u FROM laps WHERE session_id = $1', [id]);
    expect(rows[0]).toEqual({ n: 3600, u: 3600 });
    const lb = await api.get(`/v1/sessions/${id}/leaderboard`);
    expect(lb.entries[0].teamName).toBe('Team 01');
    expect(lb.entries.every((e: any) => e.lapsCompleted === 120)).toBe(true);
    console.log(`ingested 3600 events in ${elapsed} ms`);
  }, 120_000);
});
