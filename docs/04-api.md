# 6. API specification

These are **this platform's own endpoints**, not those of any third-party timing system or venue app.
Base URL: `https://<api-host>/v1`. JSON in and out. Status: ✅ every endpoint below is implemented in
`server/src/routes/` and exercised by the integration tests, unless marked *(planned)*.

## Conventions

- **Times:** ISO 8601 UTC in responses. Lap times are `{ "us": 60900000, "display": "1:00.900" }`:
  microseconds for maths, and a display string truncated to milliseconds as timing screens do.
- **Result status:** every result payload says `live` (session running), `provisional` (chequered, under
  review) or `final` (official). Only `final` feeds personal bests, leaderboards and records.
- **Errors:** `{ "error": "<code>", "message": "<human text>" }` with status 400 (`invalid`),
  401 (`unauthorized`), 403 (`forbidden`), 404 (`not_found`), 409 (`bad_state`, `conflict`,
  `transponder_in_use`, `session_final`, `no_transponder`).
- **IDs** are UUIDs. Raw event references are `r:<id>`; manual crossings are `m:<id>`.

## Authentication & roles

| Principal | How | Can do |
|---|---|---|
| Public | — | Venues, session results, track leaderboards and records, public driver profiles |
| Driver | `Authorization: Bearer <JWT>` from `/auth/login` or `/auth/register` (12 h) | Above, plus own profile, own history even if private |
| Operator | Bearer JWT; account has a `venue_id` | Run sessions, assignments, imports, corrections, exports and the audit trail **for their own venue only** |
| Admin | Bearer JWT | Everything, all venues; create venues, staff accounts and timing devices |
| Timing device | `X-Device-Key: tdk_…` (shown once at creation; stored as SHA-256) | **Only** `POST /timing/events` and `POST /timing/heartbeat` for its own track |

Device keys cannot call anything else, and user tokens cannot submit timing events. Both are tested in
`test/integration/security.test.ts`.

## Endpoint summary

| Method & path | Who | Purpose |
|---|---|---|
| `POST /auth/register` | public | Create driver account + profile |
| `POST /auth/login` | public | Get a token |
| `GET /me` · `PATCH /me/driver` | user | Own account; display name and leaderboard privacy |
| `GET /venues` | public | Venues with their tracks |
| `GET /sessions?venueId&trackId&status&type&from&to&limit` | public | Session list |
| `GET /sessions/{id}` | public | Session detail |
| `GET /sessions/{id}/leaderboard` | public | Standings for the session |
| `GET /sessions/{id}/laps?participantId` | public | Lap-by-lap times |
| `GET /sessions/{id}/stream` | public | Server-sent events: `hello`, `results` (refetch) |
| `GET /drivers/{id}` | public* | Driver profile |
| `GET /drivers/{id}/sessions?venueId&trackId&type&kart&from&to` | public* | Driver history with filters |
| `GET /drivers/{id}/personal-best` | public* | Best lap per track layout and kart class (final only) |
| `GET /tracks/{id}/leaderboard?period=day\|week\|month\|all&classId` | public | Best lap per driver |
| `GET /tracks/{id}/records` | public | Track record per kart class |
| `POST /timing/events` | device | Submit passings (idempotent) |
| `POST /timing/heartbeat` | device | Liveness + clock offset |
| `POST /sessions` | operator | Create a session |
| `POST /sessions/{id}/participants` | operator | Assign a driver (or team) to a kart |
| `POST /participants/{id}/kart` | operator | Kart change (breakdown/endurance) |
| `POST /participants/{id}/stints` | operator | Endurance driver change |
| `POST /sessions/{id}/start` · `/finish` | operator | Green flag / chequered flag (`{ "at"? }` for backfill; never in the future) |
| `POST /sessions/{id}/finalize` · `/reopen` · `/cancel` · `/recalculate` | operator | Lifecycle (reopen and cancel need a reason) |
| `POST /sessions/{id}/corrections` · `GET …/corrections` | operator | Corrections (see below) |
| `POST /corrections/{id}/revoke` | operator | Withdraw a correction (reason required) |
| `GET /sessions/{id}/anomalies` | operator | Timing review report |
| `GET /sessions/{id}/events` | operator | Raw passings in the session window |
| `GET /sessions/{id}/export.csv?type=results\|laps` | operator | CSV export (formula-injection safe) |
| `POST /imports/passings` | operator | CSV import |
| `POST /tracks` · `POST /tracks/{id}/loops` | operator | Track and loop mapping |
| `POST /kart-classes` · `POST /karts` · `PATCH /karts/{id}` · `GET /karts?venueId` | operator | Kart inventory |
| `POST /transponders` · `POST /transponder-assignments` | operator | Transponders and fitting history |
| `POST /drivers` · `GET /drivers?q` | operator | Walk-in drivers, search |
| `GET /devices?venueId` | operator | Device health |
| `POST /devices` · `POST /venues` · `POST /users` | admin | Provisioning |
| `GET /audit?entityType&entityId` | operator (own sessions) / admin | Audit trail |
| `POST /bookings` … | — | *(planned, Phase 4)* |

