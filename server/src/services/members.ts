import { HttpError, type Queryable } from '../db.js';

export const normalizeMemberCode = (code: string) => code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

export async function driverByMemberCode(tx: Queryable, code: string) {
  const r = await tx.query('SELECT id, display_name FROM drivers WHERE member_code = $1 AND merged_into IS NULL', [normalizeMemberCode(code)]);
  if (!r.rowCount) throw new HttpError(404, `No member with code ${normalizeMemberCode(code)}`, 'not_found');
  return { id: r.rows[0].id as string, name: r.rows[0].display_name as string };
}
