# Pinnacle Karting: driver app (iOS & Android)

Expo SDK 58 / React Native 0.88 app for customers, in a RUD Super App style: check in with a QR
member card, follow live timing, see your results and progress, buy and manage tickets, sign the waiver,
collect reward tokens and compare lap times with friends. It talks to the timing API in `../server`.

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

## Checks

```bash
npm run typecheck                                     # TypeScript, strict
npx expo export --platform android --platform ios    # proves both native bundles compile
npx expo-doctor                                       # dependency/config health (needs internet)
```

## Structure

```
src/app/                 Expo Router screens (file = route)
  (tabs)/                Home · Race · Tickets · Rewards · Me
  session/[id].tsx       Session result: your race, head-to-head, standings, lap-by-lap
  ticket/[id].tsx        Ticket pass (QR + code) and transfer
  card.tsx               Full-screen member card for check-in
  shop.tsx, receipts.tsx, waiver.tsx, friends.tsx, sign-in.tsx
src/components/          UI kit, LineChart (react-native-svg), LapBars, MemberCard (QR), race panels
src/lib/                 API client (token in Keychain/Keystore via expo-secure-store), auth, hooks, theme
```

## Building for the stores

Use EAS (`npx eas-cli@latest build --platform ios|android`), which needs an Expo account plus an Apple
Developer and Google Play account. Set `EXPO_PUBLIC_API_URL` to the production API. Bundle ID/package:
`com.pinnaclekarting.app` (change in `app.json` if needed). App icons and splash are still the Expo
placeholders and need replacing with real artwork.
