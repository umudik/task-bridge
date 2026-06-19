# task-bridge

Mobil + web UI + backend task manager.

## API docs (GitHub Pages)

Static reference: [docs/index.html](docs/index.html) — same Tailwind/shadcn design tokens as the web app.

```powershell
npm --prefix docs run build
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

## Docker (tek container — API + UI)

```powershell
copy .env.example .env
npm run docker:up
```

İlk açılışta `/setup` ile admin hesabı oluştur, sonra `/app/login` ile giriş yap.

| Servis | URL |
|--------|-----|
| API + Web UI | http://localhost:3000/app/login |

## Docker Hub

Image build + push:

```powershell
# .env içine DOCKER_USER=your-dockerhub-user ekle
npm run docker:publish
npm run docker:publish -- --mobile
# veya: node scripts/docker-publish.mjs 0.1.0 0.1.0 --mobile
```

Başka bir projede sadece pull ile çalıştır:

```powershell
cd deploy
copy .env.example .env
# TASK_BRIDGE_IMAGE düzenle
docker compose pull
docker compose up -d
```

Detay: [deploy/README.md](deploy/README.md)

## Mobil

### Docker image içinden (önerilen)

```powershell
npm run mobile:build
npm run docker:up
```

Web UI → **Mobile** → **Download APK** → telefona kur → QR tara.

Tek seferde Hub'a API+UI+APK:

```powershell
npm run docker:publish -- --mobile
```

### Android Studio

`apps/mobile` → Run (emulator için varsayılan port `3000`)

## Projeler

Web UI → **Projects** → yeni proje oluştur (name, id, repo path). Veriler SQLite'ta tutulur.

## Android Studio

`apps/mobile` → Run

## License

MIT
