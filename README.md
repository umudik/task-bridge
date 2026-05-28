# task-bridge

Mobil → backend → Cursor agent (yerel shell).

## Docker

```powershell
copy .env.example .env
copy projects.json.example projects.json
```

`.env` — secret'lar:

```env
NGROK_AUTHTOKEN=ngrok_...
BACKEND_API_KEY=dev-key
CURSOR_API_KEY=crsr_...
WORKER_REPO_PATH=C:\path\to\repo
```

```powershell
npm run docker:up
```

QR sayfası otomatik açılır. Arka planda: `npm run docker:up:d`

| Servis | URL |
|--------|-----|
| Backend | http://localhost:3001 |
| QR sayfası | http://localhost:3001/setup |
| Ngrok panel | http://localhost:4040 |

## Cursor agent (host)

Docker stack çalışırken, **ayrı terminalde** repo kökünde:

```powershell
npm run agent
```

Mobil task → `worker/cursor-inbox.json` → Cursor SDK yerel repoda çalışır → cevap backend'e yazılır.

## Mobil

1. http://localhost:3001/setup → QR
2. Mobilde **Scan QR**
3. **Push to Talk** → task oluşur

## Projeler

`projects.json` — proje listesi ve repo klasörleri:

```json
{
  "projects": [
    { "id": "my-app", "name": "My App", "repoPath": "C:\\dev\\my-app" }
  ]
}
```

`WORKER_REPO_PATH` tek proje için varsayılan klasör (dosya yoksa `default` projesi).

## CLI

```powershell
npm run task:add -- "fix login bug"
npm run tb -- inbox list
npm run tb -- inbox show 1
```

## Android Studio

`apps/mobile` → Run

## License

MIT
