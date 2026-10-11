import { EventEmitter } from 'node:events';
import pg from 'pg';

/**
 * Result-change fan-out. Recalculation runs pg_notify('session_results') inside its transaction, so
 * every API instance hears about commits from any instance or worker, and SSE clients refetch.
 */
export class Realtime extends EventEmitter {
  private client: pg.Client | null = null;
  private stopped = false;

  constructor(private connectionString: string) {
    super();
    this.setMaxListeners(0);
  }

  async start() {
    this.stopped = false;
    await this.connect();
  }

  private async connect() {
    const client = new pg.Client({ connectionString: this.connectionString });
    client.on('notification', (msg) => {
      if (msg.channel !== 'session_results' || !msg.payload) return;
      try {
        const { sessionId, version } = JSON.parse(msg.payload);
        this.emit(`session:${sessionId}`, { sessionId, version });
      } catch {
        /* ignore malformed payloads */
      }
    });
    client.on('error', () => this.reconnect());
    client.on('end', () => this.reconnect());
    await client.connect();
    await client.query('LISTEN session_results');
    this.client = client;
  }

  private reconnect() {
    if (this.stopped) return;
    this.client = null;
    setTimeout(() => this.connect().catch(() => this.reconnect()), 1000).unref();
  }

  async stop() {
    this.stopped = true;
    await this.client?.end().catch(() => {});
  }
}