\* Visible to everyone if the driver opted in to public leaderboards; otherwise only to the driver and staff.

## Samples

### `POST /timing/events` (device)

```http
POST /v1/timing/events
X-Device-Key: tdk_…
Content-Type: application/json

{
  "events": [
    {
      "eventKey": "a1b2c3:1041",
      "sequence": 1041,
      "transponder": "T107",
      "loop": "L1",
      "timestamp": "2026-10-11T14:31:01.200+08:00",
      "raw": { "strength": 92 }
    }
  ]
}
```

`201 Created` (or `200` if every event was a duplicate):

```json
{
  "batchId": "c5f18ba4-730b-49de-8dd4-d4aff758578b",
  "received": 1,
  "accepted": 1,
  "duplicates": 0,
  "recomputedSessions": ["3f0c…"],
  "lateEventsForFinalSessions": []
}
```

Up to 5,000 events per request. Re-sending the same batch is always safe. `lateEventsForFinalSessions`
lists finalised sessions whose window contains new events: they are stored but not applied until an operator reopens the session.

### `GET /sessions/{id}`

```json
{
  "id": "db5a3d60-cc9f-46c5-be22-9910c17dc9f7",
  "name": "Demo – Arrive & Drive 14:00",
  "type": "rental",
  "status": "final",
  "resultStatus": "final",
  "startedAt": "2026-10-10T06:00:20.500Z",
  "endedAt": "2026-10-10T06:08:21.970Z",
  "finalizedAt": "2026-10-11T05:02:09.908Z",
  "kartClass": { "id": "8fcf…", "name": "Adult 270cc" },
  "track": { "id": "a06d…", "name": "Main Circuit", "layout": "standard" },
  "venue": { "id": "57ca…", "name": "Pinnacle Kart", "timezone": "Asia/Kuala_Lumpur" },
  "participantCount": 8,
  "rules": { "minLapUs": 25000000 },
  "resultsVersion": 4
}
```

### `GET /sessions/{id}/leaderboard`

```json
{
  "resultStatus": "final",
  "session": { "...": "as above" },
  "entries": [
    {
      "participantId": "c6cd…",
      "position": 1,
      "driver": { "id": "b9ac…", "name": "Aiman Hakim" },
      "teamName": null,
      "karts": "01",
      "lapsCompleted": 10,
      "bestLap": { "us": 43772000, "display": "43.772" },
      "bestLapNumber": 5,
      "averageLap": { "us": 44582900, "display": "44.582" },
      "totalTimeUs": 445829000,
      "gap": null,
      "hasFastestLap": true,
      "disqualified": false
    },
    {
      "participantId": "b668…",
      "position": 2,
      "driver": { "id": "b34c…", "name": "Rajesh Kumar" },
      "karts": "03",
      "lapsCompleted": 10,
      "bestLap": { "us": 44540000, "display": "44.540" },
      "gap": { "us": 768000, "display": "+0.768" },
      "hasFastestLap": false
    }
  ]
}
```

In races, `gap` is `{ "laps": 2 }` for lapped entries. `karts` shows swaps as `"04 → 05"`.

### `GET /sessions/{id}/laps?participantId=…`

```json
{
  "resultStatus": "final",
  "laps": [
    {
      "participantId": "c6cd…",
      "lapNumber": 1,
      "lapTime": { "us": 44108000, "display": "44.108" },
      "startedAt": "2026-10-10T06:00:21.500000Z",
      "endedAt": "2026-10-10T06:01:05.608000Z",
      "valid": true,
      "flags": [],
      "invalidReason": null,
      "kart": "01",
      "driver": { "id": "b9ac…", "name": "Aiman Hakim" }
    }
  ]
}
```

`flags` can include `pit`, `suspect_missed`, `exceeds_max`, `invalidated`, `start_lap`. Staff also receive
`startRef`/`endRef` (the crossings that bound the lap) for corrections.

### `GET /drivers/{id}/sessions?trackId=…&type=rental&kart=07&from=2026-10-01T00:00:00Z`

```json
{
  "sessions": [
    {
      "session": { "id": "db5a…", "name": "Demo – Arrive & Drive 14:00", "type": "rental", "startedAt": "2026-10-10T06:00:20.500Z", "resultStatus": "final" },
      "track": { "id": "a06d…", "name": "Main Circuit" },
      "venue": { "id": "57ca…", "name": "Pinnacle Kart" },
      "position": 1,
      "fieldSize": 8,
      "laps": 10,
      "bestLap": { "us": 43772000, "display": "43.772" },
      "averageLap": { "us": 44582900, "display": "44.582" },
      "karts": "01"
    }
  ]
}
```

