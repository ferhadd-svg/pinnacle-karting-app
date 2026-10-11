/** Typed client for the Pinnacle timing API (server/). */
const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000';
const TOKEN_KEY = 'pinnacle-karting:token';

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
try {
  token = localStorage.getItem(TOKEN_KEY);
} catch {
  /* storage unavailable */
}

export const hasToken = () => token !== null;

export function setToken(t: string | null) {
  token = t;
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(`${BASE}/v1${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError(0, 'offline', `Can't reach the timing server at ${BASE}`);
  }
  const text = await res.text();
  const data = text && res.headers.get('content-type')?.includes('json') ? JSON.parse(text) : text;
  if (!res.ok) throw new ApiError(res.status, data?.error ?? 'error', data?.message ?? res.statusText);
  return data as T;
}

const qs = (o: Record<string, string | number | undefined | null>) => {
  const p = Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '');
  return p.length ? `?${new URLSearchParams(p.map(([k, v]) => [k, String(v)]))}` : '';
};

// ── Types ───────────────────────────────────────────────────────────────
export interface LapTime {
  us: number;
  display: string;
}
export type ResultStatus = 'not_started' | 'live' | 'provisional' | 'final' | 'cancelled';
export type SessionType = 'practice' | 'rental' | 'qualifying' | 'sprint' | 'endurance';
export const SESSION_TYPES: SessionType[] = ['practice', 'rental', 'qualifying', 'sprint', 'endurance'];
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
  scheduledStart: string | null;
  endedAt: string | null;
  track: { id: string; name: string };
  venueName: string;
  participantCount: number;
}
export interface SessionDetail extends Omit<SessionSummary, 'venueName'> {
  venue: { id: string; name: string; timezone: string };
  kartClass: { id: string; name: string } | null;
  resultsVersion: number;
}
export interface LeaderboardEntry {
  participantId: string;
  position: number | null;
  driver: { id: string; name: string } | null;
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
  endRef?: string;
}
export interface Me {
  id: string;
  email: string;
  role: 'driver' | 'operator' | 'admin';
  venueId: string | null;
  driver: { id: string; name: string; showOnLeaderboards: boolean } | null;
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
  period: string;
  mixedClasses: boolean;
  note: string | null;
  classesIncluded: { id: string | null; name: string | null }[];
  entries: {
    position: number;
    driver: { id: string; name: string };
    kartClass: { name: string } | null;
    lapTime: LapTime;
    gapUs: number;
    sessionId: string;
    setAt: string;
  }[];
}
export interface Anomalies {
  status: string;
  missingTransponders: { participant_id: string; kart: string }[];
  lateEventsAfterFinalisation?: number;
  rejectedCrossings: { participantId: string; ref: string; at: string; reason: string; gap: string | null }[];
  flaggedLaps: { participantId: string; lapNumber: number; lapTime: string; flags: string[]; endRef: string }[];
  unmatchedEvents: { ref: string; transponder: string; loop: string; at: string }[];
  unknownLoops: string[];
}
export interface Device {
  id: string;
  name: string;
  provider: string;
  health: string;
  seconds_since_seen: number | null;
  events_5m: number;
  clock_offset_us: number;
}
export interface Kart {
  id: string;
  number: string;
  status: string;
  class_name: string | null;
  transponder_code: string | null;
}

