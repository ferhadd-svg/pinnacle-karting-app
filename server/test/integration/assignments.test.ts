import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { at, client, lapTimes, sendEvents, setupWorld, startedSession, type World } from './helpers.js';

let w: World;
beforeAll(async () => {
  w = await setupWorld();
});
afterAll(() => w.close());

describe('karts, transponders and assignments', () => {
  it('back-to-back sessions with the same karts hand transponders over cleanly', async () => {
    const api = client(w);
    const s1 = await startedSession(w, { '01': 'Early Driver' }, '09:00:00.000');
    await sendEvents(w, [
      { transponder: 'T101', clock: '09:00:10.000' },
      { transponder: 'T101', clock: '09:01:10.000' },
    ]);
    await api.post(`/v1/sessions/${s1.id}/finish`, { at: at('09:01:30.000') });
    await sendEvents(w, [{ transponder: 'T101', clock: '09:02:10.000' }]); // final lap

    // Next group goes out on kart 01 two minutes later.
    const s2 = await startedSession(w, { '01': 'Late Driver' }, '09:03:00.000');
    await sendEvents(w, [
      { transponder: 'T101', clock: '09:03:20.000' },
      { transponder: 'T101', clock: '09:04:21.000' },
    ]);
    expect(await lapTimes(w, s1.id, s1.participants['01'].participantId)).toEqual(['1:00.000', '1:00.000']);
    expect(await lapTimes(w, s2.id, s2.participants['01'].participantId)).toEqual(['1:01.000']);
  });

  it('refuses to start a session whose transponder is active in another running session', async () => {
    await startedSession(w, { '02': 'X' }, '09:10:00.000');
    const api = client(w);
    const { id } = await api.post('/v1/sessions', { trackId: w.trackId, type: 'rental', name: 'Clash' });
    await api.post(`/v1/sessions/${id}/participants`, { kartId: w.karts['02'], driverName: 'Y' });
    const r = await api.post(`/v1/sessions/${id}/start`, { at: at('09:11:00.000') }, 409);
    expect(r.error).toBe('transponder_in_use');
  });

  it('a transponder moved to another kart after maintenance keeps history correct', async () => {
    const api = client(w);
    // Session on kart 03 with transponder T103.
    const s1 = await startedSession(w, { '03': 'Before Swap' }, '09:20:00.000');
    await sendEvents(w, [
      { transponder: 'T103', clock: '09:20:10.000' },
      { transponder: 'T103', clock: '09:21:10.000' },
    ]);
    await api.post(`/v1/sessions/${s1.id}/finish`, { at: at('09:21:20.000') });
    await api.post(`/v1/sessions/${s1.id}/finalize`);

    // Workshop: T103 moves to kart 09 (kart 03 goes to maintenance); kart 09's old T109 is retired.
    await api.post('/v1/transponder-assignments', { transponderId: w.transponders.T103, kartId: w.karts['09'], from: at('09:25:00.000') });
    const karts = (await api.get(`/v1/karts?venueId=${w.venueId}`)).karts;
    expect(karts.find((k: any) => k.number === '09').transponder_code).toBe('T103');
    expect(karts.find((k: any) => k.number === '03').transponder_code).toBeNull();

    const s2 = await startedSession(w, { '09': 'After Swap' }, '09:30:00.000');
    await sendEvents(w, [
      { transponder: 'T103', clock: '09:30:10.000' },
      { transponder: 'T103', clock: '09:31:12.000' },
    ]);
    const lb2 = await api.get(`/v1/sessions/${s2.id}/leaderboard`);
    expect(lb2.entries[0]).toMatchObject({ driver: { name: 'After Swap' }, karts: '09', bestLap: { display: '1:02.000' } });
    const lb1 = await api.get(`/v1/sessions/${s1.id}/leaderboard`);
    expect(lb1.entries[0]).toMatchObject({ driver: { name: 'Before Swap' }, karts: '03', bestLap: { display: '1:00.000' } });
  });

  it('cannot start a session with a kart that has no transponder fitted', async () => {
    const api = client(w);
    const { id } = await api.post('/v1/sessions', { trackId: w.trackId, type: 'rental', name: 'No tx' });
    await api.post(`/v1/sessions/${id}/participants`, { kartId: w.karts['03'], driverName: 'Z' });
    const r = await api.post(`/v1/sessions/${id}/start`, {}, 409);
    expect(r.message).toMatch(/kart\(s\) 03/);
  });

  it('a mid-session kart change keeps all laps with the driver', async () => {
    const api = client(w);
    const s = await startedSession(w, { '04': 'Breakdown' }, '10:00:00.000');
    const pid = s.participants['04'].participantId;
    await sendEvents(w, [
      { transponder: 'T104', clock: '10:00:10.000' },
      { transponder: 'T104', clock: '10:01:10.000' },
    ]);
    // Kart 04 breaks down; recorded at server "now", which is after these test timestamps,
    // so set the boundary explicitly through the DB to keep the test deterministic.
    await api.post(`/v1/participants/${pid}/kart`, { kartId: w.karts['05'], reason: 'Kart 04 engine failure' });
    await w.db.query(
      `UPDATE participant_karts SET active_during = tstzrange(lower(active_during), $2::timestamptz) WHERE participant_id = $1 AND kart_id = $3`,
      [pid, at('10:01:30.000'), w.karts['04']],
    );
    await w.db.query(`UPDATE participant_karts SET active_during = tstzrange($2::timestamptz, NULL) WHERE participant_id = $1 AND kart_id = $3`, [
      pid,
      at('10:01:30.000'),
      w.karts['05'],
    ]);
    await sendEvents(w, [
      { transponder: 'T105', clock: '10:03:00.000' },
      { transponder: 'T105', clock: '10:04:01.000' },
    ]);
    const laps = (await api.get(`/v1/sessions/${s.id}/laps?participantId=${pid}`)).laps;
    expect(laps.map((l: any) => [l.kart, l.lapTime.display])).toEqual([
      ['04', '1:00.000'],
      ['05', '1:50.000'],
      ['05', '1:01.000'],
    ]);
  });
});

describe('backfilling', () => {
  it('imports an earlier session after a later one already used the same karts', async () => {
    const api = client(w);
    const later = await startedSession(w, { '06': 'Later' }, '16:00:00.000');
    await sendEvents(w, [
      { transponder: 'T106', clock: '16:00:10.000' },
      { transponder: 'T106', clock: '16:01:10.000' },
    ]);
    await api.post(`/v1/sessions/${later.id}/finish`, { at: at('16:01:30.000') });

    // An earlier session from the same day is entered afterwards (e.g. from a CSV export).
    const earlier = await startedSession(w, { '06': 'Earlier' }, '15:00:00.000');
    await sendEvents(w, [
      { transponder: 'T106', clock: '15:00:10.000' },
      { transponder: 'T106', clock: '15:01:12.000' },
    ]);
    await api.post(`/v1/sessions/${earlier.id}/finish`, { at: at('15:01:30.000') });
    expect(await lapTimes(w, earlier.id, earlier.participants['06'].participantId)).toEqual(['1:02.000']);
    expect(await lapTimes(w, later.id, later.participants['06'].participantId)).toEqual(['1:00.000']);
  });
});
