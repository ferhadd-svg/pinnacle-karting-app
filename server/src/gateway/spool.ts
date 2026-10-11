import { appendFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { GatewayEvent } from './types.js';

/**
 * Durable store-and-forward queue. Every event is appended to disk *before* upload, and only
 * removed after the server acknowledged it. A crash, power cut or network outage loses nothing:
 * on restart the gateway re-sends what wasn't acknowledged, and the server dedupes by eventKey.
 */
export class Spool {
  private pending: GatewayEvent[] = [];
  private writing: Promise<void> = Promise.resolve();

  constructor(private file: string) {}

  async open() {
    await mkdir(dirname(this.file), { recursive: true });
    try {
      const text = await readFile(this.file, 'utf8');
      this.pending = text
        .split('\n')
        .filter(Boolean)
        .flatMap((l) => {
          try {
            return [JSON.parse(l) as GatewayEvent];
          } catch {
            return []; // torn final line after a crash
          }
        });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
    return this.pending.length;
  }

  push(e: GatewayEvent) {
    this.pending.push(e);
    this.writing = this.writing.then(() => appendFile(this.file, JSON.stringify(e) + '\n'));
    return this.writing;
  }

  peek(max: number) {
    return this.pending.slice(0, max);
  }

  get size() {
    return this.pending.length;
  }

  /** Drop the first n events (acknowledged) and compact the file atomically. */
  async ack(n: number) {
    await this.writing;
    this.pending = this.pending.slice(n);
    const tmp = `${this.file}.tmp`;
    await writeFile(tmp, this.pending.map((e) => JSON.stringify(e) + '\n').join(''));
    await rename(tmp, this.file);
  }
}
