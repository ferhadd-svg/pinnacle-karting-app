# Pinnacle Karting — Timing, Tracking & Driver Platform

Design documentation for an end-to-end karting timing platform: transponders → trackside timing
hardware → integration gateway → backend → driver app and operator dashboard. It is inspired by
the *kind* of functionality offered by venue apps such as the RUD Super App in Malaysia; we have
not inspected that app or any circuit's timing system, and nothing here assumes access to one.

## Deliverables (in the order requested)

| # | Deliverable | Document |
|---|---|---|
| 1 | System architecture diagram | [01-architecture.md](01-architecture.md#1-system-architecture) |
| 2 | End-to-end data flow, transponder → app | [01-architecture.md](01-architecture.md#2-end-to-end-data-flow) |
| 3 | Hardware & timing-provider integration requirements | [02-hardware-integration.md](02-hardware-integration.md) |
| 4 | Database schema with relationships | [03-database.md](03-database.md#4-schema-and-relationships) |
| 5 | SQL tables & migrations | [03-database.md](03-database.md#5-migrations) · [`server/migrations/`](../server/migrations) |
| 6 | API specification with sample payloads | [04-api.md](04-api.md) |
| 7 | Lap-time calculation & event processing | [05-lap-processing.md](05-lap-processing.md) |
| 8 | Backend implementation plan | [06-backend-plan.md](06-backend-plan.md) |
| 9 | Mobile app screens & navigation | [07-mobile-app.md](07-mobile-app.md) |
| 10 | Admin dashboard specification | [08-admin-dashboard.md](08-admin-dashboard.md) |
| 11 | Security & testing plan | [09-security-and-testing.md](09-security-and-testing.md) |
| 12 | Deployment & hosting architecture | [10-deployment.md](10-deployment.md) |
| 13 | Development & operating costs (MYR) | [11-costs.md](11-costs.md) |
| 14 | Phased roadmap, MVP → commercial product | [12-roadmap.md](12-roadmap.md) |

## How to read the status markers

Every component distinguishes what we know from what we are guessing:

- ✅ **Confirmed** — stated in the project brief, or implemented and covered by tests in this repository.
- 🔶 **Assumption** — a reasonable default we chose; change it if the circuit says otherwise.
- ❓ **Must obtain** — information only the circuit or its timing vendor can provide. Nothing that depends
  on it should be built until it is answered. The full list is in
  [02-hardware-integration.md § Vendor questionnaire](02-hardware-integration.md#vendor-and-circuit-questionnaire).

## What exists today

Phase 1 (MVP) is implemented and tested. See the [roadmap](12-roadmap.md) for what is done and what's next.

- `server/` — timing API, lap engine, PostgreSQL schema, CSV import, reference gateway, 63 tests.
- `web/` — mobile-friendly driver app (PWA) and operator console.
- `docs/samples/passings-sample.csv` — sample passings export used by the seed data.
