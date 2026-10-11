import cors from '@fastify/cors';
import Fastify from 'fastify';
import { createAuth } from './auth.js';
import { HttpError, type Db } from './db.js';
import type { AppContext } from './http.js';
import type { Realtime } from './realtime.js';
import { adminRoutes } from './routes/admin.js';
import { publicRoutes } from './routes/public.js';
import { timingRoutes } from './routes/timing.js';

export interface BuildOptions {
  db: Db;
  jwtSecret: string;
  realtime?: Realtime | null;
  corsOrigins?: string[];
  logLevel?: string;
}

export async function buildApp(opts: BuildOptions) {
  const app = Fastify({
    logger: { level: opts.logLevel ?? 'warn', redact: ['req.headers.authorization', 'req.headers["x-device-key"]'] },
    trustProxy: true,
  });
  const auth = createAuth(opts.jwtSecret);
  const ctx: AppContext = { db: opts.db, realtime: opts.realtime ?? null, issueToken: auth.issueToken };

  await app.register(cors, { origin: opts.corsOrigins ?? true, allowedHeaders: ['Content-Type', 'Authorization', 'X-Device-Key'] });

  app.decorateRequest('principal', null);
  app.addHook('onRequest', async (req) => {
    req.principal = await auth.authenticate(req, opts.db);
  });

  app.setErrorHandler((err: Error & { statusCode?: number; code?: string }, req, reply) => {
    if (err instanceof HttpError) return reply.code(err.statusCode).send({ error: err.code ?? 'error', message: err.message });
    // Postgres constraint violations → client errors with a stable code.
    const pgCode = err.code;
    if (pgCode === '23505') return reply.code(409).send({ error: 'conflict', message: 'Already exists' });
    if (pgCode === '23P01') return reply.code(409).send({ error: 'conflict', message: 'Overlaps an existing assignment' });
    if (pgCode === '23503') return reply.code(400).send({ error: 'invalid_reference', message: 'Referenced record does not exist' });
    if (pgCode === '22P02') return reply.code(400).send({ error: 'invalid', message: 'Malformed identifier or value' });
    if (err.statusCode && err.statusCode < 500) return reply.code(err.statusCode).send({ error: 'invalid', message: err.message });
    req.log.error(err);
    return reply.code(500).send({ error: 'internal', message: 'Internal server error' });
  });

  app.get('/health', async () => {
    await opts.db.query('SELECT 1');
    return { ok: true };
  });

  await app.register(
    async (v1) => {
      publicRoutes(v1, ctx);
      timingRoutes(v1, ctx);
      adminRoutes(v1, ctx);
    },
    { prefix: '/v1' },
  );
  return app;
}
