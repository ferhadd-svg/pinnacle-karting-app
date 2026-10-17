# Customer app (iOS & Android)

The customer-facing interface is a native app (`mobile/`, Expo / React Native), modelled on the
*features* of the RUD Super App used at RUD karting venues in Malaysia, with Pinnacle's own branding.
The web app (`web/`) is now the staff side: operator console plus front desk.

## RUD Super App feature parity

What the RUD app offers, according to its public store listings and website (we could not open the
listings directly, so treat this as 🔶 reported, not verified):

| RUD Super App (reported) | Pinnacle app | Status |
|---|---|---|
| Profile QR code for check-in | Member card with QR + 6-character member code; staff scan or type it | ✅ |
| Sign indemnity waiver in the app, view records | Read & sign the venue's waiver (guardian for under-18s); validity shown at check-in | ✅ |
| Buy tickets for go-kart sessions | Shop → order → payment → tickets in wallet, receipts | ✅ (demo payment provider; real gateway pending ❓) |
| Redeem kiosk tickets into the app | Enter the receipt code; staff can issue counter/kiosk codes | ✅ |
| Transfer tickets to other members | Send a ticket by member code | ✅ |
| Real-time leaderboards / live race results | Live & results tab, live session view refreshing every 3 s | ✅ |
| Monthly best lap per track | Leaderboards: this month / week / today / all time, track records per kart class | ✅ |
| My race result | "Your result" card: position, best, average, consistency, gap to fastest, new-PB badge | ✅ |
| Compare with friends | Friends by member code; friends leaderboard; head-to-head lap comparison in any session | ✅ |
| Tokens earned through racing and purchases, spent on merchandise | Pinnacle tokens: earn per race, podium bonus, per RM10; rewards catalogue with counter vouchers | ✅ |
| Order receipts | Receipts screen | ✅ |
| Messaging / social feed, marketplace | — | Not built (Phase 5 candidates) |

Sources: [Google Play listing](https://play.google.com/store/apps/details?id=com.racingunderdog.app),
[App Store listing](https://apps.apple.com/id/app/rud/id6504531515), [RUD Super App](https://app.racingunderdog.com/),
[Racing Underdog: software & application](https://www.racingunderdog.com/software-application/).

## Screens

| Tab / screen | What it does |
|---|---|
| **Home** | Big "Check in" button (opens QR card), waiver reminder, ticket and token summary, on-track-now, my last race vs personal best |
| **Race** | *Live & results*, *My results* (filters: track, session type, kart, date range), *Leaderboards* (records, periods, kart classes, friends) |
| Session | Status (live/provisional/final), your result + lap bars + head-to-head chart and table, standings with lap-by-lap |
| **Tickets** | Wallet of active and used tickets, buy, redeem kiosk code, receipts; ticket pass with QR and transfer |
| **Rewards** | Balance, how to earn, vouchers to show at the counter, catalogue, history |
| **Me** | Member card, stats, progress chart (best lap per session), personal bests, your karts, waiver, friends, privacy, sign out |

## Reward rules

Defined in `server/src/services/customer.ts` (`TOKENS`) and applied idempotently through a token ledger
(`token_ledger`, unique per driver + reference, so reopening and re-finalising a session never pays twice):

- 10 tokens for each **finalised** session a member drove in (provisional results don't pay out).
- +5 for a podium (P1–P3). Disqualified entries get nothing.
- 1 token per RM10 of paid in-app orders.
- Spending locks the member's row, so simultaneous redemptions can't overspend (tested).
- 🔶 Walk-in results later linked to a member don't earn tokens retroactively.
- ❓ The venue decides the real rates and catalogue.

## Payments

`PAYMENTS_PROVIDER=demo` confirms orders without charging and is clearly labelled in the app and on receipts.
It defaults to `none` in production, where in-app purchase is switched off and customers buy at the counter
(then add the ticket with its code). A real Malaysian gateway (e.g. FPX via Billplz/iPay88, or Stripe)
replaces `pay-demo` with the provider's hosted checkout and webhook → `confirmOrderPaid()`. ❓ Choice of
gateway and merchant account belong to the circuit.

## Staff side (web console → Front desk)

- **Check a member**: scan/type the member code, see name and waiver status.
- **Assign a kart by member code** in a session, so laps land on the customer's account.
- **Link to member**: move a walk-in's earlier results onto an app account (audited).
- **Scan a ticket** (single use), **hand over a reward** (voucher code), **sell at the counter** (issue codes).

## Not yet done

- Push notifications (results final, new PB, ticket received): needs the Expo push service and device tokens.
- Native camera scanning in the staff console (codes can be typed or read by a USB/Bluetooth scanner that types).
- Real app icon, splash screen and store listing assets.
- Booking specific session times (tickets are currently "any session of this type").
