import type { Spool } from './spool.js';

export interface UploaderOptions {
  apiUrl: string;
  deviceKey: string;
  batchSize?: number;
  /** Injected for tests. */
  fetchImpl?: typeof fetch;
  log?: (msg: string) => void;
}

/** Drains the spool to the API in order, with exponential backoff while the server is unreachable. */
export class Uploader {
  private stopped = false;
  private backoffMs = 500;
  private wake: (() => void) | null = null;

  constructor(
    private spool: Spool,
    private opts: UploaderOptions,
  ) {}

  notify() {
    this.wake?.();
  }

  /** Send one batch. Returns the number acknowledged (0 if nothing to send). Throws on failure. */
  async flushOnce(): Promise<number> {
    const batch = this.spool.peek(this.opts.batchSize ?? 200);
    if (!batch.length) return 0;
    const res = await (this.opts.fetchImpl ?? fetch)(`${this.opts.apiUrl}/v1/timing/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-device-key': this.opts.deviceKey },
      body: JSON.stringify({ events: batch }),
    });
    if (res.status === 400) {
      // A malformed event would block the queue forever: log it and skip the batch.
      this.opts.log?.(`server rejected batch: ${await res.text()}`);
      await this.spool.ack(batch.length);
      return batch.length;
    }
    if (!res.ok) throw new Error(`upload failed: HTTP ${res.status}`);
    await this.spool.ack(batch.length);
    return batch.length;
  }

  async run() {
    while (!this.stopped) {
      try {
        const n = await this.flushOnce();
        this.backoffMs = 500;
        if (n) continue;
        await new Promise<void>((r) => {
          this.wake = r;
          setTimeout(r, 1000);
        });
      } catch (e) {
        this.opts.log?.(`${(e as Error).message}; ${this.spool.size} queued, retrying in ${this.backoffMs} ms`);
        await new Promise((r) => setTimeout(r, this.backoffMs));
        this.backoffMs = Math.min(this.backoffMs * 2, 30_000);
      }
    }
  }

  stop() {
    this.stopped = true;
    this.wake?.();
  }
}
