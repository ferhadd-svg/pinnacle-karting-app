/**
 * Development seed: a venue with a track, 12 karts with transponders, users, a timing device and a
 * finalised demo session imported from docs/samples/passings-sample.csv.
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

const db = createPool(config.databaseUrl);
await migrate(db);
if ((await db.query(`SELECT 1 FROM venues WHERE name = 'Pinnacle Karting KL'`)).rowCount) {
  console.log('Already seeded (venue "Pinnacle Karting KL" exists).');
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

const venueId = (await post('/v1/venues', { name: 'Pinnacle Karting KL', timezone: 'Asia/Kuala_Lumpur' })).id;
await post('/v1/users', { email: OPERATOR_EMAIL, password: OPERATOR_PASSWORD, role: 'operator', venueId });
const trackId = (await post('/v1/tracks', { venueId, name: 'Main Circuit', lengthM: 620, defaultRules: { minLapUs: 25_000_000 } })).id;
await post(`/v1/tracks/${trackId}/loops`, { code: 'L1', role: 'finish' });
await post(`/v1/tracks/${trackId}/loops`, { code: 'PIT', role: 'pit_in' });
const classId = (await post('/v1/kart-classes', { venueId, name: 'Adult 270cc' })).id;
const karts: Record<string, string> = {};
for (let n = 1; n <= 12; n++) {
  const num = String(n).padStart(2, '0');
  karts[num] = (await post('/v1/karts', { venueId, number: num, classId })).id;
  const tx = (await post('/v1/transponders', { venueId, code: `T1${num}` })).id;
  await post('/v1/transponder-assignments', { transponderId: tx, kartId: karts[num], from: '2026-01-01T00:00:00Z' });
}
// Customer app catalogue: ticket products, waiver, rewards (prices in sen).
await db.query(
  `INSERT INTO products (venue_id, name, description, session_type, price_sen, min_age, sort) VALUES
     ($1, 'Arrive & Drive', '10-minute timed session on the Main Circuit', 'rental', 7000, 12, 1),
     ($1, 'Arrive & Drive ×3', 'Three timed sessions, save RM30', 'rental', 18000, 12, 2),
     ($1, 'Grand Prix', 'Qualifying plus a 12-lap race with podium', 'sprint', 16000, 14, 3),
     ($1, 'Junior Cadet', '8-minute session for ages 7–13', 'rental', 5000, 7, 4)`,
  [venueId],
);
await db.query(
  `INSERT INTO waiver_templates (venue_id, version, title, body) VALUES ($1, 1, 'Karting participation waiver', $2)`,
  [
    venueId,
    [
      'Karting is a motorsport and involves risk of injury. By signing, I confirm that:',
      '1. I will follow the safety briefing and all marshal instructions, and wear the helmet and equipment provided.',
      '2. I am fit to drive and not under the influence of alcohol or drugs.',
      '3. I accept the risks of participating and that the venue may refuse or stop my session for safety reasons.',
      '4. Drivers under 18 must have this waiver signed by a parent or guardian.',
      'This is placeholder text for development. The venue must supply its own legally reviewed waiver.',
    ].join('\n\n'),
  ],
);
await db.query(
  `INSERT INTO reward_items (venue_id, name, description, cost_tokens, sort) VALUES
     ($1, 'Soft drink', 'Any canned drink at the café', 30, 1),
     ($1, 'Pinnacle cap', 'Embroidered team cap', 150, 2),
     ($1, 'Free Arrive & Drive', 'One 10-minute session', 250, 3)`,
  [venueId],
);

const device = await post('/v1/devices', { trackId, name: 'Start/finish decoder', provider: 'gateway:simulator' });

const names = ['Aiman Hakim', 'Mei Ling Tan', 'Rajesh Kumar', 'Sofia Rahman', 'Daniel Lee', 'Nurul Izzah', 'Arjun Nair', 'Hannah Wong'];
const { id: sessionId } = await post('/v1/sessions', { trackId, type: 'rental', name: 'Demo – Arrive & Drive 14:00', kartClassId: classId });
for (let i = 0; i < names.length; i++) await post(`/v1/sessions/${sessionId}/participants`, { kartId: karts[String(i + 1).padStart(2, '0')], driverName: names[i] });
const csv = await readFile(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs', 'samples', 'passings-sample.csv'), 'utf8');
const imported = await post('/v1/imports/passings', { trackId, csv, date: '2026-10-10', sessionId, setSessionWindowFromFile: true });
await post(`/v1/sessions/${sessionId}/finalize`);

console.log(`
Seeded venue ${venueId}
  track:            ${trackId}
  demo session:     ${sessionId} (${imported.accepted} events imported, finalised)
  admin login:      ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}
  operator login:   ${OPERATOR_EMAIL} / ${OPERATOR_PASSWORD}
  device API key:   ${device.apiKey}
                    (shown once — use with: npm run simulate -- --key ${device.apiKey})
`);
await app.close();
await db.end();
