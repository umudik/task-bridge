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

## Docker (tek container — API + UI)

```powershell
copy .env.example .env
npm run docker:up:d
```

`.env`:

```env
BACKEND_API_KEY=dev-key
TASK_BRIDGE_PORT=3000
```

| Servis | URL |
|--------|-----|
| API + Web UI | http://localhost:3000/app/login |
| Ngrok panel | http://localhost:4040 (opsiyonel) |

Mobil QR / dış erişim için ngrok:

```powershell
npm run docker:up:ngrok
```

## Docker Hub

Image build + push:

```powershell
# .env içine DOCKER_USER=your-dockerhub-user ekle
npm run docker:publish
# veya belirli tag: node scripts/docker-publish.mjs 0.1.0
```

Başka bir projede sadece pull ile çalıştır:

```powershell
cd deploy
copy .env.example .env
# TASK_BRIDGE_IMAGE ve BACKEND_API_KEY düzenle
docker compose pull
docker compose up -d
```

Detay: [deploy/README.md](deploy/README.md)

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
