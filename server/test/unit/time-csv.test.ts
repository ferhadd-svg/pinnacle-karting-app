import { describe, expect, it } from 'vitest';
import { csvToPassings, parseCsv } from '../../src/timing/csv.js';
import { formatLapUs, parseTimestampUs, usToIso } from '../../src/timing/time.js';

const KL = { timeZone: 'Asia/Kuala_Lumpur' };

describe('parseTimestampUs', () => {
  it('parses ISO with offset, Z, local time and microseconds', () => {
    const utc = Date.UTC(2026, 9, 11, 6, 30, 0) * 1000;
    expect(parseTimestampUs('2026-10-11T14:30:00.123+08:00', KL)).toBe(utc + 123_000);
    expect(parseTimestampUs('2026-10-11T06:30:00.123456Z', KL)).toBe(utc + 123_456);
    expect(parseTimestampUs('2026-10-11 14:30:00.5', KL)).toBe(utc + 500_000);
    expect(parseTimestampUs('14:30:00.000', { ...KL, date: '2026-10-11' })).toBe(utc);
  });

  it('parses epoch seconds, milliseconds and microseconds', () => {
    const ms = Date.UTC(2026, 9, 11, 6, 30, 0);
    expect(parseTimestampUs(ms / 1000, KL)).toBe(ms * 1000);
    expect(parseTimestampUs(String(ms), KL)).toBe(ms * 1000);
    expect(parseTimestampUs(ms * 1000 + 7, KL)).toBe(ms * 1000 + 7);
  });

  it('handles zones with DST', () => {
    // 2026-07-01 12:00 in London is BST (UTC+1)
    expect(parseTimestampUs('2026-07-01 12:00:00', { timeZone: 'Europe/London' })).toBe(Date.UTC(2026, 6, 1, 11) * 1000);
  });

  it('rejects garbage and clock times without a date', () => {
    expect(() => parseTimestampUs('yesterday', KL)).toThrow();
    expect(() => parseTimestampUs('14:30:00', KL)).toThrow(/needs a date/);
  });

  it('round-trips through ISO with microseconds', () => {
    expect(usToIso(Date.UTC(2026, 9, 11) * 1000 + 1_234_567)).toBe('2026-10-11T00:00:01.234567Z');
  });
});

describe('formatLapUs', () => {
  it('formats like a timing screen', () => {
    expect(formatLapUs(60_900_000)).toBe('1:00.900');
    expect(formatLapUs(38_412_999)).toBe('38.412');
  });
});

describe('CSV', () => {
  it('parses quotes, CRLF and semicolons', () => {
    expect(parseCsv('a;b\r\n"x;1";"say ""hi"""\r\n')).toEqual([
      ['a', 'b'],
      ['x;1', 'say "hi"'],
    ]);
  });

  it('maps a passings export to idempotent events and reports bad rows', () => {
    const csv = ['Transponder,Time,Loop', '1001,14:30:00.000,finish', '1001,14:31:01.200,', ',14:31:02.000,finish', '1002,not-a-time,finish'].join('\n');
    const { passings, errors } = csvToPassings(csv, { ...KL, date: '2026-10-11' });
    expect(passings).toHaveLength(2);
    expect(passings[1].loopCode).toBe('finish');
    expect(errors.map((e) => e.row)).toEqual([4, 5]);
    // Same content → same key, so re-imports dedupe
    expect(csvToPassings(csv, { ...KL, date: '2026-10-11' }).passings[0].eventKey).toBe(passings[0].eventKey);
  });

  it('honours an explicit column map', () => {
    const { passings } = csvToPassings('chipno,passing\nA7,2026-10-11T14:30:00+08:00', {
      ...KL,
      columns: { transponder: 'chipno', timestamp: 'passing' },
    });
    expect(passings[0]).toMatchObject({ transponderCode: 'A7', loopCode: 'finish' });
  });
});
