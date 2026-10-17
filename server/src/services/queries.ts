import { many, one, type Queryable } from '../db.js';
import { formatLapUs, usToIso } from '../timing/time.js';

export interface Viewer {
  driverId: string | null;
  staff: boolean;
}

export const resultStatusOf = (status: string) =>
  ({ scheduled: 'not_started', running: 'live', finished: 'provisional', final: 'final', cancelled: 'cancelled' })[status] ?? status;

const lap = (us: number | null) => (us === null ? null : { us, display: formatLapUs(us) });

/** Hidden drivers appear as "Private driver" to everyone but themselves and staff. */
const nameSql = (alias: string, viewerParam: string, staffParam: string) =>
  `CASE WHEN ${alias}.id IS NULL THEN NULL
        WHEN ${alias}.show_on_leaderboards OR ${alias}.id = ${viewerParam}::uuid OR ${staffParam}::boolean THEN ${alias}.display_name
        ELSE 'Private driver' END`;

export async function getSession(q: Queryable, id: string) {
  const s = await one<Record<string, any>>(
    q,
    `SELECT s.id, s.name, s.type, s.status, s.scheduled_start, s.started_at, s.ended_at, s.finalized_at, s.rules,
            s.results_version, s.results_updated_at, s.kart_class_id, kc.name AS kart_class,
            t.id AS track_id, t.name AS track_name, t.layout, v.id AS venue_id, v.name AS venue_name, v.timezone,
            (SELECT count(*)::int FROM session_participants p WHERE p.session_id = s.id) AS participant_count
       FROM sessions s JOIN tracks t ON t.id = s.track_id JOIN venues v ON v.id = t.venue_id
       LEFT JOIN kart_classes kc ON kc.id = s.kart_class_id
      WHERE s.id = $1`,
    [id],
  );
  return {
    id: s.id,
    name: s.name,
    type: s.type,
    status: s.status,
    resultStatus: resultStatusOf(s.status),
    scheduledStart: s.scheduled_start,
    startedAt: s.started_at,
    endedAt: s.ended_at,
    finalizedAt: s.finalized_at,
    kartClass: s.kart_class_id ? { id: s.kart_class_id, name: s.kart_class } : null,
    track: { id: s.track_id, name: s.track_name, layout: s.layout },
    venue: { id: s.venue_id, name: s.venue_name, timezone: s.timezone },
    participantCount: s.participant_count,
    rules: s.rules,
    resultsVersion: s.results_version,
    resultsUpdatedAt: s.results_updated_at,
  };
}

export async function listSessions(
  q: Queryable,
  f: { venueId?: string; trackId?: string; status?: string; type?: string; from?: string; to?: string; limit: number },
) {
  const rows = await many<Record<string, any>>(
    q,
    `SELECT s.id, s.name, s.type, s.status, s.scheduled_start, s.started_at, s.ended_at, t.id AS track_id, t.name AS track_name,
            v.name AS venue_name,
            (SELECT count(*)::int FROM session_participants p WHERE p.session_id = s.id) AS participant_count
       FROM sessions s JOIN tracks t ON t.id = s.track_id JOIN venues v ON v.id = t.venue_id
      WHERE ($1::uuid IS NULL OR t.venue_id = $1) AND ($2::uuid IS NULL OR s.track_id = $2)
        AND ($3::session_status IS NULL OR s.status = $3) AND ($4::session_type IS NULL OR s.type = $4)
        AND ($5::timestamptz IS NULL OR coalesce(s.started_at, s.scheduled_start, s.created_at) >= $5)
        AND ($6::timestamptz IS NULL OR coalesce(s.started_at, s.scheduled_start, s.created_at) < $6)
      ORDER BY coalesce(s.started_at, s.scheduled_start, s.created_at) DESC
      LIMIT $7`,
    [f.venueId ?? null, f.trackId ?? null, f.status ?? null, f.type ?? null, f.from ?? null, f.to ?? null, f.limit],
  );
  return rows.map((s) => ({
    id: s.id,
    name: s.name,
    type: s.type,
    status: s.status,
    resultStatus: resultStatusOf(s.status),
    scheduledStart: s.scheduled_start,
    startedAt: s.started_at,
    endedAt: s.ended_at,
    track: { id: s.track_id, name: s.track_name },
    venueName: s.venue_name,
    participantCount: s.participant_count,
  }));
}

