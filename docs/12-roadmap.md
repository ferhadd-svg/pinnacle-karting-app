# 14. Phased roadmap: MVP → commercial product

Each phase ends with something a circuit can use, and only starts once the previous one is reliable.

## Phase 1: MVP ✅ (this repository)

**Goal:** import timing data, map transponders → karts → drivers, calculate laps, publish results on mobile.

- ✅ PostgreSQL schema + migrations; immutable raw events; time-ranged assignments with database guarantees
- ✅ Lap engine (dedup, ghost reads, missed-lap and pit flags, boundaries, chequered flag, grid-start laps, corrections, penalties, stints)
- ✅ CSV passings import (idempotent, column detection, time zones), seed data and sample file
- ✅ Session lifecycle with live → provisional → final; reopen with audit
- ✅ REST API + SSE live updates; RBAC (driver/operator/admin/device) with venue scoping
- ✅ Mobile-first web app: results, lap-by-lap, leaderboards and records, driver history with filters, PBs, privacy
- ✅ Operator console: sessions, kart assignment, import, timing review, penalties, finalise, CSV export, device health
- ✅ Reference gateway (durable spool, retrying uploader, simulator)
- ✅ 63 automated tests, including every reliability scenario in the brief

**Exit criteria (with the circuit):** a week of real exported sessions imported and checked against the circuit's own
results; operators can run the workflow without help.

## Phase 2: Live timing integration (≈ 5–8 pw)

Prerequisite: answers to the [vendor questionnaire](02-hardware-integration.md#vendor-and-circuit-questionnaire) and written authorisation.

- Vendor adapter (API, TCP or serial, per the documentation) + gateway as a hardened systemd service
- Automatic start/finish from the timing system, if it exposes a start signal
- Read kart assignments from the venue's system, if available (no double entry)
- Recalculation coalescing; alerts (device offline, silent running session); metrics
- Console: setup screens (tracks, loops, karts, transponders, devices), raw event viewer, audit viewer, kart-change UI
- Login rate limiting, refresh tokens
- **Shadow run:** a week alongside the existing system; every lap compared

## Phase 3: Driver app in the stores (≈ 8–12 pw) — largely built

Built (see [13-customer-app.md](13-customer-app.md)): Expo iOS/Android app, member QR check-in and account linking,
waivers, tickets (buy/redeem/transfer), rewards, friends, comparisons, progress. Remaining:

- Store release: real icon/splash/screenshots, EAS builds, App Store and Play Store listings
- Push notifications: results final, new PB, ticket received, booking reminders
- Venue picker for multi-venue operators; announcements and race events
- Camera scanning in the staff console; pit-lane tablet UI for endurance driver changes; optional RFID driver-ID adapter
- Materialised leaderboards; data deletion/anonymisation flow (PDPA)

## Phase 4: Bookings & payments (optional, ≈ 6–10 pw)

- Real availability from the circuit's schedule; booking → session participant
- FPX/card payments via a Malaysian provider; refunds; vouchers and packages
- Check-in QR at the kiosk; waivers; junior/guardian accounts
- ❓ Integrate with or replace the circuit's existing booking system (business decision)

## Phase 5: Commercial product (≈ 10–16 pw)

- Multi-venue tenancy, white-label branding per circuit
- Championships and leagues with points across sessions; team management
- Analytics for operators (utilisation, kart performance, kart maintenance alerts from lap-time drift)
- Partner API and webhooks; second and third timing-vendor adapters
- Scale-out: worker queue for recalculation, read replicas, CDN-cached public results

## Unresolved questions to close first

1. ❓ Which timing system each target circuit runs, and whether a documented, authorised data feed exists.
2. ❓ Are passing-level timestamps available, or only lap durations? (Lap-only data limits validation.)
3. ❓ How sessions are started and how drivers are assigned to karts today.
4. ❓ Endurance driver identification at the circuit (operator workflow vs. hardware).
5. ❓ Data residency, privacy notice and retention requirements.
6. ❓ Whether bookings and payments should integrate with an existing system or replace it.
