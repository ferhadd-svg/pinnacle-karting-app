import type { ResultStatus, SessionType } from './api';

/** 61_200_000 µs → "1:01.200"; truncated to ms like a timing screen. */
export function formatLap(us: number) {
  const ms = Math.floor(us / 1000);
  const m = Math.floor(ms / 60_000);
  const s = ((ms % 60_000) / 1000).toFixed(3);
  return m > 0 ? `${m}:${s.padStart(6, '0')}` : s;
}

/** Signed seconds: +0.412 / −0.120. */
export const formatDelta = (us: number) => `${us > 0 ? '+' : us < 0 ? '−' : '±'}${(Math.abs(us) / 1e6).toFixed(3)}`;

export const formatDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
/** Session times are shown in the venue's time zone when known, so they match the track's clock. */
export const formatDateTime = (iso: string | null, timeZone?: string) =>
  iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone }) : '—';

/** "ABC234" → "ABC 234" for reading out at the desk. */
export const formatMemberCode = (code: string) => `${code.slice(0, 3)} ${code.slice(3)}`;

/** 8-character ticket/voucher codes read as two groups of four. */
export const formatTicketCode = (code: string) => `${code.slice(0, 4)} ${code.slice(4)}`;

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

export const isRace = (t: SessionType) => t === 'sprint' || t === 'endurance';
