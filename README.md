# task-bridge

Mobil + web UI + backend task manager.

## API docs (GitHub Pages)

Static reference: [docs/index.html](docs/index.html) — same Tailwind/shadcn design tokens as the web app.

```powershell
npm run build:docs
```

Open `docs/index.html` locally after building (or run `npm run dev` in `docs/` for CSS watch).

To publish: **Settings → Pages → Build and deployment → GitHub Actions**; pushes to `main`/`master` run [Deploy API docs](.github/workflows/pages.yml).

Live URL (after Pages is enabled): `https://umudik.github.io/task-bridge/`

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
npm run docker:publish:all
# veya: node scripts/docker-publish.mjs 0.1.0 0.1.0 --mobile
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

### Docker image içinden (önerilen)

```powershell
npm run docker:mobile:build
npm run docker:up:d
```

Web UI → **Mobile** → **Download APK** → telefona kur → QR tara.

Tek seferde Hub'a API+UI+APK:

```powershell
npm run docker:publish:all
```

### Android Studio

`apps/mobile` → Run (emulator için varsayılan port `3000`)

## Projeler

Web UI → **Projects** → yeni proje oluştur (name, id, repo path). Veriler SQLite'ta tutulur.

## Android Studio

`apps/mobile` → Run

## License

MIT
