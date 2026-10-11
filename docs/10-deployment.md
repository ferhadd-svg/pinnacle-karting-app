# 12. Deployment & hosting

## Architecture

```mermaid
flowchart LR
  subgraph Venue["Circuit"]
    DEC[Decoder] --> GW["Gateway mini-PC<br/>(UPS, wired LAN, 4G backup)"]
    TAB["Operator PC / tablet<br/>(browser)"]
  end
  subgraph Cloud["Cloud region: Malaysia (or Singapore)"]
    LB["HTTPS load balancer / CDN"]
    API1["API container ×2"]
    PG[("Managed PostgreSQL 16<br/>PITR backups")]
    WEB["Static web app<br/>(CDN / object storage)"]
  end
  Phones["Driver phones"] --> LB
  TAB --> LB
  GW -->|"HTTPS, outbound only"| LB
  LB --> API1 --> PG
  LB --> WEB
```

| Component | Recommendation | Notes |
|---|---|---|
| Region | Malaysia (e.g. AWS `ap-southeast-5`) or Singapore | Latency from KL is small either way; ❓ check whether the circuit requires data in Malaysia |
| API | 2 small containers (0.5 vCPU / 1 GB) behind a load balancer | Stateless; SSE fan-out works across instances via `LISTEN/NOTIFY`. Set the load balancer idle timeout above 15 s (SSE ping interval) |
| Database | Managed PostgreSQL 16, 1–2 vCPU, 20 GB, daily snapshots + point-in-time recovery | Needs the `btree_gist` extension (supported by major managed providers 🔶 verify) |
| Web | Static hosting + CDN (built `web/dist`) | `VITE_API_URL` set at build time |
| Gateway | Fanless mini-PC, Linux, Node 22, systemd service; UPS; wired to the decoder network | Store-and-forward makes it tolerant of internet drops; a 4G router as backup uplink 🔶 |
| Secrets | Cloud secret manager → env vars `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGINS` | |
| Monitoring | Uptime check on `/health`; log aggregation; alerts for device offline / no events in a running session | Phase 2 |

Simpler alternative for a single venue: one VPS (2 vCPU/4 GB) running `docker compose` with a managed database.
Avoid self-managed Postgres without tested backups.

## Environment variables

| Variable | Required | Example |
|---|---|---|
| `DATABASE_URL` | yes | `postgres://user:pass@host:5432/karting` |
| `JWT_SECRET` | yes in production | 32+ random bytes |
| `CORS_ORIGINS` | yes | `https://app.pinnaclekarting.example` |
| `PORT`, `HOST` | no | `3000`, `0.0.0.0` |
| `LOG_LEVEL` | no | `info` |
| `NODE_ENV` | `production` in prod | makes `DATABASE_URL`/`JWT_SECRET` mandatory |

## Running it

### Local development

```bash
npm install
createdb karting && createdb karting_test        # PostgreSQL 16
npm run seed -w @pinnacle/server                  # demo venue, users, device key, finalised demo session
npm run dev:server                                # API on :3000 (migrates on start)
npm run dev:web                                   # app on :5173
npm run simulate -w @pinnacle/server -- --key <device key from seed> --transponders T109,T110 --pace 45000
```

The seed prints the admin/operator logins and a device key. Open `http://localhost:5173/#/admin` to run a session.

### Containers

```bash
JWT_SECRET=$(openssl rand -base64 32) docker compose up --build    # db + api (:3000) + web (:8080)
```

For demo data, run `npm run seed -w @pinnacle/server` from a checkout with `DATABASE_URL` pointing at the
compose database (the seed reads `docs/samples/`, which is not in the API image).

✅ The API and web images were built and the API image was smoke-tested (migrations, health check, non-root user)
against PostgreSQL. 🔶 The full `docker compose up` was not run in the development sandbox.

### Gateway at the circuit

1. Install Node 22 on the mini-PC; copy the `server/` package (the gateway lives in `server/src/gateway`).
2. Create a device in the API (admin: `POST /v1/devices`) and store the key in `/etc/pinnacle/gateway.env` (mode 600).
3. Implement the vendor adapter (after the [questionnaire](02-hardware-integration.md#vendor-and-circuit-questionnaire)), or use CSV import until then.
4. Run as a systemd service with `Restart=always`; the spool lives in `/var/lib/pinnacle/spool`.

### Database migrations in production

The API applies pending migrations at start-up, under an advisory lock, so several instances can start at once.
For risky migrations, run `npm run migrate` as a one-off release step first.

### Backups and recovery

- Managed PITR (7–14 days) + daily snapshot export to separate storage (30–90 days).
- Monthly restore test into a staging database.
- Results can always be rebuilt from raw events (`POST /v1/sessions/{id}/recalculate`), so raw events and corrections are the critical data.