// ── Calls ───────────────────────────────────────────────────────────────
export const api = {
  login: (email: string, password: string) => request<{ token: string }>('POST', '/auth/login', { email, password }),
  register: (b: { email: string; password: string; displayName: string }) => request<{ token: string }>('POST', '/auth/register', b),
  me: () => request<Me>('GET', '/me'),
  updateMyDriver: (b: { displayName?: string; showOnLeaderboards?: boolean }) => request('PATCH', '/me/driver', b),

  venues: () => request<Venue[]>('GET', '/venues'),
  sessions: (f: { venueId?: string; trackId?: string; status?: string; type?: string; limit?: number } = {}) =>
    request<{ sessions: SessionSummary[] }>('GET', `/sessions${qs(f)}`).then((r) => r.sessions),
  session: (id: string) => request<SessionDetail>('GET', `/sessions/${id}`),
  sessionLeaderboard: (id: string) =>
    request<{ session: SessionDetail; resultStatus: ResultStatus; entries: LeaderboardEntry[] }>('GET', `/sessions/${id}/leaderboard`),
  sessionLaps: (id: string, participantId?: string) =>
    request<{ laps: Lap[] }>('GET', `/sessions/${id}/laps${qs({ participantId })}`).then((r) => r.laps),
  trackLeaderboard: (trackId: string, period: string, classId?: string) =>
    request<TrackBoard>('GET', `/tracks/${trackId}/leaderboard${qs({ period, classId })}`),
  trackRecords: (trackId: string) =>
    request<{ records: { kartClass: { name: string } | null; lapTime: LapTime; driver: { name: string } | null; setAt: string }[] }>(
      'GET',
      `/tracks/${trackId}/records`,
    ).then((r) => r.records),
  driverSessions: (id: string, f: { venueId?: string; trackId?: string; type?: string; kart?: string; from?: string; to?: string } = {}) =>
    request<{ sessions: DriverSession[] }>('GET', `/drivers/${id}/sessions${qs(f)}`).then((r) => r.sessions),
  personalBests: (id: string) => request<{ personalBests: PersonalBest[] }>('GET', `/drivers/${id}/personal-best`).then((r) => r.personalBests),

  // Operator
  karts: (venueId: string) => request<{ karts: Kart[] }>('GET', `/karts${qs({ venueId })}`).then((r) => r.karts),
  devices: (venueId: string) => request<{ devices: Device[] }>('GET', `/devices${qs({ venueId })}`).then((r) => r.devices),
  createSession: (b: { trackId: string; type: SessionType; name: string }) => request<{ id: string }>('POST', '/sessions', b),
  addParticipant: (sessionId: string, b: { kartId: string; driverName?: string; teamName?: string }) =>
    request('POST', `/sessions/${sessionId}/participants`, b),
  lifecycle: (sessionId: string, action: 'start' | 'finish' | 'finalize' | 'recalculate') => request('POST', `/sessions/${sessionId}/${action}`, {}),
  reopen: (sessionId: string, reason: string) => request('POST', `/sessions/${sessionId}/reopen`, { reason }),
  anomalies: (sessionId: string) => request<Anomalies>('GET', `/sessions/${sessionId}/anomalies`),
  addCorrection: (sessionId: string, body: Record<string, unknown>) => request('POST', `/sessions/${sessionId}/corrections`, body),
  importPassings: (b: { trackId: string; csv: string; date?: string; sessionId?: string; setSessionWindowFromFile?: boolean }) =>
    request<{ received: number; accepted: number; duplicates: number; rowErrors: { row: number; message: string }[] }>('POST', '/imports/passings', b),
  exportCsv: (sessionId: string, type: 'results' | 'laps') => request<string>('GET', `/sessions/${sessionId}/export.csv?type=${type}`),
};

/** Subscribe to result changes for a session (server-sent events). Returns an unsubscribe function. */
export function watchSession(id: string, onChange: () => void): () => void {
  if (typeof EventSource === 'undefined') return () => {};
  const es = new EventSource(`${BASE}/v1/sessions/${id}/stream`);
  es.addEventListener('results', onChange);
  return () => es.close();
}

export const statusLabel: Record<ResultStatus, string> = {
  not_started: 'Not started',
  live: 'Live',
  provisional: 'Provisional',
  final: 'Final',
  cancelled: 'Cancelled',
};

export const typeLabel: Record<SessionType, string> = {
  practice: 'Practice',
  rental: 'Rental',
  qualifying: 'Qualifying',
  sprint: 'Sprint race',
  endurance: 'Endurance',
};

export const formatDateTime = (iso: string | null, timeZone?: string) =>
  iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone }) : '—';
