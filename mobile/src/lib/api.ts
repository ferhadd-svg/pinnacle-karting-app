import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Timing API base URL. Set EXPO_PUBLIC_API_URL to your server; on a physical phone in development
 * use the computer's LAN address (e.g. http://192.168.1.20:3000), not localhost.
 */
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';
const TOKEN_KEY = 'pinnacle.token';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

let token: string | null = null;

/** Token lives in the iOS Keychain / Android Keystore (localStorage only in the web preview). */
const storage = {
  get: async () => (Platform.OS === 'web' ? globalThis.localStorage?.getItem(TOKEN_KEY) ?? null : SecureStore.getItemAsync(TOKEN_KEY)),
  set: async (v: string) => (Platform.OS === 'web' ? globalThis.localStorage?.setItem(TOKEN_KEY, v) : SecureStore.setItemAsync(TOKEN_KEY, v)),
  clear: async () => (Platform.OS === 'web' ? globalThis.localStorage?.removeItem(TOKEN_KEY) : SecureStore.deleteItemAsync(TOKEN_KEY)),
};

let tokenLoad: Promise<string | null> | null = null;

/**
 * Read the saved token once. Every request awaits this, so a screen opened straight from a deep link or
 * notification never fires before the token is known.
 */
export function loadToken() {
  tokenLoad ??= storage
    .get()
    .catch(() => null)
    .then((t) => (token = t ?? null));
  return tokenLoad;
}

