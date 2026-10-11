# 7. Lap-time calculation & event processing

Implementation: [`server/src/timing/laps.ts`](../server/src/timing/laps.ts) (pure engine),
[`standings.ts`](../server/src/timing/standings.ts) (rankings),
[`services/processing.ts`](../server/src/services/processing.ts) (loads data, persists results).

## The core rule

A lap is the time between **two consecutive valid finish-line crossings by the same participant**
within a session, using the decoder's own timestamps.

```
Kart 07 crosses at 14:30:00.000  → starts lap 1
Kart 07 crosses at 14:31:01.200  → lap 1 = 61.200 s  (1:01.200)
Kart 07 crosses at 14:32:02.100  → lap 2 = 60.900 s  (1:00.900)
```

✅ This exact example is a unit test (`laps.test.ts`) and an end-to-end test through the API (`lifecycle.test.ts`).

## Laps are derived, never edited

```
laps(session) = f( raw events in the session window,
                   participant ↔ kart ↔ transponder time ranges,
                   session start/finish + clock offset,
                   lap rules,
                   active operator corrections )
```

- Raw events are immutable. A database trigger rejects `UPDATE`/`DELETE`.
- Every change (new event, late event, correction, kart reassignment, finish) triggers a **full
  recalculation of that session** inside a transaction holding a row lock on the session, so
  concurrent recalculations serialise. The result is deterministic: the same inputs always give the same laps,
  whatever order the events arrived in.
- Cost: measured in `endurance.test.ts`, a 30-kart × 120-lap race (3,600 events, 8 batches of 500) ingests
  and recalculates in about 1 s total, so roughly 100 ms per batch on a development container. Fine at one
  batch per second; see the [backend plan](06-backend-plan.md) for when to optimise.

## Processing steps (per participant)

1. **Collect crossings**: raw events whose transponder matches one of the participant's kart ranges *and*
   whose time falls inside that range; plus manual crossings added by an operator.
2. **Map loops**: the decoder loop ID becomes `finish`, `pit_in`, `pit_out` or `split` via the track's loop
   table. Unknown loop IDs are ignored and reported (`unknownLoops`). A track with no loops configured treats every loop as the finish line.
3. **Sort** by timestamp (event ID as tie-break). This makes out-of-order and late delivery harmless.
4. **Filter finish-line crossings** in order, comparing each to the previous *accepted* crossing:

| Situation | Rule | Result |
|---|---|---|
| Excluded by an operator | `exclude_event` correction | rejected `excluded_by_correction` |
| Before session start − tolerance (2 s) | session boundary | rejected `before_session` |
| After the participant already took the chequered flag | session boundary | rejected `after_finish` |
| Within `dedupWindowUs` (2 s) of the previous crossing | duplicate read of one physical crossing | rejected `duplicate` |
| Within `minLapUs` (15 s default, per track) of the previous crossing | physically impossible lap → ghost read | rejected `too_short`; timing continues from the previous accepted crossing |
| First crossing at or after the chequered flag | completes the final lap | accepted, then the participant is finished |

5. **Build laps** from consecutive accepted crossings:
   - `first_crossing` mode (rental/practice/qualifying default): the first crossing only starts the clock.
   - `session_start` mode (sprint/endurance default; grid behind the line): lap 1 runs from the start signal
     and is flagged `start_lap`. It counts for distance but never as a best lap or record.
6. **Flag laps** (a flagged lap still counts for race distance, but not for best laps, personal bests or records):

| Flag | Rule |
|---|---|
| `pit` | a `pit_in` loop crossing happened during the lap |
| `exceeds_max` | longer than `maxLapUs` (if the track sets one) |
| `suspect_missed` | longer than `missedLapFactor` (1.8) × the participant's median clean lap, once there are at least 3 clean laps. Usually a missed detection: the "lap" is really two |
| `invalidated` | operator `invalidate_lap` correction (e.g. track limits) |
| `start_lap` | lap 1 timed from the start signal |

7. **Attribute drivers**: solo entries get the entry's driver. Team entries get the driver whose **stint**
   contains the lap's end time; stints are recorded by the pit-lane operator.
8. **Rank** (see below) and persist `laps` + `session_results`, then `NOTIFY` subscribers.

## Edge cases, and how each is handled

