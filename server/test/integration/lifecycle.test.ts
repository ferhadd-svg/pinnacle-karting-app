import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { at, client, lapTimes, sendEvents, setupWorld, startedSession, type World } from './helpers.js';

let w: World;
beforeAll(async () => {
  w = await setupWorld();
});
afterAll(() => w.close());

describe('session lifecycle: transponder → laps → provisional → final → history', () => {
  let sessionId: string;
  let p07: { participantId: string; driverId: string };
  let p03: { participantId: string; driverId: string };

  it('calculates the brief example from decoder events', async () => {
    const s = await startedSession(w, { '07': 'Aiman', '03': 'Mei Ling' }, '14:29:30.000');
    sessionId = s.id;
    p07 = s.participants['07'];
    p03 = s.participants['03'];
    const res = await sendEvents(w, [
      { transponder: 'T107', clock: '14:30:00.000' },
      { transponder: 'T107', clock: '14:31:01.200' },
      { transponder: 'T107', clock: '14:32:02.100' },
    ]);
    expect(res).toMatchObject({ accepted: 3, duplicates: 0, recomputedSessions: [sessionId] });
    expect(await lapTimes(w, sessionId, p07.participantId)).toEqual(['1:01.200', '1:00.900']);
  });

  it('reports live results as provisional with a leaderboard', async () => {
    await sendEvents(w, [
      { transponder: 'T103', clock: '14:30:02.000' },
      { transponder: 'T103', clock: '14:31:02.500' },
      { transponder: 'T103', clock: '14:32:02.700' },
    ]);
    const lb = await client(w).get(`/v1/sessions/${sessionId}/leaderboard`);
    expect(lb.resultStatus).toBe('live');
    expect(lb.entries.map((e: any) => [e.position, e.driver.name, e.bestLap.display])).toEqual([
      [1, 'Mei Ling', '1:00.200'],
      [2, 'Aiman', '1:00.900'],
    ]);
    expect(lb.entries[0].hasFastestLap).toBe(true);
    expect(lb.entries[1].gap.display).toBe('+0.700');
  });

  it('chequered flag: each kart completes its current lap, later crossings are ignored', async () => {
    await client(w).post(`/v1/sessions/${sessionId}/finish`, { at: at('14:32:30.000') });
    await sendEvents(w, [
      { transponder: 'T107', clock: '14:33:03.000' }, // final lap after the flag
      { transponder: 'T107', clock: '14:34:04.000' }, // in-lap to the pits: ignored
      { transponder: 'T103', clock: '14:33:02.600' },
    ]);
    expect(await lapTimes(w, sessionId, p07.participantId)).toEqual(['1:01.200', '1:00.900', '1:00.900']);
    const lb = await client(w).get(`/v1/sessions/${sessionId}/leaderboard`);
    expect(lb.resultStatus).toBe('provisional');
  });

  it('personal bests and leaderboards only include final results', async () => {
    const api = client(w);
    expect((await api.get(`/v1/drivers/${p03.driverId}/personal-best`)).personalBests).toEqual([]);
    expect((await api.get(`/v1/tracks/${w.trackId}/leaderboard`)).entries).toEqual([]);

    await api.post(`/v1/sessions/${sessionId}/finalize`);
    const pb = (await api.get(`/v1/drivers/${p03.driverId}/personal-best`)).personalBests;
    expect(pb).toHaveLength(1);
    expect(pb[0]).toMatchObject({ lapTime: { display: '59.900' }, kartClass: { name: 'Rental 270cc' } });

    const board = await api.get(`/v1/tracks/${w.trackId}/leaderboard?period=all&classId=${w.classId}`);
    // Walk-ins (no account) never opted in to public boards, so they appear as "Guest".
    expect(board.entries.map((e: any) => [e.position, e.driver.name, e.lapTime.display])).toEqual([
      [1, 'Guest', '59.900'],
      [2, 'Guest', '1:00.900'],
    ]);
    const records = (await api.get(`/v1/tracks/${w.trackId}/records`)).records;
    expect(records[0]).toMatchObject({ lapTime: { display: '59.900' }, driver: { name: 'Guest' } });
    // Session results at the venue still show the names the operator entered.
    expect((await api.get(`/v1/sessions/${sessionId}/leaderboard`)).entries[0].driver.name).toBe('Mei Ling');

    const history = (await api.get(`/v1/drivers/${p07.driverId}/sessions`)).sessions;
    expect(history[0]).toMatchObject({ position: 2, laps: 3, bestLap: { display: '1:00.900' }, karts: '07', session: { resultStatus: 'final' } });
  });

  it('final results are frozen: late events are flagged, not applied, until an audited reopen', async () => {
    const api = client(w);
    const res = await sendEvents(w, [{ transponder: 'T103', clock: '14:31:12.500', eventKey: 'late-1' }]);
    expect(res.lateEventsForFinalSessions).toEqual([sessionId]);
    expect(await lapTimes(w, sessionId, p03.participantId)).toEqual(['1:00.500', '1:00.200', '59.900']);
    const anomalies = await api.get(`/v1/sessions/${sessionId}/anomalies`);
    expect(anomalies.lateEventsAfterFinalisation).toBe(1);

    await api.post(`/v1/sessions/${sessionId}/corrections`, { kind: 'disqualify', participantId: p03.participantId, reason: 'nope' }, 409);
    await api.post(`/v1/sessions/${sessionId}/reopen`, { reason: 'Review late decoder events' });
    // The late crossing is a ghost read 10 s after a real one → rejected as too short.
    expect(await lapTimes(w, sessionId, p03.participantId)).toEqual(['1:00.500', '1:00.200', '59.900']);
    expect((await api.get(`/v1/sessions/${sessionId}/anomalies`)).rejectedCrossings).toContainEqual(
      expect.objectContaining({ reason: 'too_short', participantId: p03.participantId }),
    );
    const trail = (await api.get(`/v1/audit?entityType=session&entityId=${sessionId}`)).entries.map((e: any) => e.action);
    expect(trail).toEqual(expect.arrayContaining(['session.create', 'session.start', 'session.finish', 'session.finalize', 'session.reopen']));
  });

  it('exports results as CSV', async () => {
    const csv = await client(w).get(`/v1/sessions/${sessionId}/export.csv`);
    expect(csv.split('\r\n')[0]).toBe('session,result_status,position,driver,team,karts,laps,best_lap,best_lap_number,average_lap,gap');
    expect(csv).toContain('Mei Ling');
  });
});

describe('session time guards', () => {
  it('rejects start times in the future', async () => {
    const api = client(w);
    const { id } = await api.post('/v1/sessions', { trackId: w.trackId, type: 'rental', name: 'Future' });
    await api.post(`/v1/sessions/${id}/participants`, { kartId: w.karts['09'], driverName: 'Time Traveller' });
    const r = await api.post(`/v1/sessions/${id}/start`, { at: new Date(Date.now() + 3_600_000).toISOString() }, 400);
    expect(r.message).toMatch(/future/);
  });
});
