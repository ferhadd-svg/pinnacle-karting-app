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
| Real-time leaderboards / live race results | Live & results tab; **live view** with karts moving round the track map and a timing tower, refreshing every 3 s (positions between crossings are estimated from each kart's lap pace) | ✅ |
| Monthly best lap per track | Leaderboards: this month / week / today / all time, track records per kart class | ✅ |
| My race result | "Your result" card: position, best, average, consistency, gap to fastest, new-PB badge | ✅ |
| Compare with friends | Friends by member code; friends leaderboard; head-to-head lap comparison in any session | ✅ |
| Tokens earned through racing and purchases, spent on merchandise | Points: earn per race, podium bonus, per RM10; rewards marketplace with counter vouchers | ✅ |
| Order receipts | Receipts screen | ✅ |
| Mileage tiers, Daily Top 3 badges, multi-session tickets (seen in RUD screenshots) | Same | ✅ |
| Credits (stored value), lockers, messaging / social feed, merchandise marketplace | — | Not built (lockers need venue hardware) |

Sources: [Google Play listing](https://play.google.com/store/apps/details?id=com.racingunderdog.app),
[App Store listing](https://apps.apple.com/id/app/rud/id6504531515), [RUD Super App](https://app.racingunderdog.com/),
[Racing Underdog: software & application](https://www.racingunderdog.com/software-application/).

## Screens (layout follows RUD Super App screenshots supplied by the client)

Four tabs: **Home · Store · My Tickets · Me**, dark navy with a salamander-orange accent (`#F25C1F`) and thin type (weights 200–400); both are set in `mobile/src/lib/theme.ts`. Pinnacle's own name and
peak logo are used; RUD's marks, venue names and photos are not.

| Screen | What it shows | RUD equivalent |
|---|---|---|
| **Home** | Wordmark; quick actions *Join Race* (store), *Indemnity*, *Rewards*, *Live*; promotions carousel; on-track-now; a **Monthly Best** card per venue (venue colour, drawn track outline, top 3 with trophies) → venue leaderboard | Home |
| **Store** | Pinnacle Kart has one venue, so the tab opens its store directly (products, quantity, checkout). If more venues are ever added it becomes *Select Track*: a card per venue with its colour, format and track outline | Store → Driver Selection |
| **My Tickets** | All / Available / Used, venue filter, each ticket with purchase time and **SESSION USED x / y** (multi-session packs); ticket pass with QR; buy; redeem kiosk code | My Tickets |
| **Me** | *My QR*; avatar, name, tier and member badges; **Daily Top 3** trophy per venue; Points, Tickets ready, tier card with **mileage (km) and distance to next tier**, current kart; Sign Indemnity, My Racing; History (My Purchase, My Rewards, My Indemnity); My Vouchers; Friends; Password; privacy; sign out | Me |
| Venue | Header, buy button, track records, this month / week / today / all time / friends boards, kart classes | (monthly-best detail) |
| My Racing | Sessions, laps, wins, podiums; progress chart; personal bests; best kart per venue; every race with filters | — |
| Session | Your result (position, best, average, consistency, gap, new-PB badge), head-to-head chart and table, standings | My race result |

### Rules behind the Me screen

- **Mileage** = every lap of a *final* session × that track's length. Tiers (in `server/src/services/customer.ts`, `TIERS`):
  Rookie 0 km · Amateur 50 · Pro 150 · Elite 500 · Legend 1,000. ❓ The venue sets the real thresholds and any perks.
- **Daily Top 3**: per venue, the number of days the member's best final lap ranked top 3 on that venue's track (venue local day).
- **Current kart**: the kart you're assigned to in a running or upcoming session.
- **Public boards show walk-ins as "Guest"**: people without an account never opted in to having their name published.
  Session results at the venue still show the names the operator entered.

### Ticket packs

A product can cover several sessions (`products.sessions`). Each check-in scan uses one (`ticket_uses` keeps every
scan); the ticket is spent after the last. Transfers move the remaining sessions.

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
