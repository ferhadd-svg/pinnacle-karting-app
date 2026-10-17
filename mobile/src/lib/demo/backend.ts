/**
 * Built-in demo backend (EXPO_PUBLIC_DEMO=1). Answers the app's API calls on the device, so the app can be
 * tried without a timing server: read-only data is real API output recorded from a seeded server
 * (fixtures.json), purchases, waivers, rewards and friends change a local copy, and one session is always
 * on track, simulated lap by lap from the clock.
 */
import fixtures from './fixtures.json';

type Json = any; // eslint-disable-line @typescript-eslint/no-explicit-any
export interface DemoResponse {
  status: number;
  data: Json;
}

const F = fixtures as Record<string, Json>;
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const ok = (data: Json): DemoResponse => ({ status: 200, data });
const fail = (status: number, error: string, message: string): DemoResponse => ({ status, data: { error, message } });

export const DEMO_EMAIL = 'farah@example.com';
export const DEMO_PASSWORD = 'farah-demo-pass';
const ME = F['/me'];
const VENUE = F['/venues'][0];
const TRACK = VENUE.tracks[0];
const ALL_SESSIONS: Json[] = F['/sessions?limit=200'].sessions;
const LIVE_ID: string = ALL_SESSIONS.find((s) => s.resultStatus === 'live').id;
const DANIEL = F['/me/friends'].friends.find((f: Json) => f.name === 'Daniel Lee');
const MEMBERS: Record<string, { driverId: string; name: string }> = { '6JAHE4': { driverId: DANIEL.driverId, name: 'Daniel Lee' } };

// ── Local state (persisted in the web preview) ───────────────────────────
const STORE_KEY = 'pinnacle.demo.v1';
interface State {
  password: string;
  showOnLeaderboards: boolean;
  displayName: string;
  tickets: Json[];
  orders: Json[];
  rewards: Json;
  waivers: Json[];
  waiverHistory: Json[];
  friends: Json[];
}
const initial = (): State => ({
  password: DEMO_PASSWORD,
  showOnLeaderboards: ME.driver.showOnLeaderboards,
  displayName: ME.driver.name,
  tickets: clone(F['/me/tickets'].tickets),
  orders: clone(F['/me/orders'].orders),
  rewards: clone(F['/me/rewards']),
  waivers: clone(F['/me/waivers'].waivers),
  waiverHistory: clone(F['/me/waivers/history'].signatures),
  friends: clone(F['/me/friends'].friends),
});
let state: State = (() => {
  try {
    const raw = globalThis.localStorage?.getItem(STORE_KEY);
    if (raw) return { ...initial(), ...JSON.parse(raw) };
  } catch {
    /* private mode or blocked storage: start fresh */
  }
  return initial();
})();
const save = () => {
  try {
    globalThis.localStorage?.setItem(STORE_KEY, JSON.stringify(state));
  } catch {
    /* keep in memory only */
  }
};
export function resetDemo() {
  state = initial();
  save();
}

