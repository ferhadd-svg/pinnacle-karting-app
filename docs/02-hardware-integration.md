# 3. Hardware & timing-provider integration

**Principle:** we integrate with the circuit's existing timing hardware and software through an
**authorised, documented interface**. We do not reverse-engineer proprietary protocols, and we do not
assume any two timing systems speak the same protocol.

## How kart timing hardware generally works

✅ Confirmed by the brief / 🔶 general industry practice, to be confirmed per circuit:

1. Each kart carries an **active transponder** with a unique ID. 🔶 Transponders are usually
   powered from the kart's battery or have their own rechargeable battery.
2. A **loop** (a cable buried in or taped across the track) at the start/finish line, and sometimes at the
   pit-lane entry/exit or split points, picks up the transponder signal as the kart passes.
3. A **decoder** connected to the loop(s) determines the moment of passing and timestamps it with
   its own clock (typically millisecond or better precision 🔶).
4. The decoder sends each **passing record** to timing software over a link such as Ethernet/TCP,
   serial (RS-232/USB) or a vendor cloud. ❓ The actual link and message format depend on the vendor and model.
5. The circuit's **timing/venue software** (if any) turns passings into laps, shows them on screens,
   and may offer exports or an API.

Examples of vendors and products seen in rental karting include MYLAPS (formerly AMB) decoders and
transponders, and venue/timing software such as SMS-Timing, Club Speed and Apex Timing. 🔶 These are
examples only: ❓ which system a given circuit (e.g. Pinnacle Kart or RUD International KL) runs, and
what it lets third parties access, must be confirmed with that circuit.

## Normalised timing event (what every adapter must produce)

| Field | Required | Notes |
|---|---|---|
| `transponder` | ✅ | ID exactly as the decoder reports it (string) |
| `timestamp` | ✅ | ISO 8601 with offset, or epoch microseconds, **decoder clock**, native precision kept |
| `loop` | ✅ (defaults to start/finish) | Decoder's loop/timing-point ID; mapped to a role per track (`finish`, `pit_in`, `pit_out`, `split`) |
| `eventKey` | Strongly recommended | Idempotency key unique per device **across decoder restarts**: the vendor's passing ID, or `${decoderBootId}:${sequence}`. If absent, the API hashes (transponder, loop, timestamp). |
| `sequence` | Optional | Decoder sequence number; used for gap detection, never as the key on its own (it can reset) |
| `sourceStatus` | Optional | Vendor status/quality flags (e.g. signal strength, low battery) |
| `raw` | Optional | Original vendor record, stored verbatim for audit |
| Device identity | ✅ | From the device API key; the server knows venue, track and provider |

## Integration methods (adapters)

The gateway runs one adapter per source. All produce the event above; none computes laps.

| Method | When to use | Adapter behaviour | Status |
|---|---|---|---|
| **CSV / file export** | Vendor software can export passings; no live access yet | Operator uploads, or gateway watches an export folder | ✅ Upload implemented (`POST /v1/imports/passings`); folder watch Phase 2 |
| **Vendor REST/WebSocket API** | Vendor or venue software offers a documented API | Poll or subscribe; map records; keep the vendor's passing ID as `eventKey` | ❓ Needs API docs + credentials |
| **Decoder TCP stream** | Vendor documents the decoder protocol and permits direct connection | Persistent TCP client with reconnect; parse frames per vendor spec; request resend of missed sequences if supported | ❓ Needs protocol spec and permission |
| **Serial (RS-232/USB)** | Older decoders | Serial reader on the gateway PC; same parsing approach | ❓ Needs spec, cable/pinout, baud settings |
| **Simulator** | Development, demos, soak tests | Emits realistic passings with occasional duplicate reads | ✅ Implemented (`npm run simulate`) |

The reference gateway (`server/src/gateway/`) provides the parts every adapter shares:

- **Durable spool**: each passing is appended to a local file *before* upload and removed only after the
  API acknowledges it. A crash, power cut or internet outage loses nothing. ✅ Tested.
- **Uploader**: batches of up to 200, in order, with exponential backoff (0.5 s → 30 s) while the API is unreachable. ✅ Tested.
- **Heartbeat** every 5 s: liveness for the operator dashboard, plus the decoder−server clock offset.

## Clock synchronisation

- Lap times use **only differences between timestamps from the same decoder clock**, so a constant
  clock offset does not affect them.
- Session start/finish are pressed in the operator console (**server clock**). The API converts them to the
  decoder clock using the offset reported by the gateway, snapshotted when the session starts, so later drift
  never shifts past sessions.
- 🔶 If a track has **several decoders** (e.g. a separate pit-lane decoder), they must share a time
  source (GPS or NTP, if the hardware supports it) for pit-lane timing to be meaningful. ❓ Confirm with vendor.

## Vendor and circuit questionnaire

Nothing in the ❓ list should be built until these are answered. Send this to the circuit and, through them, the timing vendor.

**Hardware**
1. Decoder make, model and firmware version? How many decoders, and which loops is each connected to?
2. Loops installed: start/finish only, or also pit-in, pit-out, splits? What loop IDs does the decoder report?
3. Transponder make/model; ID format (numeric? length?); one per kart, fixed or moved between karts? How are spares handled?
4. Timestamp precision and clock source (internal, GPS, NTP)? Does the decoder report its own time so we can measure offset?
5. Does the decoder report signal quality or low battery? Does it filter duplicate reads itself?

**Software and access**

6. Which timing/venue software runs the circuit today? Version? On-premises or cloud?
7. Is there a **documented** API, export or data feed for passings (not just laps)? Can we have the documentation?
8. Are we **authorised** (in writing) by the circuit and, where required, the vendor to connect to it? Any licence fee?
9. Protocol details: transport (TCP/serial/HTTP/WebSocket), message format, sequence numbers, resend/replay of missed passings, heartbeat.
10. Can the vendor software and our gateway connect at the same time, or is the decoder single-client?
11. If only lap-level exports exist: do they include crossing timestamps, or only lap durations? (Durations alone cannot be re-validated.)

**Operations**

12. How are sessions run today: who presses start/finish, and is there a start signal we can receive automatically?
13. How do drivers get assigned to karts (paper, kiosk, venue software)? Can we read that assignment instead of re-keying it?
14. Endurance driver changes: how are they recorded today? Is there driver ID hardware (e.g. RFID wristbands) at pit exit?
15. Network at the track: wired LAN to the timing room? Internet uplink and typical outages? Somewhere to put a small PC with a UPS?
16. Data retention, personal-data and marketing consents the circuit already collects (PDPA 2010).

## What phones can and cannot do

✅ The mobile app **does not** and **cannot** detect transponder signals: timing transponders and loops use
dedicated radio hardware that phones don't have. The app only displays what the circuit's timing system
recorded. GPS lap timers on phones are not accurate enough for rental-kart timing and are not used.
