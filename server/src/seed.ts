/**
 * Development seed: the Pinnacle Kart venue with its track, karts with transponders, products, waiver and
 * rewards; staff users, a timing device, promotions, and a finalised demo session imported from docs/samples/passings-sample.csv.
 *   npm run seed            (uses DATABASE_URL, default local "karting" DB)
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app.js';
import { hashPassword } from './auth.js';
import { config } from './config.js';
import { createPool } from './db.js';
import { migrate } from './migrations.js';

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@pinnacle.example';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'change-me-admin';
const OPERATOR_EMAIL = 'operator@pinnacle.example';
const OPERATOR_PASSWORD = process.env.SEED_OPERATOR_PASSWORD ?? 'change-me-operator';

/** Brand colour (salamander orange); venue accent, promotions and the app theme all use it. */
const BRAND = '#F25C1F';

/**
 * Pinnacle Kart is a single venue. The outline is the circuit layout traced into a 0..100 box (drawn on the
 * app's leaderboard and store cards), driven clockwise from the start/finish on the bottom straight.
 * lengthM is a placeholder until the measured lap length is known; mileage and km stats are derived from it.
 */
const VENUE = {
  name: 'Pinnacle Kart',
  shortName: 'PINNACLE',
  kind: 'circuit',
  accentColor: BRAND,
  tagline: '9-turn circuit',
  track: 'Main Circuit',
  lengthM: 620,
  map: 'M41.5 77.4 C36.4 77.5 31.2 77.4 25.8 77.4 C20.4 77.4 12.7 77.6 9.1 77.3 C5.5 77.0 5.2 76.3 4.4 75.4 C3.6 74.5 3.6 72.9 4.0 71.9 C4.4 70.9 5.4 69.8 6.7 69.2 C8.0 68.6 9.7 68.3 11.6 68.3 C13.5 68.2 16.0 68.7 17.9 68.9 C19.8 69.2 21.1 70.0 22.9 69.8 C24.7 69.6 26.8 68.5 28.7 67.7 C30.6 66.9 32.9 65.6 34.6 64.8 C36.3 64.0 37.5 64.3 38.8 62.8 C40.1 61.3 41.4 58.0 42.5 55.9 C43.6 53.8 44.6 51.9 45.4 49.9 C46.2 47.9 46.7 46.1 47.2 44.0 C47.7 41.9 47.8 39.3 48.2 37.1 C48.7 34.9 49.0 32.6 49.9 30.7 C50.8 28.8 52.1 26.8 53.8 25.5 C55.5 24.2 57.8 23.3 60.2 22.8 C62.6 22.3 65.2 22.4 68.0 22.6 C70.8 22.9 74.0 23.5 76.9 24.3 C79.9 25.1 83.2 26.4 85.7 27.5 C88.2 28.6 90.0 29.2 91.6 30.7 C93.1 32.2 94.3 34.2 95.0 36.6 C95.7 39.0 95.8 41.9 96.0 44.9 C96.2 47.9 96.2 52.1 96.0 54.8 C95.8 57.5 95.5 59.6 94.7 61.1 C93.9 62.6 92.3 63.4 91.1 63.6 C89.8 63.8 88.1 63.2 87.2 62.1 C86.3 61.0 86.0 58.7 85.9 56.7 C85.8 54.7 86.2 52.1 86.5 49.9 C86.8 47.6 87.6 44.9 87.7 43.2 C87.8 41.5 88.0 40.5 87.2 39.5 C86.5 38.5 85.4 38.0 83.2 37.1 C81.0 36.2 77.1 35.0 73.9 34.1 C70.7 33.2 66.7 32.1 64.1 32.0 C61.5 31.9 59.6 32.3 58.2 33.2 C56.8 34.1 55.9 36.3 55.9 37.6 C55.9 38.9 56.8 40.3 58.2 41.2 C59.6 42.1 61.8 42.2 64.1 42.8 C66.4 43.4 69.8 43.9 71.9 44.7 C74.0 45.6 75.6 46.5 76.7 47.9 C77.8 49.2 78.4 51.3 78.4 52.8 C78.4 54.3 78.0 55.9 76.9 56.7 C75.8 57.5 73.7 57.7 71.9 57.5 C70.1 57.3 68.0 56.4 66.1 55.7 C64.1 55.0 62.2 53.5 60.2 53.1 C58.2 52.7 56.1 52.7 54.3 53.1 C52.5 53.5 50.8 54.4 49.6 55.7 C48.4 57.0 47.4 59.3 47.2 61.1 C47.0 62.9 47.6 65.2 48.4 66.5 C49.2 67.8 50.6 68.9 51.8 68.9 C53.0 68.9 54.2 67.4 55.4 66.5 C56.5 65.6 57.6 63.8 58.7 63.4 C59.8 63.0 61.4 63.2 62.1 64.1 C62.8 64.9 63.3 66.9 63.1 68.5 C62.9 70.1 62.2 72.5 61.1 73.9 C60.0 75.3 59.5 76.5 56.2 77.1 C52.9 77.7 46.6 77.4 41.5 77.4 Z',
  prefix: 'T1',
  minLapUs: 25_000_000,
} as const;
const VENUES = [VENUE];

const db = createPool(config.databaseUrl);
await migrate(db);
if ((await db.query(`SELECT 1 FROM venues WHERE name = $1`, [VENUE.name])).rowCount) {
  console.log(`Already seeded (venue "${VENUE.name}" exists).`);
  await db.end();
  process.exit(0);
}
await db.query(`INSERT INTO users (email, password_hash, role) VALUES ($1, $2, 'admin')`, [ADMIN_EMAIL, await hashPassword(ADMIN_PASSWORD)]);

