export interface Track {
  id: string;
  name: string;
  lengthM: number;
  corners: number;
  recordMs: number;
  description: string;
}

export interface SessionType {
  id: string;
  name: string;
  minutes: number;
  price: number;
  minAge: number;
  description: string;
}

export interface Driver {
  id: string;
  name: string;
  /** Typical lap time on the main track, used to seed simulations and leaderboards. */
  paceMs: number;
}

export const TRACKS: Track[] = [
  {
    id: 'summit',
    name: 'The Summit Circuit',
    lengthM: 620,
    corners: 14,
    recordMs: 38_412,
    description: 'Multi-level indoor layout with a bridge crossover and a fast downhill hairpin.',
  },
  {
    id: 'ridge',
    name: 'Ridge Sprint',
    lengthM: 410,
    corners: 9,
    recordMs: 27_905,
    description: 'Short, technical and perfect for juniors and first-timers.',
  },
];

export const SESSION_TYPES: SessionType[] = [
  {
    id: 'arrive-drive',
    name: 'Arrive & Drive',
    minutes: 15,
    price: 29,
    minAge: 12,
    description: 'One timed session. Turn up, suit up, set a lap time.',
  },
  {
    id: 'grand-prix',
    name: 'Grand Prix',
    minutes: 35,
    price: 59,
    minAge: 14,
    description: 'Qualifying plus a 20-lap race with a podium finish.',
  },
  {
    id: 'junior',
    name: 'Junior Cadet',
    minutes: 12,
    price: 22,
    minAge: 8,
    description: 'Speed-limited karts on Ridge Sprint for drivers aged 8–13.',
  },
  {
    id: 'endurance',
    name: 'Team Endurance',
    minutes: 60,
    price: 89,
    minAge: 16,
    description: 'Teams of 2–4 with driver changes and pit stops.',
  },
];

export const RIVALS: Driver[] = [
  { id: 'd1', name: 'Max Rowe', paceMs: 39_120 },
  { id: 'd2', name: 'Lena Ortiz', paceMs: 39_480 },
  { id: 'd3', name: 'Sam Patel', paceMs: 39_950 },
  { id: 'd4', name: 'Jordan Blake', paceMs: 40_310 },
  { id: 'd5', name: 'Aisha Khan', paceMs: 40_620 },
  { id: 'd6', name: 'Theo Grant', paceMs: 41_050 },
  { id: 'd7', name: 'Mia Chen', paceMs: 41_400 },
  { id: 'd8', name: 'Ollie Ward', paceMs: 42_200 },
  { id: 'd9', name: 'Priya Das', paceMs: 42_900 },
  { id: 'd10', name: 'Leo Fischer', paceMs: 43_700 },
];

export const OPEN_HOUR = 10;
export const CLOSE_HOUR = 22;
export const SLOT_CAPACITY = 12;

/** Deterministic pseudo-random so seeded data is stable across reloads. */
export function seeded(seed: number) {
  // scramble the seed so nearby seeds don't produce near-identical sequences
  let s = Math.imul(seed ^ (seed >>> 16), 0x45d9f3b) >>> 0;
  s = Math.imul(s ^ (s >>> 16), 0x45d9f3b) >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** 32-bit FNV-1a hash of a string, for seeding. */
export function hashString(str: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

export function formatLap(ms: number) {
  const m = Math.floor(ms / 60_000);
  const s = ((ms % 60_000) / 1000).toFixed(3).padStart(6, '0');
  return m > 0 ? `${m}:${s}` : s;
}

export function formatGap(ms: number) {
  return `+${(ms / 1000).toFixed(3)}`;
}

export function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Spots already taken by other customers in a slot (stable per date/time/session). */
export function takenSpots(date: string, hour: number, sessionId: string) {
  const rand = seeded(hashString(`${date}|${hour}|${sessionId}`));
  const peak = hour >= 17 && hour <= 20 ? 4 : 0;
  return Math.min(SLOT_CAPACITY, Math.floor(rand() * 9) + peak);
}

export interface LeaderboardEntry {
  name: string;
  lapMs: number;
  date: string;
  isYou?: boolean;
}

/** Seeded all-time leaderboard for a track. */
export function seededLeaderboard(track: Track, period: 'day' | 'month' | 'all'): LeaderboardEntry[] {
  const periodFactor = { day: 1.035, month: 1.012, all: 1 }[period];
  const rand = seeded(track.lengthM * (period === 'day' ? 3 : period === 'month' ? 5 : 7));
  const scale = track.recordMs / 38_412;
  const today = new Date();
  return RIVALS.map((d) => {
    const lapMs = Math.round(d.paceMs * scale * periodFactor - rand() * 900);
    const daysAgo = period === 'day' ? 0 : Math.floor(rand() * (period === 'month' ? 28 : 365));
    const date = new Date(today.getTime() - daysAgo * 86_400_000);
    return { name: d.name, lapMs: Math.max(lapMs, track.recordMs), date: dayKey(date) };
  }).sort((a, b) => a.lapMs - b.lapMs);
}
