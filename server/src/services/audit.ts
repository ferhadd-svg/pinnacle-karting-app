import type { Principal } from '../auth.js';
import type { Queryable } from '../db.js';

export async function audit(
  q: Queryable,
  actor: Principal | null,
  action: string,
  entityType: string,
  entityId: string | null,
  change: { before?: unknown; after?: unknown; reason?: string | null } = {},
) {
  await q.query(
    `INSERT INTO audit_log (actor_user_id, actor_device_id, action, entity_type, entity_id, before, after, reason)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      actor?.kind === 'user' ? actor.userId : null,
      actor?.kind === 'device' ? actor.deviceId : null,
      action,
      entityType,
      entityId,
      change.before === undefined ? null : JSON.stringify(change.before),
      change.after === undefined ? null : JSON.stringify(change.after),
      change.reason ?? null,
    ],
  );
}
