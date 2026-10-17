import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import { hashPassword } from '../../src/auth.js';
import { createPool, type Db } from '../../src/db.js';
import { migrate } from '../../src/migrations.js';
import { parseTimestampUs } from '../../src/timing/time.js';

export const TEST_DB = process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/karting_test';
const KL = 'Asia/Kuala_Lumpur';
export const DAY = '2026-03-14';

/** "14:30:01.200" on the test day in KL → ISO with offset. */
export const at = (clock: string) => `${DAY}T${clock}+08:00`;
export const us = (clock: string) => parseTimestampUs(clock, { timeZone: KL, date: DAY });

export interface World {
  app: FastifyInstance;
  db: Db;
  adminToken: string;
  venueId: string;
  trackId: string;
  classId: string;
  karts: Record<string, string>;
  transponders: Record<string, string>;
  deviceKey: string;
  deviceId: string;
  close: () => Promise<void>;
}

export async function resetDb(db: Db) {
  await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate(db);
}

/** Fresh schema + a venue with one track, 10 karts each fitted with a transponder (kart N ↔ "T10N"). */
export async function setupWorld(): Promise<World> {
  const db = createPool(TEST_DB);
  await resetDb(db);
  const app = await buildApp({ db, jwtSecret: 'test-secret', logLevel: 'silent', paymentsProvider: 'demo' });

  await db.query(`INSERT INTO users (email, password_hash, role) VALUES ('admin@test', $1, 'admin')`, [await hashPassword('admin-password')]);
  const login = await app.inject({ method: 'POST', url: '/v1/auth/login', payload: { email: 'admin@test', password: 'admin-password' } });
  const adminToken = login.json().token;
  const auth = { authorization: `Bearer ${adminToken}` };
  const post = async (url: string, payload: unknown) => {
    const r = await app.inject({ method: 'POST', url, payload: payload as object, headers: auth });
    if (r.statusCode >= 300) throw new Error(`${url} → ${r.statusCode} ${r.body}`);
    return r.json();
  };

  const venueId = (await post('/v1/venues', { name: 'Test Circuit KL', timezone: KL })).id;
  const trackId = (await post('/v1/tracks', { venueId, name: 'Main', lengthM: 900, defaultRules: { minLapUs: 20_000_000 } })).id;
  await post(`/v1/tracks/${trackId}/loops`, { code: 'L1', role: 'finish' });
  await post(`/v1/tracks/${trackId}/loops`, { code: 'PIT', role: 'pit_in' });
  const classId = (await post('/v1/kart-classes', { venueId, name: 'Rental 270cc' })).id;
  const karts: Record<string, string> = {};
  const transponders: Record<string, string> = {};
  for (let n = 1; n <= 10; n++) {
    const num = String(n).padStart(2, '0');
    karts[num] = (await post('/v1/karts', { venueId, number: num, classId })).id;
    transponders[`T1${num}`] = (await post('/v1/transponders', { venueId, code: `T1${num}` })).id;
    await post('/v1/transponder-assignments', { transponderId: transponders[`T1${num}`], kartId: karts[num], from: '2026-01-01T00:00:00Z' });
  }
  const dev = await post('/v1/devices', { trackId, name: 'Decoder 1', provider: 'gateway:test' });

  return {
    app,
    db,
    adminToken,
    venueId,
    trackId,
    classId,
    karts,
    transponders,
    deviceKey: dev.apiKey,
    deviceId: dev.id,
    close: async () => {
      await app.close();
      await db.end();
    },
  };
}

export function client(w: World, token: string | null = w.adminToken) {
  const headers = token ? { authorization: `Bearer ${token}` } : {};
  const call = async (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: unknown, expect?: number) => {
    const r = await w.app.inject({ method, url, payload: payload as object, headers });
    if (expect !== undefined && r.statusCode !== expect) throw new Error(`${method} ${url} → ${r.statusCode} (wanted ${expect}) ${r.body}`);
    if (expect === undefined && r.statusCode >= 300) throw new Error(`${method} ${url} → ${r.statusCode} ${r.body}`);
    return r.headers['content-type']?.toString().includes('json') ? r.json() : r.body;
  };
  return {
    get: (url: string, expect?: number) => call('GET', url, undefined, expect),
    post: (url: string, payload?: unknown, expect?: number) => call('POST', url, payload ?? {}, expect),
    patch: (url: string, payload?: unknown, expect?: number) => call('PATCH', url, payload ?? {}, expect),
    del: (url: string, expect?: number) => call('DELETE', url, undefined, expect),
  };
}

export async function sendEvents(
  w: World,
  events: { transponder: string; clock: string; loop?: string; eventKey?: string; sequence?: number }[],
  key = w.deviceKey,
) {
  const r = await w.app.inject({
    method: 'POST',
    url: '/v1/timing/events',
    headers: { 'x-device-key': key },
    payload: { events: events.map((e) => ({ transponder: e.transponder, loop: e.loop ?? 'L1', timestamp: at(e.clock), eventKey: e.eventKey, sequence: e.sequence })) },
  });
  if (r.statusCode >= 300) throw new Error(`ingest → ${r.statusCode} ${r.body}`);
  return r.json();
}

/** Create a session with participants (kart number → driver name) and start it at `startClock`. */
export async function startedSession(
  w: World,
  entries: Record<string, string>,
  startClock: string,
  opts: { type?: string; name?: string; rules?: object } = {},
) {
  const api = client(w);
  const { id } = await api.post('/v1/sessions', { trackId: w.trackId, type: opts.type ?? 'rental', name: opts.name ?? 'Session', rules: opts.rules });
  const participants: Record<string, { participantId: string; driverId: string }> = {};
  for (const [kart, driver] of Object.entries(entries)) {
    participants[kart] = await api.post(`/v1/sessions/${id}/participants`, { kartId: w.karts[kart], driverName: driver });
  }
  await api.post(`/v1/sessions/${id}/start`, { at: at(startClock) });
  return { id, participants };
}

/** Lap times for a participant as display strings. */
export async function lapTimes(w: World, sessionId: string, participantId: string) {
  const r = await client(w).get(`/v1/sessions/${sessionId}/laps?participantId=${participantId}`);
  return r.laps.map((l: { lapTime: { display: string } }) => l.lapTime.display);
}
