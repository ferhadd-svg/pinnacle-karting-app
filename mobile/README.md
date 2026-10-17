# Pinnacle Karting: driver app (iOS & Android)

Expo SDK 58 / React Native 0.88 app for customers, in a RUD Super App style: check in with a QR
member card, follow live timing, see your results and progress, buy and manage tickets, sign the waiver,
collect points, climb mileage tiers and compare lap times with friends. It talks to the timing API in `../server`.

## Run it

```bash
cd mobile
npm install
EXPO_PUBLIC_API_URL=http://<your-computer-LAN-IP>:3000 npx expo start
```

Scan the QR code with **Expo Go** (iOS/Android) on a phone on the same Wi-Fi. Use your computer's LAN IP
address, not `localhost`: on the phone, `localhost` is the phone itself. Start the API with
`PAYMENTS_PROVIDER=demo` to try in-app ticket purchase without a payment gateway.

Demo login after `npm run seed -w @pinnacle/server` in the repo root: create an account in the app, or
use the staff console to assign yourself to a kart by member code.

## Demo mode (no server needed)

```bash
EXPO_PUBLIC_DEMO=1 npx expo start                                   # on a phone with Expo Go
EXPO_PUBLIC_DEMO=1 npx expo export --platform web --output-dir dist # static web demo, one JS bundle
```

`EXPO_PUBLIC_DEMO=1` answers every API call on the device (`src/lib/demo/backend.ts`):

- Read-only data is real API output recorded from a seeded server (`src/lib/demo/fixtures.json`).
- Purchases, waiver signing, rewards, friends and settings change a local copy, saved in the browser in
  the web demo.
- One 10-minute session is always on track, simulated lap by lap from the clock, so the live view always
  has karts moving.

Sign in with the "Use the demo account" button (Farah, `farah@example.com` / `farah-demo-pass`); new
sign-ups are switched off. `app.config.js` turns off per-screen code splitting for demo builds, so the web
demo is a single bundle that can be hosted from any folder.

## Checks

```bash
npm run typecheck                                     # TypeScript, strict
npx expo export --platform android --platform ios    # proves both native bundles compile
npx expo-doctor                                       # dependency/config health (needs internet)
```

## Structure

```
src/app/                 Expo Router screens (file = route)
  (tabs)/                Home · Store · My Tickets · Me
  store/[venueId].tsx    Venue store: products, checkout
  venue/[id].tsx         Venue leaderboards (records, periods, friends)
  session/[id].tsx       Session result: your race, head-to-head, standings, lap-by-lap
  live/[id].tsx          Live view: karts moving on the track map, timing tower, session clock
  ticket/[id].tsx        Ticket pass (QR + code, sessions used) and transfer
  card.tsx               Full-screen member QR for check-in
  results, rewards, vouchers, my-racing, my-indemnity, receipts, waiver, friends, password, redeem, sign-in
src/components/          UI kit, LineChart (react-native-svg), LapBars, MemberCard (QR), race panels
src/lib/                 API client (token in Keychain/Keystore via expo-secure-store), auth, hooks, theme
  trackPath.ts           Samples a track outline so karts can be placed by "fraction of the lap"
  demo/                  Built-in demo backend and recorded data (EXPO_PUBLIC_DEMO=1)
```

## Building for the stores

Use EAS (`npx eas-cli@latest build --platform ios|android`), which needs an Expo account plus an Apple
Developer and Google Play account. Set `EXPO_PUBLIC_API_URL` to the production API. Bundle ID/package:
`com.pinnaclekarting.app` (change in `app.json` if needed). App icons and splash are still the Expo
placeholders and need replacing with real artwork.
