import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { client, lapTimes, sendEvents, setupWorld, startedSession, us, type World } from './helpers.js';

let w: World;
beforeAll(async () => {
  w = await setupWorld();
});
afterAll(() => w.close());

describe('reliability', () => {
  it('re-sending a batch after a network failure creates no duplicates', async () => {
    const s = await startedSession(w, { '01': 'A' }, '10:00:00.000');
    const batch = [
      { transponder: 'T101', clock: '10:00:10.000', eventKey: 'boot1:1' },
      { transponder: 'T101', clock: '10:01:10.500', eventKey: 'boot1:2' },
    ];
    expect((await sendEvents(w, batch)).accepted).toBe(2);
    const again = await sendEvents(w, batch);
    expect(again).toMatchObject({ accepted: 0, duplicates: 2, recomputedSessions: [] });
    expect(await lapTimes(w, s.id, s.participants['01'].participantId)).toEqual(['1:00.500']);
    const { rows } = await w.db.query('SELECT count(*)::int AS n FROM laps WHERE session_id = $1', [s.id]);
    expect(rows[0].n).toBe(1);
  });

  it('collapses duplicate detections of one physical crossing (different keys)', async () => {
    const s = await startedSession(w, { '02': 'B' }, '10:10:00.000');
    await sendEvents(w, [
      { transponder: 'T102', clock: '10:10:10.000' },
      { transponder: 'T102', clock: '10:10:10.030' },
      { transponder: 'T102', clock: '10:11:11.000' },
    ]);
    expect(await lapTimes(w, s.id, s.participants['02'].participantId)).toEqual(['1:01.000']);
  });

  it('gives identical laps when a gateway replays buffered events late and out of order (outage)', async () => {
    const s = await startedSession(w, { '03': 'C' }, '10:20:00.000');
    // Live delivery of laps 1 and 3; the crossing in between was buffered during an outage.
    await sendEvents(w, [
      { transponder: 'T103', clock: '10:20:10.000' },
      { transponder: 'T103', clock: '10:22:10.900' },
    ]);
    // Meanwhile it looks like a 2-lap stint — not yet flagged (needs 3 reference laps).
    expect(await lapTimes(w, s.id, s.participants['03'].participantId)).toEqual(['2:00.900']);
    await sendEvents(w, [{ transponder: 'T103', clock: '10:21:10.400' }]);
    expect(await lapTimes(w, s.id, s.participants['03'].participantId)).toEqual(['1:00.400', '1:00.500']);
  });

  it('decoder restart: sequence numbers reset but boot-scoped keys keep every event', async () => {
    const s = await startedSession(w, { '04': 'D' }, '10:30:00.000');
    await sendEvents(w, [
      { transponder: 'T104', clock: '10:30:10.000', eventKey: 'bootA:1', sequence: 1 },
      { transponder: 'T104', clock: '10:31:10.000', eventKey: 'bootA:2', sequence: 2 },
    ]);
    const r = await sendEvents(w, [{ transponder: 'T104', clock: '10:32:10.000', eventKey: 'bootB:1', sequence: 1 }]);
    expect(r.accepted).toBe(1);
    expect(await lapTimes(w, s.id, s.participants['04'].participantId)).toEqual(['1:00.000', '1:00.000']);
  });

  it('raw events are immutable at the database level', async () => {
    await expect(w.db.query(`UPDATE raw_timing_events SET detected_us = detected_us + 1`)).rejects.toThrow(/append-only/);
    await expect(w.db.query(`DELETE FROM raw_timing_events`)).rejects.toThrow(/append-only/);
  });

  it('operator corrections: exclude ghost, fill missed lap, invalidate, revoke — raw data untouched', async () => {
    const api = client(w);
    const s = await startedSession(w, { '05': 'E' }, '10:40:00.000');
    const pid = s.participants['05'].participantId;
    await sendEvents(w, [
      { transponder: 'T105', clock: '10:40:10.000' },
      { transponder: 'T105', clock: '10:41:10.000' },
      { transponder: 'T105', clock: '10:41:35.000' }, // ghost read on the pit straight (≥ min lap)
      { transponder: 'T105', clock: '10:42:10.000' },
      { transponder: 'T105', clock: '10:44:10.200' }, // missed detection in between
      { transponder: 'T105', clock: '10:45:10.000' },
      { transponder: 'T105', clock: '10:46:10.100' },
    ]);
    const rawBefore = (await w.db.query('SELECT count(*)::int AS n FROM raw_timing_events')).rows[0].n;
    const events = (await api.get(`/v1/sessions/${s.id}/events`)).events;
    const ghost = events.find((e: any) => e.detectedAt.includes('02:41:35'));

    const { id: excludeId } = await api.post(`/v1/sessions/${s.id}/corrections`, { kind: 'exclude_event', targetRef: ghost.ref, reason: 'Ghost read on pit wall' }, 201);
    expect(await lapTimes(w, s.id, pid)).toEqual(['1:00.000', '1:00.000', '2:00.200', '59.800', '1:00.100']);

    const anomalies = await api.get(`/v1/sessions/${s.id}/anomalies`);
    expect(anomalies.flaggedLaps).toEqual([expect.objectContaining({ lapNumber: 3, flags: ['suspect_missed'] })]);

    await api.post(`/v1/sessions/${s.id}/corrections`, { kind: 'add_crossing', participantId: pid, at: us('10:43:10.100'), reason: 'Missed by loop; from video' }, 201);
    const laps = (await api.get(`/v1/sessions/${s.id}/laps?participantId=${pid}`)).laps;
    expect(laps.map((l: any) => l.lapTime.display)).toEqual(['1:00.000', '1:00.000', '1:00.100', '1:00.100', '59.800', '1:00.100']);
    expect(laps.every((l: any) => l.valid)).toBe(true);

    await api.post(`/v1/sessions/${s.id}/corrections`, { kind: 'invalidate_lap', targetRef: laps[4].endRef, reason: 'Cut chicane' }, 201);
    const lb = await api.get(`/v1/sessions/${s.id}/leaderboard`);
    expect(lb.entries[0].bestLap.display).toBe('1:00.000');

    await api.post(`/v1/corrections/${excludeId}/revoke`, { reason: 'Was a real crossing? no — testing revoke' });
    expect((await lapTimes(w, s.id, pid)).slice(1, 3)).toEqual(['25.000', '35.000']);

    const rawAfter = (await w.db.query('SELECT count(*)::int AS n FROM raw_timing_events')).rows[0].n;
    expect(rawAfter).toBe(rawBefore);
    const corrections = (await api.get(`/v1/sessions/${s.id}/corrections`)).corrections;
    expect(corrections).toHaveLength(3);
    expect(corrections.find((c: any) => c.id === excludeId).revoked_at).not.toBeNull();
  });

  it('lists crossings from transponders not assigned to any participant', async () => {
    const s = await startedSession(w, { '06': 'F' }, '11:00:00.000');
    await sendEvents(w, [
      { transponder: 'T106', clock: '11:00:10.000' },
      { transponder: 'UNKNOWN-99', clock: '11:00:12.000' },
      { transponder: 'T106', clock: '11:00:30.000', loop: 'MYSTERY' },
    ]);
    const a = await client(w).get(`/v1/sessions/${s.id}/anomalies`);
    expect(a.unmatchedEvents.map((e: any) => e.transponder)).toEqual(['UNKNOWN-99']);
    expect(a.unknownLoops).toEqual(['MYSTERY']);
  });

  it('handles many simultaneous karts', async () => {
    const entries = Object.fromEntries(['07', '08', '09', '10'].map((k) => [k, `Driver ${k}`]));
    const s = await startedSession(w, entries, '11:10:00.000');
    const events = [];
    for (let lap = 0; lap <= 5; lap++)
      for (const k of ['07', '08', '09', '10'])
        events.push({ transponder: `T1${k}`, clock: `11:${String(11 + lap).padStart(2, '0')}:${String(10 + Number(k) - 7).padStart(2, '0')}.${k}0` });
    await sendEvents(w, events.reverse());
    const lb = await client(w).get(`/v1/sessions/${s.id}/leaderboard`);
    expect(lb.entries.map((e: any) => e.lapsCompleted)).toEqual([5, 5, 5, 5]);
  });
});
