# task-bridge

Epic ve task yönetimi için tek backend, web paneli ve Android uygulaması.

Projeler workflow stage’leri üzerinden ilerler; mobil veya web’den task açılır, yorumlar inbox’a düşer, worker kuyruğu otomasyon/agent tarafından tüketilir.

## Repo

| Dizin | Ne |
|-------|-----|
| `apps/backend` | Fastify API, SQLite, worker queue |
| `apps/web` | React dashboard (Vite) |
| `apps/mobile` | Android (Kotlin + Compose) |
| `apps/mcp` | MCP server for AI agents |

## Geliştirme

```powershell
copy .env.example .env
npm install
npm run dev
```

| Servis | URL |
|--------|-----|
| Web UI | http://localhost:5173/app/login |
| API | http://localhost:3000 |

İlk kurulumda web’den `/setup` ile admin oluştur, sonra `/app/login`.

## API (agent / otomasyon)

OpenAPI 3.1 spec backend’de yaşar ve çalışan sunucudan JSON olarak okunur:

```
GET /api/docs
```

Kaynak: `apps/backend/src/openapi.ts`

## MCP (AI agents)

Cursor / Claude Desktop → [apps/mcp/README.md](apps/mcp/README.md)

Stdio MCP server; Task Bridge API’yi tool olarak sunar. `.cursor/mcp.json` örneği repoda.

## Deploy & mobil

Production Docker, Hub publish ve sunucu kurulumu → [deploy/README.md](deploy/README.md)

Web UI detayları → [apps/web/README.md](apps/web/README.md)

Android → [apps/mobile/README.md](apps/mobile/README.md)

## License

MIT
