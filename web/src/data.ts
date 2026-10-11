/**
 * Static catalogue for the booking demo. Bookings are not yet connected to the server
 * (optional bookings & payments module, Phase 4) and are stored on the device only.
 */
export interface BookableTrack {
  id: string;
  name: string;
  description: string;
}

export interface SessionOffer {
  id: string;
  name: string;
  minutes: number;
  /** Price in Malaysian ringgit. */
  price: number;
  minAge: number;
  description: string;
}

export const TRACKS: BookableTrack[] = [
  { id: 'main', name: 'Main Circuit', description: 'Full layout with the bridge crossover and the fast downhill hairpin.' },
  { id: 'junior', name: 'Junior Loop', description: 'Short, technical and perfect for juniors and first-timers.' },
];

export const SESSION_TYPES: SessionOffer[] = [
  { id: 'arrive-drive', name: 'Arrive & Drive', minutes: 10, price: 70, minAge: 12, description: 'One timed session. Turn up, suit up, set a lap time.' },
  { id: 'grand-prix', name: 'Grand Prix', minutes: 30, price: 160, minAge: 14, description: 'Qualifying plus a race with a podium finish.' },
  { id: 'junior', name: 'Junior Cadet', minutes: 8, price: 50, minAge: 7, description: 'Speed-limited karts on the Junior Loop for ages 7–13.' },
  { id: 'endurance', name: 'Team Endurance', minutes: 60, price: 250, minAge: 16, description: 'Teams of 2–4 with driver changes and pit stops (per driver).' },
];

export const OPEN_HOUR = 10;
export const CLOSE_HOUR = 23;
export const SLOT_CAPACITY = 12;

/** Deterministic pseudo-random so demo availability is stable across reloads. */
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

export function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Demo: spots already taken by other customers in a slot (stable per date/time/session). */
export function takenSpots(date: string, hour: number, sessionId: string) {
  const rand = seeded(hashString(`${date}|${hour}|${sessionId}`));
  const peak = hour >= 17 && hour <= 20 ? 4 : 0;
  return Math.min(SLOT_CAPACITY, Math.floor(rand() * 9) + peak);
}