For team entries, `laps`, `bestLap` and `averageLap` count only the laps this driver drove.

### `GET /drivers/{id}/personal-best`

```json
{
  "personalBests": [
    {
      "track": { "id": "a06d…", "name": "Main Circuit", "layout": "standard" },
      "kartClass": { "id": "8fcf…", "name": "Adult 270cc" },
      "lapTime": { "us": 43772000, "display": "43.772" },
      "sessionId": "db5a…",
      "lapNumber": 5,
      "setAt": "2026-10-10T06:00:20.500Z"
    }
  ]
}
```

### `GET /tracks/{id}/leaderboard?period=week&classId=…`

```json
{
  "period": "week",
  "kartClassFilter": "8fcf…",
  "classesIncluded": [{ "id": "8fcf…", "name": "Adult 270cc" }],
  "mixedClasses": false,
  "note": null,
  "entries": [
    {
      "position": 1,
      "driver": { "id": "b9ac…", "name": "Aiman Hakim" },
      "kartClass": { "id": "8fcf…", "name": "Adult 270cc" },
      "lapTime": { "us": 43772000, "display": "43.772" },
      "gapUs": 0,
      "sessionId": "db5a…",
      "setAt": "2026-10-10T06:00:20.500Z"
    }
  ]
}
```

Without `classId`, if several kart classes appear, `mixedClasses` is `true` and `note` says they are not
directly comparable. Day, week and month boundaries use the venue's time zone.

### `POST /sessions/{id}/start` and `/finish` (operator)

```json
{}                                        // now
{ "at": "2026-10-11T14:29:30+08:00" }     // backfill (not in the future)
```

`409 no_transponder` lists karts without a fitted transponder. `409 transponder_in_use` means a kart is
already in another session at that time.

### `POST /sessions/{id}/corrections` (operator)

```json
{ "kind": "exclude_event",  "targetRef": "r:5512", "reason": "Ghost read on pit wall" }
{ "kind": "add_crossing",   "participantId": "…", "at": "2026-10-11T14:43:10.100+08:00", "reason": "Missed by loop; from video" }
{ "kind": "invalidate_lap", "targetRef": "r:5530", "reason": "Cut the chicane" }
{ "kind": "time_penalty",   "participantId": "…", "seconds": 5, "reason": "Unsafe release" }
{ "kind": "lap_penalty",    "participantId": "…", "laps": 1, "reason": "Pit lane speeding" }
{ "kind": "disqualify",     "participantId": "…", "reason": "Dangerous driving" }
```

`201 { "id": "<correction id>" }`. The session is recalculated immediately. Corrections on a final
session are refused (`409 session_final`): reopen it first, with a reason.

### `POST /imports/passings` (operator)

```json
{
  "trackId": "a06d…",
  "csv": "transponder,time,loop\nT107,14:30:00.000,L1\nT107,14:31:01.200,L1\n",
  "date": "2026-10-11",
  "timeZone": "Asia/Kuala_Lumpur",
  "columns": { "transponder": "Transponder No", "timestamp": "Passing Time" },
  "sessionId": "…",
  "setSessionWindowFromFile": true
}
```

```json
{ "batchId": "…", "received": 6, "accepted": 6, "duplicates": 0, "recomputedSessions": ["…"],
  "lateEventsForFinalSessions": [], "rowErrors": [{ "row": 8, "message": "Unrecognised timestamp \"bad-time\"" }] }
```

Columns are detected by common names (transponder, time, loop, sequence) or set explicitly. `,`, `;` and tab
delimiters are accepted. Timestamps may be ISO 8601, epoch numbers, or clock times plus `date`.

### `GET /sessions/{id}/anomalies` (operator)

```json
{
  "status": "finished",
  "missingTransponders": [],
  "lateEventsAfterFinalisation": 0,
  "rejectedCrossings": [
    { "participantId": "…", "ref": "r:35", "at": "2026-10-10T06:03:22.971000Z", "reason": "duplicate", "gap": "0.035" },
    { "participantId": "…", "ref": "r:57", "at": "2026-10-10T06:05:13.001000Z", "reason": "too_short", "gap": "9.000" }
  ],
  "flaggedLaps": [{ "participantId": "…", "lapNumber": 3, "lapTime": "2:00.200", "flags": ["suspect_missed"], "endRef": "r:61" }],
  "unmatchedEvents": [{ "ref": "r:70", "transponder": "T199", "loop": "L1", "at": "…" }],
  "unknownLoops": []
}
```

### `GET /sessions/{id}/stream` (SSE)

```
event: hello
data: {"sessionId":"…","version":1,"resultStatus":"live"}

event: results
data: {"sessionId":"…","version":2}

: ping
```

Clients refetch `/leaderboard` (and `/laps`) on each `results` event, so the stream never carries stale or partial standings.
