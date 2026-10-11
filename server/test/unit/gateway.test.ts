import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Spool } from '../../src/gateway/spool.js';
import { Uploader } from '../../src/gateway/uploader.js';

const ev = (n: number) => ({ eventKey: `b:${n}`, sequence: n, transponder: 'T1', loop: 'finish', timestamp: 1_800_000_000_000_000 + n });

describe('gateway store-and-forward', () => {
  it('keeps unacknowledged events across a restart and sends them after an outage', async () => {
    const file = join(await mkdtemp(join(tmpdir(), 'spool-')), 'events.jsonl');
    const spool = new Spool(file);
    await spool.open();
    for (let i = 1; i <= 5; i++) await spool.push(ev(i));

    let up = false;
    const received: unknown[] = [];
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      if (!up) throw new Error('ECONNREFUSED');
      received.push(...JSON.parse(String(init.body)).events);
      return new Response('{}', { status: 201 });
    }) as typeof fetch;
    const uploader = new Uploader(spool, { apiUrl: 'http://x', deviceKey: 'k', batchSize: 3, fetchImpl });

    await expect(uploader.flushOnce()).rejects.toThrow('ECONNREFUSED');
    expect(spool.size).toBe(5);

    // Gateway process restarts during the outage: nothing is lost.
    const reopened = new Spool(file);
    expect(await reopened.open()).toBe(5);

    up = true;
    const u2 = new Uploader(reopened, { apiUrl: 'http://x', deviceKey: 'k', batchSize: 3, fetchImpl });
    expect(await u2.flushOnce()).toBe(3);
    expect(await u2.flushOnce()).toBe(2);
    expect(await u2.flushOnce()).toBe(0);
    expect(received.map((e: any) => e.eventKey)).toEqual(['b:1', 'b:2', 'b:3', 'b:4', 'b:5']);
    expect(await new Spool(file).open()).toBe(0);
  });

  it('does not ack a batch the server failed to store', async () => {
    const file = join(await mkdtemp(join(tmpdir(), 'spool-')), 'events.jsonl');
    const spool = new Spool(file);
    await spool.open();
    await spool.push(ev(1));
    const uploader = new Uploader(spool, { apiUrl: 'http://x', deviceKey: 'k', fetchImpl: (async () => new Response('', { status: 503 })) as typeof fetch });
    await expect(uploader.flushOnce()).rejects.toThrow('503');
    expect(spool.size).toBe(1);
  });
});
