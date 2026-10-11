import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireDevice } from '../auth.js';
import { HttpError } from '../db.js';
import { parse, type AppContext } from '../http.js';
import { ingestPassings } from '../services/ingest.js';
import type { NormalizedPassing } from '../timing/csv.js';
import { parseTimestampUs } from '../timing/time.js';

const eventSchema = z.object({
  /**
   * Idempotency key, unique per device. Gateways should send the decoder's own passing id, or
   * `${decoderBootId}:${sequence}` — never a bare sequence number, which can reset on decoder restart.
   * If omitted, a hash of (transponder, loop, timestamp) is used.
   */
  eventKey: z.string().min(1).max(200).optional(),
  sequence: z.number().int().nonnegative().optional(),
  transponder: z.string().min(1).max(64),
  loop: z.string().min(1).max(64).default('finish'),
  /** ISO 8601 with offset, or epoch microseconds (device clock). */
  timestamp: z.union([z.string(), z.number()]),
  sourceStatus: z.string().max(64).optional(),
  raw: z.record(z.unknown()).optional(),
});

export function timingRoutes(app: FastifyInstance, ctx: AppContext) {
  app.post('/timing/events', { bodyLimit: 5 * 1024 * 1024 }, async (req, reply) => {
    const device = requireDevice(req.principal);
    const body = parse(z.object({ events: z.array(eventSchema).min(1).max(5000) }), req.body);
    const passings: NormalizedPassing[] = body.events.map((e, i) => {
      let detectedUs: number;
      try {
        detectedUs = parseTimestampUs(e.timestamp, { timeZone: 'UTC' });
      } catch (err) {
        throw new HttpError(400, `events.${i}.timestamp: ${(err as Error).message}`, 'invalid');
      }
      const eventKey = e.eventKey ?? createHash('sha256').update(`${e.transponder}|${e.loop}|${detectedUs}`).digest('hex').slice(0, 32);
      return { eventKey, transponderCode: e.transponder, loopCode: e.loop, detectedUs, sequence: e.sequence ?? null, raw: e.raw ?? {} };
    });
    const result = await ingestPassings(ctx.db, device.deviceId, passings);
    reply.code(result.accepted ? 201 : 200);
    return result;
  });

  /** Gateways call this every few seconds: liveness + device clock offset (device − server). */
  app.post('/timing/heartbeat', async (req) => {
    const device = requireDevice(req.principal);
    const body = parse(z.object({ clockOffsetUs: z.number().int().optional(), lastSequence: z.number().int().optional() }), req.body ?? {});
    await ctx.db.query(
      `UPDATE timing_devices SET last_seen_at = now(), clock_offset_us = coalesce($2, clock_offset_us),
              last_sequence = coalesce($3, last_sequence) WHERE id = $1`,
      [device.deviceId, body.clockOffsetUs ?? null, body.lastSequence ?? null],
    );
    return { serverTimeUs: Date.now() * 1000 };
  });
}
