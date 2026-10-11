# 13. Estimated costs (Malaysian ringgit)

🔶 **Every figure here is an estimate for planning, not a quote.** Ranges reflect typical Malaysian rates and
public cloud list prices as we understand them; get current quotes before committing. Foreign-currency prices
are converted at an assumed **USD 1 = RM 4.40**; adjust for the actual rate.

## Development

Effort in **person-weeks** (pw). Two rate scenarios:

- **In-house / freelance**: about RM 3,000–5,000 per pw (a mid-to-senior developer at RM 12,000–20,000/month fully loaded).
- **Agency**: about RM 6,000–10,000 per pw (RM 150–250/hour).

| Phase | Scope | Effort | In-house (RM) | Agency (RM) |
|---|---|---|---|---|
| 1. MVP | CSV import, lap engine, sessions, results, PWA, operator console | ✅ **Built in this repository**; remaining hardening, review and pilot support ≈ 2–3 pw | 6k–15k | 12k–30k |
| 2. Live timing | First vendor adapter + gateway hardening, alerting, setup screens, field acceptance at the circuit | 5–8 pw | 15k–40k | 30k–80k |
| 3. Store apps | React Native (Expo) iOS/Android, push notifications, comparisons, announcements, account linking | 8–12 pw | 24k–60k | 48k–120k |
| 4. Bookings & payments | Online booking, FPX/card payments, check-in, refunds, reminders | 6–10 pw | 18k–50k | 36k–100k |
| 5. Commercial | Multi-venue, championships, analytics, white-labelling, partner API | 10–16 pw | 30k–80k | 60k–160k |
| Design | UI/UX for store apps and booking (freelance designer) | 3–5 pw | 8k–20k | 15k–35k |

**Totals (rough):** MVP-to-live-timing ≈ **RM 21k–55k** in-house (RM 42k–110k agency). The full commercial
product (all phases + design) ≈ **RM 100k–265k** (in-house) or **RM 200k–525k** (agency).

❓ Big unknowns that can move these numbers: the timing vendor's integration terms (a documented API vs. a
proprietary protocol), any vendor licence fees, and how many venues and timing systems must be supported.

## One-off hardware & accounts (per venue)

| Item | Estimate (RM) | Notes |
|---|---|---|
| Gateway mini-PC (fanless, SSD) | 1,500–3,000 | Can be skipped if the vendor offers a cloud API |
| UPS for gateway + network | 400–900 | |
| 4G/5G backup router | 300–800 | Plus SIM plan below |
| Timing hardware | 0 | 🔶 Assumes the circuit's existing decoders/transponders are reused |
| Apple Developer Program | ≈ 440 / year | USD 99/year |
| Google Play developer account | ≈ 110 one-off | USD 25 |
| Domain + DNS | 50–150 / year | |

## Recurring operating costs (monthly)

| Item | Single venue (RM) | Notes |
|---|---|---|
| API hosting (2 small containers or 1 VPS) | 100–400 | |
| Managed PostgreSQL with backups | 150–600 | Smallest production tier with PITR |
| Static web + CDN | 0–50 | |
| Logs, monitoring, uptime alerts | 0–150 | Free tiers often suffice at first |
| 4G backup data plan | 40–100 | |
| Push notifications | 0 | APNs/FCM are free; Expo's free tier covers small volumes 🔶 |
| Email (transactional) | 0–60 | |
| SMS OTP (optional) | ≈ 0.10–0.25 per SMS | Only if phone verification is required |
| Payment gateway (Phase 4) | ≈ 1.5%–3% per transaction | 🔶 Typical for FPX/cards via Malaysian providers (e.g. Billplz, iPay88, Stripe MY); confirm current rates |
| Timing vendor API licence | ❓ | Must obtain from vendor |
| Maintenance & support | 2,000–6,000 | ≈ 2–6 developer-days/month for updates, OS/security patches, support |

**Typical total:** ≈ **RM 300–1,300/month** for infrastructure for one venue, plus maintenance (RM 2,000–6,000), plus
payment and vendor fees where applicable. Multi-venue infrastructure scales sub-linearly (one cloud stack; one gateway per venue).
