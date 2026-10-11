import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { SignJWT, jwtVerify } from 'jose';
import type { FastifyRequest } from 'fastify';
import { HttpError, type Queryable } from './db.js';

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export type Role = 'driver' | 'operator' | 'admin';

export interface UserPrincipal {
  kind: 'user';
  userId: string;
  role: Role;
  venueId: string | null;
  driverId: string | null;
}
export interface DevicePrincipal {
  kind: 'device';
  deviceId: string;
  venueId: string;
  trackId: string;
}
export type Principal = UserPrincipal | DevicePrincipal;

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [scheme, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt') return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = await scrypt(password, Buffer.from(salt, 'base64'), expected.length);
  return timingSafeEqual(actual, expected);
}

/** Device keys are shown once on creation; only a SHA-256 hash is stored. */
export function newDeviceKey() {
  const key = `tdk_${randomBytes(24).toString('base64url')}`;
  return { key, hash: hashDeviceKey(key) };
}
export const hashDeviceKey = (key: string) => createHash('sha256').update(key).digest('hex');

export function createAuth(secret: string) {
  const keyBytes = new TextEncoder().encode(secret);

  async function issueToken(u: Omit<UserPrincipal, 'kind'>) {
    return new SignJWT({ role: u.role, venueId: u.venueId, driverId: u.driverId })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(u.userId)
      .setIssuedAt()
      .setExpirationTime('12h')
      .sign(keyBytes);
  }

  async function authenticate(req: FastifyRequest, db: Queryable): Promise<Principal | null> {
    const deviceKey = req.headers['x-device-key'];
    if (typeof deviceKey === 'string' && deviceKey) {
      const r = await db.query(
        'SELECT id, venue_id, track_id FROM timing_devices WHERE api_key_hash = $1 AND disabled_at IS NULL',
        [hashDeviceKey(deviceKey)],
      );
      if (!r.rowCount) throw new HttpError(401, 'Invalid device key', 'unauthorized');
      const d = r.rows[0];
      return { kind: 'device', deviceId: d.id, venueId: d.venue_id, trackId: d.track_id };
    }
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return null;
    try {
      const { payload } = await jwtVerify(header.slice(7), keyBytes, { algorithms: ['HS256'] });
      return {
        kind: 'user',
        userId: payload.sub!,
        role: payload.role as Role,
        venueId: (payload.venueId as string | null) ?? null,
        driverId: (payload.driverId as string | null) ?? null,
      };
    } catch {
      throw new HttpError(401, 'Invalid or expired token', 'unauthorized');
    }
  }

  return { issueToken, authenticate };
}

export function requireUser(p: Principal | null, ...roles: Role[]): UserPrincipal {
  if (!p) throw new HttpError(401, 'Authentication required', 'unauthorized');
  if (p.kind !== 'user') throw new HttpError(403, 'Timing devices may only submit timing events', 'forbidden');
  if (roles.length && !roles.includes(p.role)) throw new HttpError(403, 'Insufficient role', 'forbidden');
  return p;
}

export function requireDevice(p: Principal | null): DevicePrincipal {
  if (p?.kind !== 'device') throw new HttpError(401, 'Timing device key required', 'unauthorized');
  return p;
}

/** Operators act only within their own venue; admins act anywhere. */
export function requireStaffForVenue(p: Principal | null, venueId: string): UserPrincipal {
  const u = requireUser(p, 'operator', 'admin');
  if (u.role === 'operator' && u.venueId !== venueId) throw new HttpError(403, 'Not your venue', 'forbidden');
  return u;
}

export const isStaff = (p: Principal | null) => p?.kind === 'user' && (p.role === 'operator' || p.role === 'admin');
