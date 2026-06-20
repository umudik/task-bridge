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

Image adı: `your-dockerhub-user/task-bridge`

### 1) Docker Hub hazırlığı

1. [hub.docker.com](https://hub.docker.com) hesabı aç
2. **Account Settings → Security → New Access Token** (Read & Write)
3. Token'ı kaydet (bir daha gösterilmez)

### 2) GitHub Actions (otomatik publish)

**Settings → Secrets and variables → Actions**

| Tür | Ad | Değer |
|-----|-----|--------|
| **Variable** | `DOCKERHUB_USERNAME` | Docker Hub kullanıcı adın |
| **Secret** | `DOCKERHUB_ACCESS_TOKEN` | Access token (Read & Write) |

Workflow: [.github/workflows/docker-publish.yml](.github/workflows/docker-publish.yml)

| Tetikleyici | Ne olur |
|-------------|---------|
| `main` push | Test → build → push `latest` + `YYYYMMDD-<sha>` |
| Tag `v1.2.3` | Test → build → push `1.2.3`, `1.2`, `latest` |
| **Actions → Docker Hub Publish → Run workflow** | Manuel sürüm / APK seçeneği |

Manuel çalıştırırken **include mobile** işaretlenirse Android APK image içine gömülür (build süresi uzar).

Durumu kontrol: **Actions** sekmesi → run summary'de `docker pull …` satırı.

### 3) Lokal publish

```powershell
copy .env.example .env
# .env:
# DOCKERHUB_USERNAME=your-dockerhub-user
# DOCKERHUB_ACCESS_TOKEN=your-access-token

npm run docker:publish
npm run docker:publish:mobile
# özel tag: node scripts/docker-publish.mjs 1.2.3 1.2.3
# APK ile:   node scripts/docker-publish.mjs 1.2.3 1.2.3 --mobile
```

`DOCKERHUB_ACCESS_TOKEN` yoksa önce `docker login -u your-dockerhub-user` yapman yeterli.

Lokal build tek mimari (`linux/amd64` veya host). CI multi-arch (`amd64` + `arm64`) push eder.

### 4) Başka makinede çalıştır

```powershell
cd deploy
copy .env.example .env
# TASK_BRIDGE_IMAGE=your-dockerhub-user/task-bridge:latest

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
npm run docker:publish:mobile
```

### Android Studio

`apps/mobile` → Run (emulator için varsayılan port `3000`)

## Projeler

Web UI → **Projects** → yeni proje oluştur (name, id, repo path). Veriler SQLite'ta tutulur.

## Android Studio

`apps/mobile` → Run

## License

MIT