const id = () => `demo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const code = () => Array.from({ length: 8 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 31)]).join('');
const fmtLap = (us: number) => {
  const ms = Math.floor(us / 1000);
  const m = Math.floor(ms / 60_000);
  const s = ((ms % 60_000) / 1000).toFixed(3);
  return m > 0 ? `${m}:${s.padStart(6, '0')}` : s;
};
const lapTime = (us: number) => ({ us, display: fmtLap(us) });

// ── The session that is always on track ──────────────────────────────────
/** A 10-minute session that restarts as soon as it ends, so there is always one on track. */
const CYCLE_MS = 10 * 60_000;
const RUN_MS = CYCLE_MS;
const GRID = [
  { kart: '06', name: ME.driver.name, driverId: ME.driver.id, member: true, pace: 43_900 },
  { kart: '08', name: 'Daniel Lee', driverId: DANIEL.driverId, member: true, pace: 44_250 },
  { kart: '12', name: 'Rajesh Kumar', pace: 44_500 },
  { kart: '09', name: 'Mei Ling Tan', pace: 44_700 },
  { kart: '10', name: 'Sofia Rahman', pace: 45_000 },
  { kart: '01', name: 'Arjun Nair', pace: 45_400 },
  { kart: '03', name: 'Hannah Wong', pace: 46_200 },
  { kart: '11', name: 'Nurul Izzah', pace: 46_800 },
];
const rnd = (a: number, b: number, c: number) => {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 2 ** 32;
};

function simulate(now = Date.now()) {
  const cycle = Math.floor(now / CYCLE_MS);
  const start = cycle * CYCLE_MS;
  const end = start + RUN_MS;
  const live = now < end;
  const laps: Json[] = [];
  const entries = GRID.map((g, i) => {
    const participantId = `demo-p-${g.kart}`;
    const driver = { id: g.driverId ?? `demo-d-${g.kart}`, name: g.name };
    const own: { lap: number; start: number; end: number; us: number }[] = [];
    let cross = start + 22_000 + i * 1_600; // first crossing after the out-lap only starts the clock
    for (let n = 1; ; n++) {
      const dur = Math.round(g.pace * (0.985 + rnd(cycle, Number(g.kart), n) * 0.035));
      const next = cross + dur;
      if (next > now || (!live && cross >= end)) break;
      own.push({ lap: n, start: cross, end: next, us: dur * 1000 });
      cross = next;
    }
    for (const l of own)
      laps.push({
        participantId,
        lapNumber: l.lap,
        lapTime: lapTime(l.us),
        startedAt: new Date(l.start).toISOString(),
        endedAt: new Date(l.end).toISOString(),
        valid: true,
        flags: [],
        invalidReason: null,
        kart: g.kart,
        driver,
      });
    const best = own.reduce<(typeof own)[number] | null>((b, l) => (!b || l.us < b.us ? l : b), null);
    return {
      participantId,
      position: null as number | null,
      driver: { ...driver, isMember: !!g.member },
      teamName: null,
      karts: g.kart,
      lapsCompleted: own.length,
      bestLap: best ? lapTime(best.us) : null,
      bestLapNumber: best?.lap ?? null,
      averageLap: own.length ? lapTime(Math.round(own.reduce((s, l) => s + l.us, 0) / own.length)) : null,
      totalTimeUs: own.length ? (own[own.length - 1].end - own[0].start) * 1000 : null,
      gap: null as Json,
      hasFastestLap: false,
      disqualified: false,
      _bestEnd: best?.end ?? Infinity,
    };
  });
  // Rental ranking: best lap, ties to whoever set it first; no lap yet = no position.
  entries.sort((a, b) => (a.bestLap && b.bestLap ? a.bestLap.us - b.bestLap.us || a._bestEnd - b._bestEnd : a.bestLap ? -1 : b.bestLap ? 1 : b.lapsCompleted - a.lapsCompleted));
  const leader = entries[0]?.bestLap;
  entries.forEach((e, i) => {
    if (!e.bestLap) return;
    e.position = i + 1;
    e.hasFastestLap = i === 0;
    if (i > 0 && leader) {
      const us = e.bestLap.us - leader.us;
      e.gap = { us, display: `+${(us / 1e6).toFixed(3)}` };
    }
  });
  laps.sort((a, b) => a.endedAt.localeCompare(b.endedAt));
  const startedAt = new Date(start).toISOString();
  const base = F[`/sessions/${LIVE_ID}/leaderboard`].session;
  const session = {
    ...base,
    status: live ? 'running' : 'finished',
    resultStatus: live ? 'live' : 'provisional',
    startedAt,
    endedAt: live ? null : new Date(end).toISOString(),
    participantCount: GRID.length,
  };
  return { session, entries: entries.map(({ _bestEnd, ...e }) => e), laps, live };
}

// ── Router ───────────────────────────────────────────────────────────────
const AUTH_PREFIXES = ['/me', '/orders', '/tickets/'];

export async function demoRequest(method: string, fullPath: string, body: Json, hasToken: boolean): Promise<DemoResponse> {
  await new Promise((r) => setTimeout(r, 60)); // feel like a network call
  const [path, query = ''] = fullPath.split('?');
  const q = new URLSearchParams(query);
  const seg = path.split('/').filter(Boolean);
  if (AUTH_PREFIXES.some((p) => path === p || path.startsWith(p.endsWith('/') ? p : `${p}/`)) && !hasToken)
    return fail(401, 'unauthorized', 'Please sign in.');

  if (method === 'GET') return get(path, seg, q);
  return mutate(method, path, seg, body ?? {});
}

function sessionsList() {
  const sim = simulate();
  return ALL_SESSIONS.map((s) => (s.id === LIVE_ID ? { ...s, status: sim.session.status, resultStatus: sim.session.resultStatus, startedAt: sim.session.startedAt, endedAt: sim.session.endedAt, participantCount: GRID.length } : s));
}

function get(path: string, seg: string[], q: URLSearchParams): DemoResponse {
  switch (path) {
    case '/venues':
    case '/home':
      return ok(F[path]);
    case '/me':
      return ok({ ...ME, driver: { ...ME.driver, name: state.displayName, showOnLeaderboards: state.showOnLeaderboards } });
    case '/me/profile': {
      const p = clone(F['/me/profile']);
      const sim = simulate();
      p.driver.name = state.displayName;
      p.points = state.rewards.balance;
      p.ticketsReady = state.tickets.filter((t) => t.status === 'active' && t.sessionsUsed < t.sessionsTotal).length;
      if (sim.live) p.currentKart = { number: '06', sessionId: LIVE_ID, sessionName: sim.session.name, status: 'running', venueName: VENUE.name };
      return ok(p);
    }
    case '/me/waivers':
      return ok({ waivers: state.waivers });
    case '/me/waivers/history':
      return ok({ signatures: state.waiverHistory });
    case '/me/orders':
      return ok({ orders: state.orders });
    case '/me/tickets':
      return ok({ tickets: state.tickets });
    case '/me/rewards':
      return ok(state.rewards);
    case '/me/friends':
      return ok({ friends: state.friends });
    case '/me/friends/leaderboard': {
      const board = clone(F[`/me/friends/leaderboard?trackId=${TRACK.id}`]);
      const friendIds = new Set(state.friends.filter((f) => f.status === 'accepted').map((f) => f.driverId));
      board.entries = board.entries.filter((e: Json) => e.isYou || friendIds.has(e.driver.id)).map((e: Json, i: number) => ({ ...e, position: i + 1 }));
      return ok(board);
    }
    case '/sessions': {
      const trackId = q.get('trackId');
      const limit = Number(q.get('limit') ?? 50);
      return ok({ sessions: sessionsList().filter((s) => !trackId || s.track.id === trackId).slice(0, limit) });
    }
  }
  if (seg[0] === 'sessions' && seg.length === 3) {
    if (seg[1] === LIVE_ID) {
      const sim = simulate();
      return seg[2] === 'laps' ? ok({ laps: sim.laps }) : ok({ session: sim.session, resultStatus: sim.session.resultStatus, entries: sim.entries });
    }
    const hit = F[`/sessions/${seg[1]}/${seg[2]}`];
    return hit ? ok(hit) : fail(404, 'not_found', 'Session not found');
  }
  if (seg[0] === 'tracks' && seg[2] === 'leaderboard') return ok(F[`/tracks/${seg[1]}/leaderboard?period=${q.get('period') ?? 'month'}`] ?? { mixedClasses: false, note: null, classesIncluded: [], entries: [] });
  if (seg[0] === 'tracks' && seg[2] === 'records') return ok(F[`/tracks/${seg[1]}/records`] ?? { records: [] });
  if (seg[0] === 'drivers' && seg[2] === 'sessions') return ok(seg[1] === ME.driver.id ? F[`/drivers/${seg[1]}/sessions?limit=200`] : { sessions: [] });
  if (seg[0] === 'drivers' && seg[2] === 'personal-best') return ok(seg[1] === ME.driver.id ? F[`/drivers/${seg[1]}/personal-best`] : { personalBests: [] });
  if (seg[0] === 'venues' && seg.length === 3) {
    const hit = F[path];
    return hit ? ok(hit) : fail(404, 'not_found', 'Not found');
  }
  return fail(404, 'not_found', 'Not available in the demo');
}

function mutate(method: string, path: string, seg: string[], b: Json): DemoResponse {
  const now = new Date().toISOString();
  if (path === '/auth/login') {
    if (String(b.email).trim().toLowerCase() === DEMO_EMAIL && b.password === state.password) return ok({ token: 'demo-token' });
    return fail(401, 'invalid_credentials', 'Wrong email or password.');
  }
  if (path === '/auth/register') return fail(403, 'demo', 'New sign-ups are off in this demo. Sign in with the demo account instead.');

  if (path === '/me/password') {
    if (b.currentPassword !== state.password) return fail(400, 'wrong_password', 'Your current password is wrong.');
    state.password = b.newPassword;
    save();
    return ok({ ok: true });
  }
  if (path === '/me/driver' && method === 'PATCH') {
    if (typeof b.showOnLeaderboards === 'boolean') state.showOnLeaderboards = b.showOnLeaderboards;
    if (typeof b.displayName === 'string' && b.displayName.trim()) state.displayName = b.displayName.trim();
    save();
    return ok({ ok: true });
  }

  if (path === '/orders') {
    const products: Json[] = F[`/venues/${VENUE.id}/products`].products;
    const items = (b.items as { productId: string; quantity: number }[]).map((it) => ({ p: products.find((p) => p.id === it.productId), quantity: it.quantity }));
    if (!items.length || items.some((i) => !i.p || i.quantity < 1)) return fail(400, 'bad_request', 'Choose at least one ticket.');
    const order = {
      id: id(),
      status: 'pending',
      totalSen: items.reduce((s, i) => s + i.p.priceSen * i.quantity, 0),
      currency: 'MYR',
      createdAt: now,
      paidAt: null,
      paymentProvider: 'demo',
      venueName: VENUE.name,
      items: items.map((i) => ({ name: i.p.name, quantity: i.quantity, unitPriceSen: i.p.priceSen, productId: i.p.id })),
    };
    state.orders.unshift(order);
    save();
    return ok({ order: { id: order.id, totalSen: order.totalSen }, payment: { provider: 'demo', demo: true } });
  }
  if (seg[0] === 'orders' && seg[2] === 'pay-demo') {
    const order = state.orders.find((o) => o.id === seg[1]);
    if (!order) return fail(404, 'not_found', 'Order not found');
    if (order.status === 'paid') return ok({ ok: true });
    order.status = 'paid';
    order.paidAt = now;
    const products: Json[] = F[`/venues/${VENUE.id}/products`].products;
    for (const it of order.items) {
      const p = products.find((x) => x.id === it.productId);
      for (let n = 0; n < it.quantity; n++)
        state.tickets.unshift({
          id: id(),
          code: code(),
          status: 'active',
          issuedAt: now,
          usedAt: null,
          orderId: order.id,
          sessionsTotal: p.sessions,
          sessionsUsed: 0,
          productName: p.name,
          sessionType: p.sessionType,
          description: p.description,
          venueId: VENUE.id,
          venueName: VENUE.name,
        });
    }
    const pts = Math.floor(order.totalSen / 1000);
    if (pts) {
      state.rewards.balance += pts;
      state.rewards.ledger.unshift({ delta: pts, reason: 'Ticket purchase', createdAt: now });
    }
    save();
    return ok({ ok: true });
  }
  if (path === '/me/tickets/redeem') return fail(404, 'not_found', 'No ticket with that code. Check the code on your receipt and try again.');
  if (seg[0] === 'tickets' && seg[2] === 'transfer') {
    const to = MEMBERS[String(b.memberCode).replace(/\s/g, '').toUpperCase()];
    const t = state.tickets.find((x) => x.id === seg[1]);
    if (!t) return fail(404, 'not_found', 'Ticket not found');
    if (!to) return fail(404, 'not_found', 'No member with that code.');
    state.tickets = state.tickets.filter((x) => x.id !== t.id);
    save();
    return ok({ to: { name: to.name } });
  }

  if (path === '/me/waivers') {
    const tpl = F[`/venues/${VENUE.id}/waiver`];
    const expires = new Date(Date.now() + 365 * 86_400_000).toISOString();
    state.waivers = [{ venue: { id: VENUE.id, name: VENUE.name }, valid: true, signedAt: now, expiresAt: expires, version: tpl.version }];
    state.waiverHistory.unshift({ id: id(), venueName: VENUE.name, title: tpl.title, version: tpl.version, signedName: b.signedName, guardianName: b.guardianName ?? null, signedAt: now, expiresAt: expires, inDate: true });
    state.waiverHistory.slice(1).forEach((s) => (s.inDate = false));
    save();
    return ok({ ok: true });
  }

  if (path === '/me/rewards/redeem') {
    const item = state.rewards.items.find((i: Json) => i.id === b.itemId);
    if (!item) return fail(404, 'not_found', 'Reward not found');
    if (state.rewards.balance < item.costTokens) return fail(409, 'insufficient_points', `You need ${item.costTokens - state.rewards.balance} more points for this.`);
    const voucher = { id: id(), code: code(), status: 'pending', costTokens: item.costTokens, createdAt: now, name: item.name };
    state.rewards.balance -= item.costTokens;
    state.rewards.ledger.unshift({ delta: -item.costTokens, reason: `Redeemed: ${item.name}`, createdAt: now });
    state.rewards.redemptions.unshift(voucher);
    save();
    return ok({ code: voucher.code, name: item.name, balance: state.rewards.balance });
  }

  if (path === '/me/friends') {
    const c = String(b.memberCode).replace(/\s/g, '').toUpperCase();
    if (c === ME.driver.memberCode) return fail(400, 'self', "That's your own member code.");
    const m = MEMBERS[c];
    if (!m) return fail(404, 'not_found', 'No member with that code. In this demo, Daniel Lee is 6JA HE4.');
    if (state.friends.some((f) => f.driverId === m.driverId)) return fail(409, 'exists', `You and ${m.name} are already friends.`);
    state.friends.push({ driverId: m.driverId, name: m.name, status: 'accepted', direction: 'friends' });
    save();
    return ok({ friend: { name: m.name }, status: 'accepted' });
  }
  if (seg[0] === 'me' && seg[1] === 'friends' && seg[3] === 'accept') {
    const f = state.friends.find((x) => x.driverId === seg[2]);
    if (f) Object.assign(f, { status: 'accepted', direction: 'friends' });
    save();
    return ok({ ok: true });
  }
  if (seg[0] === 'me' && seg[1] === 'friends' && method === 'DELETE') {
    state.friends = state.friends.filter((x) => x.driverId !== seg[2]);
    save();
    return ok({ ok: true });
  }
  return fail(404, 'not_found', 'Not available in the demo');
}
