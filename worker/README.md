# Vikunja worker

Polls Vikunja and writes pending tasks to `cursor-inbox.json`.

Host-side `npm run agent` reads that file and runs the local Cursor agent.

## Commands

| Command | What |
|---------|------|
| `npm run worker` | Poll loop (docker uses this) |
| `npm run worker:once` | Single poll |
| `npm run worker:list` | Open tasks in terminal |
| `npm run worker:reply -- 42 "message"` | Manual Vikunja reply fallback |
| `npm run agent` | Local Cursor agent watch (host only) |

## Env

```env
WORKER_REPO_PATH=C:\Users\seyit\OneDrive\Documents\GitHub\task-bridge
WORKER_CURSOR_AGENT=true
CURSOR_API_KEY=cursor_...
```
