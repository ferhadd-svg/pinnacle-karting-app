# 11. Security & testing plan

## Security

### Threats and controls

| Threat | Control | Status |
|---|---|---|
| Fake timing events (someone posts laps) | Per-device API keys (random 192-bit, SHA-256 hashed at rest, shown once); devices can only call timing endpoints for their own track; disable a device to revoke | ✅ |
| Staff overreach across venues | Operators scoped to one venue on every write and admin read; admin-only provisioning of venues, users and devices | ✅ Tested |
| Silent result tampering | Raw events immutable (DB trigger); corrections append-only with reason and user; audit log with before/after; final results frozen until an audited reopen | ✅ Tested |
| Credential theft | scrypt password hashing; JWT secret from the environment (required in production); 12 h expiry; HTTPS only (deployment) | ✅ / deployment |
| Brute-force login | Rate-limit `/auth/login` per IP and per account | Phase 2 (`@fastify/rate-limit`) |
| Injection | Parameterised SQL everywhere; zod validation of all inputs; CSV exports neutralise formula injection (`=`, `+`, `-`, `@`) | ✅ |
| Personal data exposure | Minimal data; leaderboard opt-out with "Private driver"; history private unless opted in; no payment card data stored | ✅ |
| Log leakage | `authorization` and `x-device-key` headers redacted from logs | ✅ |
| CORS abuse | Allow-list of web origins (`CORS_ORIGINS`) | ✅ |
| Trackside gateway compromise | Gateway holds only its device key; outbound-only HTTPS; no inbound ports; OS auto-updates; disk encryption on the mini-PC | 🔶 Deployment checklist |
| Denial of service | Body limits (5 MB events, 20 MB imports, 5,000 events per batch); managed load balancer; rate limits | ✅ / Phase 2 |

### Compliance

🔶 Malaysia **PDPA 2010**: privacy notice and consent at sign-up, purpose limitation, access and correction
requests, deletion by anonymising (results stay, the name is removed). ❓ Align with the circuit's existing
privacy notice, especially for minors (junior drivers): a guardian's account should own a junior's profile.

### Operational checklist (before go-live)

- [ ] `JWT_SECRET` ≥ 32 random bytes, stored in the host's secret manager.
- [ ] Seed passwords replaced; admin accounts use unique strong passwords (MFA in Phase 3).
- [ ] Managed Postgres with encryption at rest, PITR backups, and no public access except from the API.
- [ ] TLS on API and web; HSTS.
- [ ] Gateway mini-PC: full-disk encryption, auto-updates, UPS, device key in a root-only file.
- [ ] Restore drill from backup; rebuild a session's results from raw events.

## Testing strategy

**Layers**

1. **Unit tests: pure engine** (`test/unit/`, run in ~1 s): lap rules, standings, timestamps, CSV parsing, gateway spool/uploader.
2. **Integration tests against real PostgreSQL** (`test/integration/`): every test builds a fresh schema, then drives the
   real HTTP API with injected requests. A real database is essential: exclusion constraints, triggers and
   transactions are part of the correctness story.
3. **End-to-end UI checks**: Playwright drives the built web app against a running API (done for this release:
   public results, leaderboards, operator create → assign → import → finalise).
4. **Field acceptance** (Phase 2, at the circuit): shadow-run alongside the existing timing system for a week of sessions
   and compare every lap. Target: 100% of laps within the decoder's native precision; every difference explained.

**Required scenarios → tests**

| Scenario from the brief | Test(s) |
|---|---|
| Duplicate timing events | `reliability › re-sending a batch…`, `› collapses duplicate detections…`; unit `collapses duplicate reads` |
| Missed laps | unit `flags a probable missed detection`; `reliability › operator corrections…` (add crossing) |
| Incorrect kart assignments | `assignments › a transponder moved…`, `› cannot start… no transponder`; anomalies `unmatchedEvents` |
| Multiple simultaneous karts | `reliability › handles many simultaneous karts`; endurance 30-kart test |
| Network outages | unit `gateway › keeps unacknowledged events across a restart…`; `reliability › gateway replays buffered events late and out of order` |
| Timing device restarts | `reliability › decoder restart: sequence numbers reset…` |
| Incorrect session boundaries | unit `ignores crossings before the session start`, `ends each kart on its first crossing after the chequered flag`; `lifecycle › chequered flag…`; `lifecycle › rejects start times in the future`; `assignments › backfilling…` |
| Driver changes | `endurance › attributes laps to drivers by stint…`; unit `attributeDrivers` |
| Kart and transponder reassignment | `assignments › back-to-back sessions…`, `› transponder moved…`, `› mid-session kart change…` |
| High-volume endurance races | `endurance › processes a high-volume race (30 karts × 120 laps)` |
| Data recovery and recalculation | `reliability › raw events are immutable`; corrections revoke → recalculation; `lifecycle › final results are frozen… reopen` |
| Security / RBAC | `security.test.ts` (bad credentials, driver vs operator vs device, venue scoping, hashing, privacy, validation) |

**Running the tests**

```bash
# PostgreSQL 16 running locally, with a database the tests may wipe:
createdb karting_test
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/karting_test npm test
```

Current result: **63 tests passing** (30 unit, 33 integration).

**Next additions** (Phase 2): property-based tests for the engine (random crossings, shuffles and duplicates must
not change the laps); a soak test with the simulator running for hours with induced outages; recorded real
decoder sessions replayed as fixtures once a vendor feed is available; CI on every push.