export async function sessionLeaderboard(q: Queryable, sessionId: string, viewer: Viewer) {
  const session = await getSession(q, sessionId);
  const rows = await many<Record<string, any>>(
    q,
    `SELECT p.id AS participant_id, p.team_name, p.status AS entry_status, d.id AS driver_id, d.user_id IS NOT NULL AS driver_is_member,
            ${nameSql('d', '$2', '$3')} AS driver_name,
            (SELECT string_agg(k.number, ' → ' ORDER BY pk.created_at) FROM participant_karts pk JOIN karts k ON k.id = pk.kart_id
              WHERE pk.participant_id = p.id) AS karts,
            r.position, r.laps_completed, r.best_lap_us, r.best_lap_number, r.avg_lap_us, r.total_time_us,
            r.gap_us, r.gap_laps, r.has_fastest_lap, r.disqualified
       FROM session_participants p
       LEFT JOIN drivers d ON d.id = p.driver_id
       LEFT JOIN session_results r ON r.participant_id = p.id
      WHERE p.session_id = $1
      ORDER BY r.position NULLS LAST, r.disqualified, r.laps_completed DESC NULLS LAST, p.created_at`,
    [sessionId, viewer.driverId, viewer.staff],
  );
  return {
    session,
    // Provisional results can still change (late events, corrections); only 'final' feeds records.
    resultStatus: session.resultStatus,
    entries: rows.map((r) => ({
      participantId: r.participant_id,
      position: r.position,
      driver: r.driver_id ? { id: r.driver_id, name: r.driver_name, isMember: r.driver_is_member as boolean } : null,
      teamName: r.team_name,
      karts: r.karts,
      lapsCompleted: r.laps_completed ?? 0,
      bestLap: lap(r.best_lap_us),
      bestLapNumber: r.best_lap_number,
      averageLap: lap(r.avg_lap_us),
      totalTimeUs: r.total_time_us,
      gap: r.gap_laps > 0 ? { laps: r.gap_laps } : r.gap_us !== null ? { us: r.gap_us, display: `+${(r.gap_us / 1e6).toFixed(3)}` } : null,
      hasFastestLap: !!r.has_fastest_lap,
      disqualified: !!r.disqualified,
    })),
  };
}

export async function sessionLaps(q: Queryable, sessionId: string, viewer: Viewer, participantId?: string) {
  const rows = await many<Record<string, any>>(
    q,
    `SELECT l.participant_id, l.lap_number, l.duration_us, l.started_us, l.ended_us, l.flags, l.valid, l.invalid_reason,
            l.start_ref, l.end_ref, k.number AS kart_number, d.id AS driver_id, ${nameSql('d', '$3', '$4')} AS driver_name
       FROM laps l LEFT JOIN karts k ON k.id = l.kart_id LEFT JOIN drivers d ON d.id = l.driver_id
      WHERE l.session_id = $1 AND ($2::uuid IS NULL OR l.participant_id = $2)
      ORDER BY l.participant_id, l.lap_number`,
    [sessionId, participantId ?? null, viewer.driverId, viewer.staff],
  );
  return rows.map((l) => ({
    participantId: l.participant_id,
    lapNumber: l.lap_number,
    lapTime: lap(l.duration_us),
    startedAt: usToIso(l.started_us),
    endedAt: usToIso(l.ended_us),
    valid: l.valid,
    flags: l.flags,
    invalidReason: l.invalid_reason,
    kart: l.kart_number,
    driver: l.driver_id ? { id: l.driver_id, name: l.driver_name } : null,
    ...(viewer.staff ? { startRef: l.start_ref, endRef: l.end_ref } : {}),
  }));
}

export async function driverProfile(q: Queryable, driverId: string, viewer: Viewer) {
  const d = await one<Record<string, any>>(
    q,
    `SELECT id, ${nameSql('drivers', '$2', '$3')} AS name, show_on_leaderboards, created_at FROM drivers WHERE id = $1`,
    [driverId, viewer.driverId, viewer.staff],
  );
  return { id: d.id, name: d.name, showOnLeaderboards: d.show_on_leaderboards, memberSince: d.created_at };
}

