# Pinnacle Karting

A mobile-first web app for an indoor go-kart venue: book race sessions, watch live timing, climb the leaderboards and track your race history.

## Features

- **Book** – pick a session (Arrive & Drive, Grand Prix, Junior Cadet, Team Endurance), track, date, time slot (with live spots left) and number of drivers. Confirmation shows a booking reference and check-in code.
- **Live timing** – a simulated 10-lap race with a moving track map, positions, last/best laps (fastest lap in purple) and gaps to the leader. Play at 1×, 5× or 20×. Your result is saved to your profile.
- **Leaderboards** – best laps per track for today, this month and all time, including your own best.
- **Driver profile** – details, loyalty credits and tier, upcoming bookings (with cancel), race history with per-lap charts.

Data is stored in the browser (`localStorage`); there is no backend yet.

## Development

```bash
npm install
npm run dev       # start dev server
npm run build     # typecheck + production build into dist/
npm run preview   # serve the production build
```

Built with React 19, React Router 7, TypeScript and Vite. The build uses relative paths and hash routing, so `dist/` can be hosted on any static host (GitHub Pages, Netlify, etc.).
