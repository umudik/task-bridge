# Task Bridge — Docker Hub deploy

Tek container: API + Web UI aynı portta.

## Hızlı başlangıç (herhangi bir projede)

```bash
mkdir task-bridge && cd task-bridge
curl -O https://raw.githubusercontent.com/umudik/task-bridge/main/deploy/docker-compose.yml
curl -O https://raw.githubusercontent.com/umudik/task-bridge/main/deploy/.env.example
cp .env.example .env
```

`.env` dosyasını düzenle:

```env
TASK_BRIDGE_IMAGE=your-dockerhub-user/task-bridge:latest
TASK_BRIDGE_PORT=3000
```

Çalıştır:

```bash
docker compose pull
docker compose up -d
```

Aç: **http://localhost:3000/app/login**

İlk açılışta web arayüzünden `/setup` ile admin hesabı oluştur.

## Image publish (repo sahibi)

### GitHub Actions

1. Docker Hub → **Account Settings → Security → New Access Token** (Read & Write)
2. GitHub repo:
   - **Variable:** `DOCKERHUB_USERNAME` = Docker Hub kullanıcı adın
   - **Secret:** `DOCKER_HUB_SECRET_KEY` = access token
3. `main` push veya tag `v1.2.3` push → otomatik publish
4. İsteğe bağlı: Actions → **Docker Hub Publish** → Run workflow

### Lokal

```bash
# .env
# DOCKERHUB_USERNAME=YOUR_USER
# DOCKER_HUB_SECRET_KEY=your-token

npm run docker:publish
npm run docker:publish:mobile
```

## Android APK

Image APK içeriyorsa:

- Web: **Mobile** sayfası → **Download APK**
- Direkt: **http://localhost:3000/downloads/task-bridge.apk**

APK yoksa image sadece API+UI içerir; mobil build için repodaki `npm run mobile:build` gerekir.

## Veri

SQLite veritabanı `task_bridge_data` volume'ünde kalır. Silmek için:

```bash
docker compose down -v
```

## Güncelleme

```bash
docker compose pull
docker compose up -d
```
