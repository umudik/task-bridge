# task-bridge

Mobil → backend → Vikunja.

## Docker

```powershell
cp .env.example .env
```

`.env` — sadece secret'lar:

```env
NGROK_AUTHTOKEN=ngrok_...
VIKUNJA_API_TOKEN=...
VIKUNJA_PROJECT_ID=1
BACKEND_API_KEY=dev-key
```

```powershell
npm run docker:up
```

QR sayfası otomatik açılır. Arka planda çalıştırmak için: `npm run docker:up:d`

| Servis | URL |
|--------|-----|
| Vikunja UI | http://localhost:3456 |
| Backend | http://localhost:3001 |
| QR sayfası | http://localhost:3001/setup |
| Ngrok panel | http://localhost:4040 |

URL'ler `.env`'de yok — ngrok ne verirse QR onu kullanır.

## Mobil bağlantı (QR)

1. http://localhost:3001/setup aç → QR (ngrok HTTPS URL)
2. Mobilde **Scan QR** → bağlan
3. **Push to Talk** → konuş → Vikunja'da task

## Vikunja (ilk sefer)

1. http://localhost:3456 → hesap + proje
2. Settings → API token → `.env`'e yaz
3. `docker compose up -d backend`

## Projeler

Mobil uygulama projeleri Vikunja'dan otomatik okur. Vikunja'da yeni proje oluşturduğunda mobilde yenilemen yeterli.

İsteğe bağlı: farklı repolar için `projects.json` ile sadece `repoPath` eşlemesi yapabilirsin. Proje listesi için gerekli değil.

1. Vikunja'da proje oluştur
2. `.env` içinde `WORKER_REPO_PATH` ile varsayılan repo klasörünü ayarla
3. Mobilde Ayarlar → proje seç → konuş
4. Gönderirken mobil otomatik `projectId` gönderir

## Mobil

Android Studio → `apps/mobile` → Run

## License

MIT