const app = await buildApp({ db, jwtSecret: config.jwtSecret, logLevel: 'silent' });
const token = (await app.inject({ method: 'POST', url: '/v1/auth/login', payload: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } })).json().token;
async function post(url: string, payload: object = {}) {
  const r = await app.inject({ method: 'POST', url, payload, headers: { authorization: `Bearer ${token}` } });
  if (r.statusCode >= 300) throw new Error(`${url}: ${r.statusCode} ${r.body}`);
  return r.json();
}

const created: { venueId: string; trackId: string; classId: string; karts: Record<string, string> }[] = [];
for (const [i, v] of VENUES.entries()) {
  const venueId = (
    await post('/v1/venues', { name: v.name, timezone: 'Asia/Kuala_Lumpur', shortName: v.shortName, kind: v.kind, accentColor: v.accentColor, tagline: v.tagline, sort: i + 1 })
  ).id;
  const trackId = (await post('/v1/tracks', { venueId, name: v.track, lengthM: v.lengthM, mapPath: v.map, defaultRules: { minLapUs: v.minLapUs } })).id;
  await post(`/v1/tracks/${trackId}/loops`, { code: 'L1', role: 'finish' });
  await post(`/v1/tracks/${trackId}/loops`, { code: 'PIT', role: 'pit_in' });
  const classId = (await post('/v1/kart-classes', { venueId, name: 'Adult 270cc' })).id;
  const karts: Record<string, string> = {};
  for (let n = 1; n <= 12; n++) {
    const num = String(n).padStart(2, '0');
    karts[num] = (await post('/v1/karts', { venueId, number: num, classId })).id;
    const tx = (await post('/v1/transponders', { venueId, code: `${v.prefix}${num}` })).id;
    await post('/v1/transponder-assignments', { transponderId: tx, kartId: karts[num], from: '2026-01-01T00:00:00Z' });
  }
  // Customer app catalogue (prices in sen).
  await db.query(
    `INSERT INTO products (venue_id, name, description, session_type, price_sen, min_age, sessions, sort) VALUES
       ($1, 'Arrive & Drive', '10-minute timed session', 'rental', 7000, 12, 1, 1),
       ($1, 'Arrive & Drive · 3 sessions', 'Three timed sessions on one ticket, save RM30', 'rental', 18000, 12, 3, 2),
       ($1, 'Grand Prix', 'Qualifying plus a 12-lap race with podium', 'sprint', 16000, 14, 1, 3),
       ($1, 'Junior Cadet', '8-minute session for ages 7–13', 'rental', 5000, 7, 1, 4)`,
    [venueId],
  );
  await db.query(`INSERT INTO waiver_templates (venue_id, version, title, body) VALUES ($1, 1, 'Karting participation waiver', $2)`, [
    venueId,
    [
      'Karting is a motorsport and involves risk of injury. By signing, I confirm that:',
      '1. I will follow the safety briefing and all marshal instructions, and wear the helmet and equipment provided.',
      '2. I am fit to drive and not under the influence of alcohol or drugs.',
      '3. I accept the risks of participating and that the venue may refuse or stop my session for safety reasons.',
      '4. Drivers under 18 must have this waiver signed by a parent or guardian.',
      'This is placeholder text for development. The venue must supply its own legally reviewed waiver.',
    ].join('\n\n'),
  ]);
  await db.query(
    `INSERT INTO reward_items (venue_id, name, description, cost_tokens, sort) VALUES
       ($1, 'Soft drink', 'Any canned drink at the café', 30, 1),
       ($1, 'Pinnacle cap', 'Embroidered team cap', 150, 2),
       ($1, 'Free Arrive & Drive', 'One 10-minute session', 250, 3)`,
    [venueId],
  );
  created.push({ venueId, trackId, classId, karts });
}
const [main] = created;

await post('/v1/users', { email: OPERATOR_EMAIL, password: OPERATOR_PASSWORD, role: 'operator', venueId: main.venueId });
await db.query(
  `INSERT INTO promotions (title, subtitle, badge, color, sort) VALUES
     ('3 sessions, one ticket', 'Save RM30 with the Arrive & Drive 3-session pack. Use it on any visit.', 'SAVE RM30', $1, 1),
     ('Junior Cadet Saturdays', 'Speed-limited karts for ages 7–13, every Saturday morning.', 'AGES 7–13', '#FF8A50', 2)`,
  [BRAND],
);
const device = await post('/v1/devices', { trackId: main.trackId, name: 'Start/finish decoder', provider: 'gateway:simulator' });

const names = ['Aiman Hakim', 'Mei Ling Tan', 'Rajesh Kumar', 'Sofia Rahman', 'Daniel Lee', 'Nurul Izzah', 'Arjun Nair', 'Hannah Wong'];
const { id: sessionId } = await post('/v1/sessions', { trackId: main.trackId, type: 'rental', name: 'Demo – Arrive & Drive 14:00', kartClassId: main.classId });
for (let i = 0; i < names.length; i++) await post(`/v1/sessions/${sessionId}/participants`, { kartId: main.karts[String(i + 1).padStart(2, '0')], driverName: names[i] });
const csv = await readFile(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs', 'samples', 'passings-sample.csv'), 'utf8');
const imported = await post('/v1/imports/passings', { trackId: main.trackId, csv, date: '2026-10-10', sessionId, setSessionWindowFromFile: true });
await post(`/v1/sessions/${sessionId}/finalize`);

console.log(`
Seeded venue: ${VENUE.name}
  demo session:     ${sessionId} (${imported.accepted} events imported, finalised)
  admin login:      ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}
  operator login:   ${OPERATOR_EMAIL} / ${OPERATOR_PASSWORD}  (${VENUE.name})
  device API key:   ${device.apiKey}
                    (shown once — use with: npm run simulate -- --key ${device.apiKey})
`);
await app.close();
await db.end();