/** Sessions where the driver drove at least one lap or is the entered driver. */
export async function driverSessions(
  q: Queryable,
  driverId: string,
  f: { venueId?: string; trackId?: string; type?: string; kartNumber?: string; from?: string; to?: string; limit: number },
) {
  const rows = await many<Record<string, any>>(
    q,
    `WITH mine AS (
       SELECT DISTINCT p.id AS participant_id, p.session_id FROM session_participants p
        WHERE p.driver_id = $1
       UNION
       SELECT DISTINCT l.participant_id, l.session_id FROM laps l WHERE l.driver_id = $1
     )
     SELECT s.id, s.name, s.type, s.status, s.started_at, t.id AS track_id, t.name AS track_name, v.id AS venue_id, v.name AS venue_name,
            r.position, r.laps_completed, (SELECT count(*)::int FROM session_participants x WHERE x.session_id = s.id) AS field_size,
            (SELECT min(l.duration_us) FROM laps l WHERE l.participant_id = m.participant_id AND l.driver_id = $1 AND l.valid) AS best_us,
            (SELECT avg(l.duration_us)::bigint FROM laps l WHERE l.participant_id = m.participant_id AND l.driver_id = $1 AND l.valid) AS avg_us,
            (SELECT count(*)::int FROM laps l WHERE l.participant_id = m.participant_id AND l.driver_id = $1) AS my_laps,
            (SELECT string_agg(DISTINCT k.number, ', ') FROM participant_karts pk JOIN karts k ON k.id = pk.kart_id
              WHERE pk.participant_id = m.participant_id) AS karts
       FROM mine m JOIN sessions s ON s.id = m.session_id JOIN tracks t ON t.id = s.track_id JOIN venues v ON v.id = t.venue_id
       LEFT JOIN session_results r ON r.participant_id = m.participant_id
      WHERE s.status IN ('running', 'finished', 'final')
        AND ($2::uuid IS NULL OR v.id = $2) AND ($3::uuid IS NULL OR t.id = $3) AND ($4::session_type IS NULL OR s.type = $4)
        AND ($5::text IS NULL OR EXISTS (SELECT 1 FROM participant_karts pk JOIN karts k ON k.id = pk.kart_id
                                          WHERE pk.participant_id = m.participant_id AND k.number = $5))
        AND ($6::timestamptz IS NULL OR s.started_at >= $6) AND ($7::timestamptz IS NULL OR s.started_at < $7)
      ORDER BY s.started_at DESC
      LIMIT $8`,
    [driverId, f.venueId ?? null, f.trackId ?? null, f.type ?? null, f.kartNumber ?? null, f.from ?? null, f.to ?? null, f.limit],
  );
  return rows.map((r) => ({
    session: { id: r.id, name: r.name, type: r.type, startedAt: r.started_at, resultStatus: resultStatusOf(r.status) },
    track: { id: r.track_id, name: r.track_name },
    venue: { id: r.venue_id, name: r.venue_name },
    position: r.position,
    fieldSize: r.field_size,
    laps: r.my_laps,
    bestLap: lap(r.best_us),
    averageLap: lap(r.avg_us),
    karts: r.karts,
  }));
}

/** Personal bests per track layout and kart class, from final results only. */
export async function personalBests(q: Queryable, driverId: string) {
  const rows = await many<Record<string, any>>(
    q,
    `SELECT DISTINCT ON (s.track_id, k.class_id)
            s.track_id, t.name AS track_name, t.layout, k.class_id, kc.name AS class_name,
            l.duration_us, l.session_id, s.started_at, l.lap_number
       FROM laps l JOIN sessions s ON s.id = l.session_id JOIN tracks t ON t.id = s.track_id
       LEFT JOIN karts k ON k.id = l.kart_id LEFT JOIN kart_classes kc ON kc.id = k.class_id
      WHERE l.driver_id = $1 AND l.valid AND s.status = 'final'
      ORDER BY s.track_id, k.class_id, l.duration_us, l.ended_us`,
    [driverId],
  );
  return rows.map((r) => ({
    track: { id: r.track_id, name: r.track_name, layout: r.layout },
    kartClass: r.class_id ? { id: r.class_id, name: r.class_name } : null,
    lapTime: lap(r.duration_us),
    sessionId: r.session_id,
    lapNumber: r.lap_number,
    setAt: r.started_at,
  }));
}

export type Period = 'day' | 'week' | 'month' | 'all';

/**
 * Best valid lap per driver on a track layout, from final sessions only. Kart classes are never mixed
 * silently: pass a class, or the response lists the classes present and flags the comparison.
 */
