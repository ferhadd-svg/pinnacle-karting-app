# 10. Admin dashboard (operator console)

Web app at `/#/admin` in `web/`, for **operators** (one venue) and **admins** (all venues).
The rule throughout: **manual edits never overwrite raw timing data**. They are recorded as corrections with a
reason and an audit-log entry.

## Functions

| Function | How | Status |
|---|---|---|
| Sign in (staff only) | Email + password; drivers are refused | ✅ |
| Create and manage sessions | Track, type (practice, rental, qualifying, sprint, endurance), name | ✅ |
| Assign drivers to karts | Kart picker shows each kart's current transponder and disables karts without one; walk-in driver names; team names for endurance | ✅ |
| Session lifecycle | Start (green flag) → Finish (chequered) → Finalise; Reopen with a reason; Recalculate | ✅ |
| Import timing data | CSV upload/paste, date for clock-only times, optional "set start/finish from file"; reports accepted/duplicate/bad rows | ✅ |
| Monitor incoming events | Live standings update via SSE; raw events via API (`GET /sessions/{id}/events`) | ✅ API; raw event table in the UI Phase 2 |
| View and correct anomalies | **Timing review**: rejected crossings (duplicate, too short), flagged laps (probable missed detection, pit, invalidated), unassigned transponders, unknown loop IDs, karts without transponders, late events after finalisation | ✅ |
| Corrections | Add a missed crossing (from video/marshal time); time and lap penalties; disqualification. Exclude event, invalidate lap and revoke via API | ✅ UI for the common ones; all via API |
| Correct driver assignments | Kart change for a participant (keeps laps on both karts) | ✅ API; UI Phase 2 |
| Finalise results | Confirmation dialog; results become official | ✅ |
| Leaderboards and race events | Leaderboards are automatic from final sessions; announcements authoring | Phase 3 |
| System health and device connectivity | Devices: online/offline/never seen, last seen, events in 5 min, clock offset; kart ↔ transponder table | ✅ |
| Register tracks, loops, karts, transponders, devices | API endpoints | ✅ API; setup screens Phase 2 |
| Export results to CSV | Results and lap-by-lap CSV | ✅ |
| Audit trail | `GET /audit`: every action with user, time, before/after and reason | ✅ API; viewer Phase 2 |

## Operator workflow (rental session)

1. **Create session**: "Arrive & Drive 19:30", Rental, Main Circuit.
2. **Assign**: pick kart #07 and type "Aiman"; repeat for each driver at briefing.
3. **Start** when the first kart leaves the pits (or the system receives a start signal: ❓ depends on the circuit).
4. Watch the standings fill live. The **Timing review** lists anything odd as it happens.
5. **Finish** at the chequered flag. Each kart's next crossing completes its last lap.
6. Check the review panel: add a missed crossing or apply a penalty if needed.
7. **Finalise**. Drivers see final results, personal bests and leaderboards update, and (Phase 3) they get a notification.

## Endurance additions

- Entries are **teams** with a kart; the team's first driver is set on the entry.
- **Driver change**: the pit-lane operator records "Team Red → Ben" at the moment of the swap
  (`POST /participants/{id}/stints`). Laps are attributed by lap end time. 🔶 A tablet at pit exit with
  big team buttons is the intended UI (Phase 3). ❓ If the circuit has driver-ID hardware (e.g. RFID wristbands
  scanned at pit exit), an adapter can record stints automatically.
- **Kart change**: `POST /participants/{id}/kart` closes the old kart's range and opens the new one; team laps continue.
- **Penalties**: time and lap penalties; final team standings by laps, then finish time.
