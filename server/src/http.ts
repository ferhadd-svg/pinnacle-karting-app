import type { FastifyRequest } from 'fastify';
import { z, type ZodTypeAny } from 'zod';
import type { Principal } from './auth.js';
import { HttpError, type Db } from './db.js';
import type { Realtime } from './realtime.js';

export interface AppContext {
  db: Db;
  realtime: Realtime | null;
  issueToken: (u: { userId: string; role: 'driver' | 'operator' | 'admin'; venueId: string | null; driverId: string | null }) => Promise<string>;
}

declare module 'fastify' {
  interface FastifyRequest {
    principal: Principal | null;
  }
}

export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const r = schema.safeParse(data);
  if (!r.success) {
    const msg = r.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ');
    throw new HttpError(400, msg, 'invalid');
  }
  return r.data;
}

export const uuid = z.string().uuid();
export const idParams = z.object({ id: uuid });
export const params = (req: FastifyRequest) => parse(idParams, req.params).id;
export const isoDate = z.string().datetime({ offset: true });
