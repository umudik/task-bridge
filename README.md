# task-bridge

Mobil + web UI + backend task manager.

## Dev (watch mode)

```powershell
copy .env.example .env
npm install
npm run dev
```

Backend (`tsx watch`) + web (`vite` HMR) aynı anda açılır. Docker image build yok.

| Servis | URL |
|--------|-----|
| Web UI | http://localhost:5173/app/login |
| API | http://localhost:3000 |
| Ngrok panel | http://localhost:4040 |

Ngrok container Ctrl+C sonrası da ayakta kalır (mobil QR için). Sadece local:

```powershell
npm run dev:local
```

Ngrok’u ayrı kapatmak için: `npm run dev:ngrok:down`

## Docker (prod-like)

```powershell
copy .env.example .env
npm run docker:up:d
```

`.env`:

```env
NGROK_AUTHTOKEN=ngrok_...
BACKEND_API_KEY=dev-key
```

| Servis | URL |
|--------|-----|
| Backend + Web UI | http://localhost:3001/app/login |
| Ngrok panel | http://localhost:4040 |

## Mobil

1. Web UI → proje seç → **Mobile** → QR
2. Mobilde QR tara
3. Task oluştur

## Projeler

Web UI → **Projects** → yeni proje oluştur (name, id, repo path). Veriler SQLite'ta tutulur.

## Android Studio

`apps/mobile` → Run

## License

MIT
