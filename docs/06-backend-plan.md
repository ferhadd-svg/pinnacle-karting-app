# 8. Backend implementation plan

## Code layout (as built)

```
server/
  migrations/            SQL migrations (001 core, 002 bookings)
  src/
    timing/              PURE: no I/O, fully unit-tested
      types.ts           Crossing, LapRules, ComputedLap, flags
      laps.ts            computeParticipantLaps(), attributeDrivers()
      standings.ts       computeStandings(): timed sessions vs races, ties, penalties
      time.ts            timestamp parsing (ISO/epoch/clock + IANA zone), formatting
      csv.ts             RFC 4180 parser, passings CSV → normalised events
    services/            DB-aware business logic
      ingest.ts          idempotent insert + targeted recalculation
      processing.ts      load session inputs → engine → persist laps/results → NOTIFY
      sessions.ts        lifecycle, participants, kart changes, stints, corrections
      queries.ts         read models: results, history, PBs, leaderboards, records
      audit.ts           audit log writer
    routes/              HTTP: public.ts, timing.ts (devices), admin.ts (operators/admins)
    gateway/             reference trackside gateway: spool, uploader, simulator, adapter interface
    tools/               simulate-decoder.ts
    app.ts, index.ts     Fastify app, error mapping, startup (migrate → LISTEN → listen)
    seed.ts              demo venue/track/karts/device + finalised demo session
  test/unit, test/integration
```

## Design decisions

| Decision | Reason |
|---|---|
| Keep the lap engine pure | Every timing rule is testable without a database; the same engine could run in the gateway for an offline display |
| Recalculate the whole session on change | Simplest correct approach; makes late, out-of-order and corrected data trivially consistent |
| Serialise per session with `SELECT … FOR UPDATE` | Concurrent batches for one session can't interleave; different sessions run in parallel |
| Database-enforced invariants (exclusion constraints, immutability trigger, unique event keys) | Guarantees hold even if application code has a bug or someone uses SQL directly |
| SSE carries "changed" signals, not data | Clients always fetch a consistent snapshot; no partial updates |
| Explicit device keys per timing device | A compromised gateway can only submit passings for its own track, and can be revoked alone |

## Background processing

Today, recalculation runs synchronously after each ingest batch (fast enough at venue scale, and
simpler to reason about). The plan as volume grows:

1. **Coalesce** recalculations per session: if a recalculation is running, mark the session dirty and run once more afterwards, instead of once per batch. 🔶 Needed above roughly 5 batches/s per session.
2. **Incremental by participant**: recalculate only participants whose transponders appeared in the batch, then re-rank. Standings are cheap.
3. **Move to a worker**: use a Postgres-backed job queue (e.g. graphile-worker or pg-boss) so API latency doesn't depend on recalculation, with the same idempotent `recomputeSession(id)` job.
4. **Finalisation hooks** (Phase 3): push notifications ("Your results are ready"), materialised leaderboard refresh, PB/record announcements.

## Logging, monitoring, backups, recovery

| Concern | Plan | Status |
|---|---|---|
| Structured logs | Fastify/pino JSON logs; auth headers and device keys redacted | ✅ |
| Health | `GET /health` checks the DB | ✅ |
| Device health | Last seen, events in the last 5 min, clock offset; online/offline in the console | ✅ |
| Alerting | Uptime check on `/health`; alert if a device is offline during opening hours, or a running session has received no events for N minutes | Phase 2 |
| Metrics | Ingest rate, recalculation duration, duplicate ratio, rejected-crossing ratio per device | Phase 2 |
| Backups | Managed Postgres daily snapshots + point-in-time recovery (7–14 days); monthly restore drill | Deployment |
| Recovery | Raw events are the source of truth: any session can be rebuilt with `POST /sessions/{id}/recalculate`. Gateway spools replay automatically | ✅ |
| Error handling | Postgres constraint errors mapped to 409/400 with stable codes; 500s logged without leaking details | ✅ |

## Personal data

- Store only what's needed: display name, email, optional birth year (for junior classes). No card data, ever.
- Drivers control leaderboard visibility; private drivers show as "Private driver" to others.
- 🔶 PDPA 2010 (Malaysia): notice and consent at registration, access/correction requests, deletion by anonymising the profile. ❓ Confirm the circuit's existing privacy notice and data-sharing terms.
- Passwords: scrypt with per-user salt. Tokens: 12 h JWT, HS256 with a secret from the environment.

## Next backend work (by phase)

See [12-roadmap.md](12-roadmap.md). In short:

- Phase 2: first real vendor adapter (after the questionnaire), recalculation coalescing, alerting, setup endpoints in the console, refresh tokens, rate limiting.
- Phase 3: push notifications, account linking for walk-in drivers, materialised leaderboards.
- Phase 4: bookings and payments.
- Phase 5: multi-venue, analytics, public APIs for partners.