export async function setToken(t: string | null) {
  token = t;
  tokenLoad = Promise.resolve(t);
  try {
    if (t) await storage.set(t);
    else await storage.clear();
  } catch {
    /* keep the in-memory token */
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  await loadToken();
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(`${API_URL}/v1${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError(0, 'offline', "Can't reach the timing server. Check your connection and try again.");
  }
  const text = await res.text();
  const data = text && res.headers.get('content-type')?.includes('json') ? JSON.parse(text) : text;
  if (!res.ok) throw new ApiError(res.status, data?.error ?? 'error', data?.message ?? `Request failed (${res.status})`);
  return data as T;
}

const qs = (o: Record<string, string | number | undefined | null>) => {
  const p = Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '');
  return p.length ? `?${p.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&')}` : '';
};

// ── Types (mirror server/src/services/queries.ts) ────────────────────────
export interface LapTime {
  us: number;
  display: string;
}
export type ResultStatus = 'not_started' | 'live' | 'provisional' | 'final' | 'cancelled';
export type SessionType = 'practice' | 'rental' | 'qualifying' | 'sprint' | 'endurance';
export interface Venue {
  id: string;
  name: string;
  timezone: string;
  tracks: { id: string; name: string; layout: string; lengthM: number | null }[];
}
export interface SessionSummary {
  id: string;
  name: string;
  type: SessionType;
  status: string;
  resultStatus: ResultStatus;
  startedAt: string | null;
  track: { id: string; name: string };
  venueName: string;
  participantCount: number;
}
export interface SessionDetail {
  id: string;
  name: string;
  type: SessionType;
  resultStatus: ResultStatus;
  startedAt: string | null;
  endedAt: string | null;
  track: { id: string; name: string; layout: string };
  venue: { id: string; name: string; timezone: string };
  kartClass: { id: string; name: string } | null;
}
export interface LeaderboardEntry {
  participantId: string;
  position: number | null;
  driver: { id: string; name: string; isMember?: boolean } | null;
  teamName: string | null;
  karts: string | null;
  lapsCompleted: number;
  bestLap: LapTime | null;
  bestLapNumber: number | null;
  averageLap: LapTime | null;
  gap: { laps: number } | { us: number; display: string } | null;
  hasFastestLap: boolean;
  disqualified: boolean;
}
export interface Lap {
  participantId: string;
  lapNumber: number;
  lapTime: LapTime;
  endedAt: string;
  valid: boolean;
  flags: string[];
  invalidReason: string | null;
  kart: string | null;
  driver: { id: string; name: string } | null;
}
export interface Me {
  id: string;
  email: string;
  role: 'driver' | 'operator' | 'admin';
  driver: { id: string; name: string; showOnLeaderboards: boolean; memberCode: string } | null;
}
export interface DriverSession {
  session: { id: string; name: string; type: SessionType; startedAt: string; resultStatus: ResultStatus };
  track: { id: string; name: string };
  venue: { id: string; name: string };
  position: number | null;
  fieldSize: number;
  laps: number;
  bestLap: LapTime | null;
  averageLap: LapTime | null;
  karts: string | null;
}
export interface PersonalBest {
  track: { id: string; name: string; layout: string };
  kartClass: { id: string; name: string } | null;
  lapTime: LapTime;
  sessionId: string;
  setAt: string;
}
export interface TrackBoard {
  mixedClasses: boolean;
  note: string | null;
  classesIncluded: { id: string | null; name: string | null }[];
  entries: { position: number; driver: { id: string; name: string }; kartClass: { name: string } | null; lapTime: LapTime; gapUs: number; sessionId: string; setAt: string }[];
}
export interface TrackRecord {
  kartClass: { name: string } | null;
  lapTime: LapTime;
  driver: { name: string } | null;
  setAt: string;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  sessionType: SessionType;
  priceSen: number;
  minAge: number | null;
}
export interface Ticket {
  id: string;
  code: string;
  status: 'active' | 'used' | 'void';
  issuedAt: string;
  usedAt: string | null;
  orderId: string | null;
  productName: string;
  sessionType: SessionType;
  description: string;
  venueId: string;
  venueName: string;
}
export interface Order {
  id: string;
  status: 'pending' | 'paid' | 'cancelled' | 'refunded';
  totalSen: number;
  currency: string;
  createdAt: string;
  paidAt: string | null;
  paymentProvider: string | null;
  venueName: string;
  items: { name: string; quantity: number; unitPriceSen: number }[];
}
export interface WaiverTemplate {
  id: string;
  version: number;
  title: string;
  body: string;
  validDays: number;
}
export interface WaiverStatus {
  venue: { id: string; name: string };
  valid: boolean;
  signedAt: string | null;
  expiresAt: string | null;
  version: number | null;
}
export interface Rewards {
  balance: number;
  ledger: { delta: number; reason: string; createdAt: string }[];
  items: { id: string; name: string; description: string; costTokens: number; venueName: string }[];
  redemptions: { id: string; code: string; status: 'pending' | 'fulfilled' | 'cancelled'; costTokens: number; createdAt: string; name: string }[];
  rules: { perRm10: number; participation: number; podium: number };
}
export interface Friend {
  driverId: string;
  name: string;
  status: 'pending' | 'accepted';
  direction: 'incoming' | 'outgoing' | 'friends';
}
export interface FriendsBoardEntry {
  position: number;
  driver: { id: string; name: string };
  isYou: boolean;
  lapTime: LapTime;
  gapUs: number;
  sessionId: string;
  setAt: string;
}

export const api = {
  login: (email: string, password: string) => request<{ token: string }>('POST', '/auth/login', { email, password }),
  register: (b: { email: string; password: string; displayName: string }) => request<{ token: string }>('POST', '/auth/register', b),
  me: () => request<Me>('GET', '/me'),
  updateMyDriver: (b: { displayName?: string; showOnLeaderboards?: boolean }) => request('PATCH', '/me/driver', b),
  venues: () => request<Venue[]>('GET', '/venues'),
  sessions: (f: { trackId?: string; limit?: number } = {}) => request<{ sessions: SessionSummary[] }>('GET', `/sessions${qs(f)}`).then((r) => r.sessions),
  sessionLeaderboard: (id: string) =>
    request<{ session: SessionDetail; resultStatus: ResultStatus; entries: LeaderboardEntry[] }>('GET', `/sessions/${id}/leaderboard`),
  sessionLaps: (id: string) => request<{ laps: Lap[] }>('GET', `/sessions/${id}/laps`).then((r) => r.laps),
  trackLeaderboard: (trackId: string, period: string, classId?: string) => request<TrackBoard>('GET', `/tracks/${trackId}/leaderboard${qs({ period, classId })}`),
  trackRecords: (trackId: string) => request<{ records: TrackRecord[] }>('GET', `/tracks/${trackId}/records`).then((r) => r.records),
  driverSessions: (id: string) => request<{ sessions: DriverSession[] }>('GET', `/drivers/${id}/sessions?limit=200`).then((r) => r.sessions),
  personalBests: (id: string) => request<{ personalBests: PersonalBest[] }>('GET', `/drivers/${id}/personal-best`).then((r) => r.personalBests),

  products: (venueId: string) => request<{ products: Product[]; payments: 'demo' | 'none' }>('GET', `/venues/${venueId}/products`),
  waiver: (venueId: string) => request<WaiverTemplate>('GET', `/venues/${venueId}/waiver`),
  myWaivers: () => request<{ waivers: WaiverStatus[] }>('GET', '/me/waivers').then((r) => r.waivers),
  signWaiver: (b: { templateId: string; signedName: string; guardianName?: string }) => request('POST', '/me/waivers', { ...b, accept: true }),
  createOrder: (venueId: string, items: { productId: string; quantity: number }[]) =>
    request<{ order: { id: string; totalSen: number }; payment: { provider: string; demo: boolean } }>('POST', '/orders', { venueId, items }),
  payDemo: (orderId: string) => request('POST', `/orders/${orderId}/pay-demo`, {}),
  myOrders: () => request<{ orders: Order[] }>('GET', '/me/orders').then((r) => r.orders),
  myTickets: () => request<{ tickets: Ticket[] }>('GET', '/me/tickets').then((r) => r.tickets),
  redeemTicket: (code: string) => request<Ticket>('POST', '/me/tickets/redeem', { code }),
  transferTicket: (id: string, memberCode: string) => request<{ to: { name: string } }>('POST', `/tickets/${id}/transfer`, { memberCode }),
  rewards: () => request<Rewards>('GET', '/me/rewards'),
  redeemReward: (itemId: string) => request<{ code: string; name: string; balance: number }>('POST', '/me/rewards/redeem', { itemId }),
  friends: () => request<{ friends: Friend[] }>('GET', '/me/friends').then((r) => r.friends),
  addFriend: (memberCode: string) => request<{ friend: { name: string }; status: string }>('POST', '/me/friends', { memberCode }),
  acceptFriend: (driverId: string) => request('POST', `/me/friends/${driverId}/accept`, {}),
  removeFriend: (driverId: string) => request('DELETE', `/me/friends/${driverId}`),
  friendsLeaderboard: (trackId: string) =>
    request<{ entries: FriendsBoardEntry[] }>('GET', `/me/friends/leaderboard?trackId=${encodeURIComponent(trackId)}`).then((r) => r.entries),
};

export const formatRM = (sen: number) => `RM ${(sen / 100).toFixed(2)}`;
