/**
 * Development seed: three venues (indoor, outdoor circuit, hybrid), each with a track, karts with
 * transponders, products, waiver and rewards; staff users, a timing device, promotions, and a finalised
 * demo session imported from docs/samples/passings-sample.csv.
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

/** Track outlines in a 0..100 box (drawn on the app's leaderboard and store cards). */
const MAPS = {
  indoor: 'M12 85 L12 25 Q12 12 25 12 L60 12 Q72 12 72 24 Q72 36 60 36 L45 36 Q37 36 37 44 Q37 52 45 52 L78 52 Q88 52 88 62 L88 75 Q88 88 75 88 L25 88 Q12 88 12 85 Z',
  circuit: 'M20 80 C5 80 5 55 20 50 L45 42 C55 38 50 20 62 15 C75 10 92 18 88 35 C85 48 70 50 72 62 C74 75 90 72 88 85 C86 95 60 92 45 88 Z',
  hybrid: 'M15 20 L85 20 Q92 20 92 28 L92 40 Q92 48 84 48 L55 48 Q48 48 48 55 L48 60 Q48 67 55 67 L84 67 Q92 67 92 75 L92 80 Q92 88 84 88 L18 88 Q10 88 10 80 L10 26 Q10 20 15 20 Z',
};

const VENUES = [
  { name: 'Pinnacle Karting KL', shortName: 'KL', kind: 'indoor', accentColor: '#3ee07f', tagline: 'Indoor · 620 m · 14 corners', track: 'Main Circuit', lengthM: 620, map: MAPS.indoor, prefix: 'T1', minLapUs: 25_000_000 },
  { name: 'Pinnacle Cyberjaya', shortName: 'CYBERJAYA', kind: 'circuit', accentColor: '#7b5cff', tagline: 'Outdoor circuit · 1.2 km', track: 'Grand Prix Circuit', lengthM: 1200, map: MAPS.circuit, prefix: 'T2', minLapUs: 40_000_000 },
  { name: 'Pinnacle Johor Bahru', shortName: 'JB', kind: 'hybrid', accentColor: '#ff4fa3', tagline: 'Hybrid indoor/outdoor · 850 m', track: 'Hybrid Loop', lengthM: 850, map: MAPS.hybrid, prefix: 'T3', minLapUs: 30_000_000 },
] as const;

const db = createPool(config.databaseUrl);
await migrate(db);
if ((await db.query(`SELECT 1 FROM venues WHERE name = $1`, [VENUES[0].name])).rowCount) {
  console.log(`Already seeded (venue "${VENUES[0].name}" exists).`);
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
const [kl] = created;

await post('/v1/users', { email: OPERATOR_EMAIL, password: OPERATOR_PASSWORD, role: 'operator', venueId: kl.venueId });
await db.query(
  `INSERT INTO promotions (title, subtitle, badge, color, sort) VALUES
     ('3 sessions, one ticket', 'Save RM30 with the Arrive & Drive 3-session pack. Use it on any visit.', 'SAVE RM30', '#3ee07f', 1),
     ('Junior Cadet Saturdays', 'Speed-limited karts for ages 7–13, every Saturday morning.', 'AGES 7–13', '#ff4fa3', 2)`,
);
const device = await post('/v1/devices', { trackId: kl.trackId, name: 'Start/finish decoder', provider: 'gateway:simulator' });

const names = ['Aiman Hakim', 'Mei Ling Tan', 'Rajesh Kumar', 'Sofia Rahman', 'Daniel Lee', 'Nurul Izzah', 'Arjun Nair', 'Hannah Wong'];
const { id: sessionId } = await post('/v1/sessions', { trackId: kl.trackId, type: 'rental', name: 'Demo – Arrive & Drive 14:00', kartClassId: kl.classId });
for (let i = 0; i < names.length; i++) await post(`/v1/sessions/${sessionId}/participants`, { kartId: kl.karts[String(i + 1).padStart(2, '0')], driverName: names[i] });
const csv = await readFile(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs', 'samples', 'passings-sample.csv'), 'utf8');
const imported = await post('/v1/imports/passings', { trackId: kl.trackId, csv, date: '2026-10-10', sessionId, setSessionWindowFromFile: true });
await post(`/v1/sessions/${sessionId}/finalize`);

console.log(`
Seeded ${created.length} venues: ${VENUES.map((v) => v.name).join(', ')}
  demo session:     ${sessionId} (${imported.accepted} events imported, finalised)
  admin login:      ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}
  operator login:   ${OPERATOR_EMAIL} / ${OPERATOR_PASSWORD}  (${VENUES[0].name})
  device API key:   ${device.apiKey}
                    (shown once — use with: npm run simulate -- --key ${device.apiKey})
`);
await app.close();
await db.end();