export async function trackLeaderboard(q: Queryable, trackId: string, period: Period, classId: string | null, viewer: Viewer, limit = 50) {
  const rows = await many<Record<string, any>>(
    q,
    `WITH bounds AS (
       SELECT CASE $2
                WHEN 'day'   THEN date_trunc('day',   now() AT TIME ZONE v.timezone) AT TIME ZONE v.timezone
                WHEN 'week'  THEN date_trunc('week',  now() AT TIME ZONE v.timezone) AT TIME ZONE v.timezone
                WHEN 'month' THEN date_trunc('month', now() AT TIME ZONE v.timezone) AT TIME ZONE v.timezone
              END AS since
         FROM tracks t JOIN venues v ON v.id = t.venue_id WHERE t.id = $1
     ),
     best AS (
       SELECT DISTINCT ON (l.driver_id, k.class_id)
              l.driver_id, k.class_id, l.duration_us, l.ended_us, l.session_id, s.started_at
         FROM laps l JOIN sessions s ON s.id = l.session_id JOIN drivers d ON d.id = l.driver_id
         LEFT JOIN karts k ON k.id = l.kart_id, bounds b
        WHERE s.track_id = $1 AND s.status = 'final' AND l.valid
          AND (b.since IS NULL OR s.started_at >= b.since)
          AND ($3::uuid IS NULL OR k.class_id = $3)
          AND (d.show_on_leaderboards OR d.id = $4::uuid)
        ORDER BY l.driver_id, k.class_id, l.duration_us, l.ended_us
     )
     -- Walk-ins have no account and never opted in to public boards: show them as "Guest".
     SELECT b.*, CASE WHEN d.user_id IS NULL THEN 'Guest' ELSE d.display_name END AS display_name, kc.name AS class_name FROM best b
       JOIN drivers d ON d.id = b.driver_id LEFT JOIN kart_classes kc ON kc.id = b.class_id
      ORDER BY b.duration_us, b.ended_us
      LIMIT $5`,
    [trackId, period, classId, viewer.driverId, limit],
  );
  const classes = [...new Map(rows.map((r) => [r.class_id, { id: r.class_id, name: r.class_name }])).values()];
  const top = rows[0]?.duration_us ?? 0;
  let position = 0;
  return {
    period,
    kartClassFilter: classId,
    classesIncluded: classes,
    mixedClasses: classes.length > 1,
    note: classes.length > 1 ? 'Different kart classes are not directly comparable; filter by class for a fair ranking.' : null,
    entries: rows.map((r, i) => {
      // Identical times share a position; the earlier lap is listed first.
      if (i === 0 || r.duration_us !== rows[i - 1].duration_us) position = i + 1;
      return {
        position,
        driver: { id: r.driver_id, name: r.display_name },
        kartClass: r.class_id ? { id: r.class_id, name: r.class_name } : null,
        lapTime: lap(r.duration_us),
        gapUs: r.duration_us - top,
        sessionId: r.session_id,
        setAt: r.started_at,
      };
    }),
  };
}

/** Track record per kart class (final sessions only). */
export async function trackRecords(q: Queryable, trackId: string) {
  const rows = await many<Record<string, any>>(
    q,
    `SELECT DISTINCT ON (k.class_id) k.class_id, kc.name AS class_name, l.duration_us, l.session_id, s.started_at,
            d.id AS driver_id,
            CASE WHEN d.user_id IS NULL THEN 'Guest' WHEN d.show_on_leaderboards THEN d.display_name ELSE 'Private driver' END AS driver_name
       FROM laps l JOIN sessions s ON s.id = l.session_id LEFT JOIN drivers d ON d.id = l.driver_id
       LEFT JOIN karts k ON k.id = l.kart_id LEFT JOIN kart_classes kc ON kc.id = k.class_id
      WHERE s.track_id = $1 AND s.status = 'final' AND l.valid
      ORDER BY k.class_id, l.duration_us, l.ended_us`,
    [trackId],
  );
  return rows.map((r) => ({
    kartClass: r.class_id ? { id: r.class_id, name: r.class_name } : null,
    lapTime: lap(r.duration_us),
    driver: r.driver_id ? { id: r.driver_id, name: r.driver_name } : null,
    sessionId: r.session_id,
    setAt: r.started_at,
  }));
}
