# Task Bridge Web

Browser dashboard (shadcn/ui + React) — mobile-like flow without voice.

## URLs

| URL | Purpose |
|-----|---------|
| `/app/login` | Web sign-in (API key) |
| `/app/projects` | Project picker |
| `/app/home` | Send text tasks |
| `/app/inbox` | Answers |
| `/app/mobile` | Mobile QR pairing |

## Dev

```bash
npm install
npm run dev
```

Open http://localhost:5173/app/login — backend on http://localhost:3001

## Docker

Rebuild backend image (includes web build):

```bash
npm run docker:up
```

Open http://localhost:3001/app/login
