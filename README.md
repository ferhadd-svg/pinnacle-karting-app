# Pinnacle Karting: timing, tracking & driver app

An end-to-end platform for rental karting circuits. Lap times come from the circuit's own timing hardware
(transponders → decoder), are processed reliably on a backend, and are shown to drivers in a mobile app and to
staff in an operator console. Designed to integrate with existing timing systems rather than replace them.

> **Design docs:** start at [`docs/README.md`](docs/README.md): architecture, hardware integration questions,
> schema, API, lap-processing rules, app and dashboard specs, security and testing, deployment, costs (RM) and roadmap.

## What's here (Phase 1 MVP)

| Path | What |
|---|---|
| `server/` | Timing API (Node 22, TypeScript, Fastify, PostgreSQL): lap engine, CSV import, session lifecycle, corrections, results, leaderboards, SSE live updates, RBAC, reference trackside gateway |
| `server/migrations/` | SQL schema |
| `web/` | Mobile-first driver app (PWA) + operator console (React, Vite) |
| `docs/` | Design documentation and a sample passings CSV |

Highlights:

- Raw timing events are **immutable**; laps are always **derived** and can be rebuilt; operator corrections are audited.
- A driver is never identified by transponder alone: transponder → kart → session entry → driver/stint, with time-ranged history enforced by the database.
- Results are clearly **Live → Provisional → Final**; only final results count for personal bests, leaderboards and records.

## Quick start

Requires Node 22 and PostgreSQL 16.

```bash
npm install
createdb karting && createdb karting_test
npm run seed -w @pinnacle/server   # demo venue, staff logins, device key, a finalised demo session
npm run dev:server                 # API → http://localhost:3000
npm run dev:web                    # app → http://localhost:5173  (operator console: /#/admin)
```

Live demo with a simulated decoder (use the device key printed by the seed):

```bash
npm run simulate -w @pinnacle/server -- --key tdk_… --transponders T109,T110,T111
```

Tests (wipe and rebuild `karting_test`):

```bash
npm test                           # 63 tests: lap engine, API, reliability, endurance, security
```

Containers: `JWT_SECRET=$(openssl rand -base64 32) docker compose up --build`. See [docs/10-deployment.md](docs/10-deployment.md).
