import { createHash } from 'node:crypto';
import { parseTimestampUs, type ParseContext } from './time.js';

/** Minimal RFC 4180 CSV parser (quoted fields, escaped quotes, CRLF). Also accepts ; and tab delimiters. */
export function parseCsv(text: string, delimiter?: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.slice(0, src.search(/\r?\n|$/));
  const delim =
    delimiter ?? ([',', ';', '\t'] as const).reduce((best, d) => (firstLine.split(d).length > firstLine.split(best).length ? d : best), ',');

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === delim) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== '')) rows.push(row);
  return rows;
}

/** Which CSV column holds each value. Matched case-insensitively against the header row. */
export interface PassingColumnMap {
  transponder: string;
  timestamp: string;
  loop?: string;
  sequence?: string;
}

export const DEFAULT_COLUMN_CANDIDATES: Record<keyof PassingColumnMap, string[]> = {
  transponder: ['transponder', 'transponder_id', 'tx', 'transponder no', 'chip'],
  timestamp: ['timestamp', 'time', 'passing_time', 'detected_at', 'rtc_time'],
  loop: ['loop', 'loop_id', 'timing_point', 'decoder_loop'],
  sequence: ['sequence', 'seq', 'passing_number', 'passing_id', 'event_id'],
};

export interface NormalizedPassing {
  /** Idempotency key, unique per source device. */
  eventKey: string;
  transponderCode: string;
  loopCode: string;
  detectedUs: number;
  sequence: number | null;
  raw: Record<string, unknown>;
}

export interface CsvRowError {
  row: number;
  message: string;
}

/**
 * Convert a passings CSV (one row per line crossing) into normalised timing events.
 *
 * The idempotency key is a hash of (transponder, loop, timestamp) — not the row number — so the same
 * export can be re-imported, or overlapping exports imported, without creating duplicate events.
 */
export function csvToPassings(
  text: string,
  ctx: ParseContext & { defaultLoop?: string; columns?: Partial<PassingColumnMap> },
): { passings: NormalizedPassing[]; errors: CsvRowError[] } {
  const rows = parseCsv(text);
  if (rows.length === 0) return { passings: [], errors: [{ row: 0, message: 'Empty file' }] };
  const header = rows[0].map((h) => h.trim().toLowerCase());

  const col = (key: keyof PassingColumnMap): number => {
    const wanted = ctx.columns?.[key];
    const names = wanted ? [wanted.toLowerCase()] : DEFAULT_COLUMN_CANDIDATES[key];
    return header.findIndex((h) => names.includes(h));
  };
  const idx = { transponder: col('transponder'), timestamp: col('timestamp'), loop: col('loop'), sequence: col('sequence') };
  const errors: CsvRowError[] = [];
  if (idx.transponder < 0) errors.push({ row: 1, message: 'No transponder column found in header' });
  if (idx.timestamp < 0) errors.push({ row: 1, message: 'No timestamp column found in header' });
  if (errors.length) return { passings: [], errors };

  const passings: NormalizedPassing[] = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    const raw = Object.fromEntries(header.map((h, i) => [h, cells[i] ?? '']));
    const transponderCode = (cells[idx.transponder] ?? '').trim();
    const loopCode = idx.loop >= 0 ? (cells[idx.loop] ?? '').trim() || (ctx.defaultLoop ?? 'finish') : (ctx.defaultLoop ?? 'finish');
    if (!transponderCode) {
      errors.push({ row: r + 1, message: 'Missing transponder' });
      continue;
    }
    let detectedUs: number;
    try {
      detectedUs = parseTimestampUs(cells[idx.timestamp] ?? '', ctx);
    } catch (e) {
      errors.push({ row: r + 1, message: (e as Error).message });
      continue;
    }
    const seqText = idx.sequence >= 0 ? (cells[idx.sequence] ?? '').trim() : '';
    const eventKey = createHash('sha256').update(`${transponderCode}|${loopCode}|${detectedUs}`).digest('hex').slice(0, 32);
    passings.push({
      eventKey,
      transponderCode,
      loopCode,
      detectedUs,
      sequence: seqText && /^\d+$/.test(seqText) ? Number(seqText) : null,
      raw,
    });
  }
  return { passings, errors };
}
