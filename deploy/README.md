# Task Bridge — Docker Hub deploy

Tek container: API + Web UI aynı portta.

## Hızlı başlangıç (herhangi bir projede)

```bash
mkdir task-bridge && cd task-bridge
curl -O https://raw.githubusercontent.com/YOUR_ORG/task-bridge/main/deploy/docker-compose.yml
curl -O https://raw.githubusercontent.com/YOUR_ORG/task-bridge/main/deploy/.env.example
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