| Case | Handling | Test |
|---|---|---|
| Duplicate transponder detections | Identical re-sends: unique `(device, eventKey)`. Multiple reads of one crossing: dedup window | `reliability: re-sending…`, `collapses duplicate detections` |
| Missed detection | Flagged `suspect_missed`; operator adds the missing crossing (e.g. from video), which splits the lap | `operator corrections…` |
| Implausibly short laps | Ghost read rejected; the next lap is timed from the last real crossing | `rejects implausibly short laps` |
| Pit lane / extra loops | `pit_in` marks pit laps; `pit_out`/`split` are kept for future sector times | `marks laps containing a pit-in` |
| Session start/finish boundaries | Start tolerance; chequered flag ends each kart on its next crossing; post-chequer window 10 min | `chequered flag…` |
| Karts entering late / leaving | Late entry opens its range from now; a kart change closes one range and opens another | `mid-session kart change` |
| Delayed / out-of-order events | Sort + full recalculation; identical result | `identical laps when a gateway replays…` |
| Network outage at the track | Gateway spool on disk + retries; server idempotency | `gateway.test.ts` |
| Decoder restart (sequence resets) | Keys are boot-scoped (`bootId:seq`), so new events are never mistaken for duplicates | `decoder restart…` |
| Back-to-back sessions on the same karts | Starting a session closes the previous session's open ranges for those transponders | `back-to-back sessions…` |
| Backfilling an earlier session | New ranges end where a later session's begin | `backfilling…` |
| Kart in two running sessions | Database exclusion constraint → `409 transponder_in_use` | `refuses to start…` |
| Transponder moved to another kart | Assignment history; past sessions keep their snapshot | `transponder moved…` |
| Late events after finalisation | Stored, **not applied**, surfaced as `lateEventsAfterFinalisation`; operator reopens with a reason | `final results are frozen…` |
| Manual corrections | Append-only table with reason, user and time; revocable; audit log entry | `operator corrections…` |
| Two conflicting reads within min-lap | The **earlier** read is kept. If it was the ghost, the operator excludes it and the later one takes over | anomaly report shows both |

## Ranking rules

**Timed sessions** (practice, rental, qualifying):

1. Best **valid** lap, ascending.
2. Tie on lap time (to the microsecond, or the decoder's native precision): the driver who set it **first** ranks higher.
3. Entries without a valid lap rank after those with one, by laps completed.
4. Disqualified entries are listed last without a position.

**Races** (sprint, endurance):

1. Laps completed (minus lap penalties), descending. Invalid laps *do* count for distance.
2. Then time of the final crossing (plus time penalties), ascending.
3. Gap: time to the leader on the same lap, or "+N laps".

**Exact ties** (identical keys) share a position. **Fastest lap of the session**: best valid lap; ties go to whoever set it first.

**Leaderboards and records** use only **final** sessions, valid laps, the same **track layout**, and are split
by **kart class**. Mixed-class views are labelled `mixedClasses: true` with a note. Drivers who opted out of
public leaderboards are hidden (they still see themselves). 🔶 Sessions timed by different timing systems on
the same layout should be given different `tracks.layout` values until their equivalence is verified.

## Provisional vs final

| Session status | Result status | Behaviour |
|---|---|---|
| `running` | **Live** | Recalculated on every event batch |
| `finished` | **Provisional** | Still recalculated (karts finishing their last lap, late events, corrections) |
| `final` | **Final** | Frozen: new events are stored but not applied. Feeds personal bests, leaderboards and records |
| `final` → reopen | Provisional | Requires a reason (audited); then recalculates and can be finalised again |

## Default rules (per track, overridable per session)

| Rule | Default | Notes |
|---|---|---|
| `dedupWindowUs` | 2 s | 🔶 Tune once real duplicate patterns are known |
| `minLapUs` | 15 s | 🔶 Set per track: about 60% of the record lap |
| `maxLapUs` | none | 🔶 Optional, e.g. 3× the typical lap |
| `missedLapFactor` | 1.8 | Needs ≥ 3 clean laps |
| `startMode` | `first_crossing`; `session_start` for sprint/endurance | Imports that set the window from the file always use `first_crossing` (a file has no start signal) |
| `boundaryToleranceUs` | 2 s | Residual clock difference at the start |
