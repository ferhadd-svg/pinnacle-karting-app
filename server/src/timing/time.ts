/** Time helpers. Canonical representation: integer microseconds since the Unix epoch (UTC). */

const ISO = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:[.,](\d{1,9}))?\s*(Z|[+-]\d{2}:?\d{2})?$/i;
const CLOCK = /^(\d{1,2}):(\d{2}):(\d{2})(?:[.,](\d{1,9}))?$/;

/** Offset of `timeZone` from UTC, in minutes, at the given instant. */
export function tzOffsetMinutes(timeZone: string, atMs: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(atMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return Math.round((asUtc - Math.floor(atMs / 1000) * 1000) / 60_000);
}

function fractionToUs(frac: string | undefined) {
  if (!frac) return 0;
  return Number(frac.slice(0, 6).padEnd(6, '0'));
}

function localToUtcUs(y: number, mo: number, d: number, h: number, mi: number, s: number, us: number, timeZone: string) {
  const naiveMs = Date.UTC(y, mo - 1, d, h, mi, s);
  // Two passes handle instants near a DST change.
  let offset = tzOffsetMinutes(timeZone, naiveMs);
  offset = tzOffsetMinutes(timeZone, naiveMs - offset * 60_000);
  return (naiveMs - offset * 60_000) * 1000 + us;
}

export interface ParseContext {
  /** IANA zone used when the timestamp has no offset, e.g. "Asia/Kuala_Lumpur". */
  timeZone: string;
  /** YYYY-MM-DD used when the value is a bare clock time like "14:30:01.200". */
  date?: string;
}

/**
 * Parse a timing timestamp into epoch microseconds. Accepts:
 *  - ISO 8601 with or without offset ("2026-10-11T14:30:00.123456+08:00", "2026-10-11 14:30:00.123")
 *  - bare clock time with a context date ("14:30:00.000")
 *  - epoch numbers: seconds (≤1e11), milliseconds (≤1e14) or microseconds
 * Sub-microsecond digits are truncated.
 */
export function parseTimestampUs(value: string | number, ctx: ParseContext): number {
  if (typeof value === 'number' || /^\d+(\.\d+)?$/.test(String(value).trim())) {
    const n = Number(value);
    if (n < 1e11) return Math.round(n * 1e6);
    if (n < 1e14) return Math.round(n * 1e3);
    return Math.round(n);
  }
  const v = value.trim();
  let m = ISO.exec(v);
  if (m) {
    const [, y, mo, d, h, mi, s, frac, zone] = m;
    const us = fractionToUs(frac);
    if (!zone) return localToUtcUs(+y, +mo, +d, +h, +mi, +s, us, ctx.timeZone);
    const offsetMin =
      zone.toUpperCase() === 'Z'
        ? 0
        : (zone[0] === '-' ? -1 : 1) * (Number(zone.slice(1, 3)) * 60 + Number(zone.slice(-2)));
    return (Date.UTC(+y, +mo - 1, +d, +h, +mi, +s) - offsetMin * 60_000) * 1000 + us;
  }
  m = CLOCK.exec(v);
  if (m) {
    if (!ctx.date) throw new Error(`Clock time "${v}" needs a date`);
    const [y, mo, d] = ctx.date.split('-').map(Number);
    const [, h, mi, s, frac] = m;
    return localToUtcUs(y, mo, d, +h, +mi, +s, fractionToUs(frac), ctx.timeZone);
  }
  throw new Error(`Unrecognised timestamp "${v}"`);
}

export const usToIso = (us: number) => {
  const ms = Math.floor(us / 1000);
  const rest = String(us - ms * 1000).padStart(3, '0');
  return new Date(ms).toISOString().replace('Z', `${rest}Z`);
};

/** 61_200_000 → "1:01.200"; 38_412_000 → "38.412". Truncates to milliseconds, as timing screens do. */
export function formatLapUs(us: number): string {
  const ms = Math.floor(us / 1000);
  const m = Math.floor(ms / 60_000);
  const s = ((ms % 60_000) / 1000).toFixed(3);
  return m > 0 ? `${m}:${s.padStart(6, '0')}` : s;
}
