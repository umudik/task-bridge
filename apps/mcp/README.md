# Task Bridge MCP

MCP server that exposes the Task Bridge REST API as tools for AI agents (Cursor, Claude Desktop, custom clients).

## Setup

1. Start Task Bridge (`npm run dev` from repo root).
2. Log in via web UI and copy your bearer token (browser devtools → localStorage session, or admin user token endpoint).
3. Set env:

```powershell
$env:TASK_BRIDGE_URL = "http://localhost:3000"
$env:TASK_BRIDGE_TOKEN = "your-bearer-token"
```

## Cursor

Copy `.cursor/mcp.json` and replace `TASK_BRIDGE_TOKEN`. Restart Cursor or reload MCP.

Production build:

```json
{
  "mcpServers": {
    "task-bridge": {
      "command": "node",
      "args": ["apps/mcp/dist/index.js"],
      "env": {
        "TASK_BRIDGE_URL": "http://localhost:3000",
        "TASK_BRIDGE_TOKEN": "your-bearer-token"
      }
    }
  }
}
```

Run `npm --prefix apps/mcp run build` first.

## Tools

| Tool | Purpose |
|------|---------|
| `get_me` | Current user |
| `list_projects` / `create_project` | Projects |
| `get_workflow` / `export_workflow` / `list_project_members` | Workflow |
| `create_epic` / `create_task` / `list_tasks` / `get_task` | Tasks |
| `add_comment` / `update_task_description` / `update_work_status` | Task updates |
| `claim_task` / `unclaim_task` / `list_worker_pending` / `claim_next_task` | Worker queue |
| `list_inbox` | Inbox feed |
| `list_workflow_templates` / `get_workflow_template` | Templates |

## Resources

| URI | Content |
|-----|---------|
| `task-bridge://openapi` | OpenAPI 3.1 JSON |
| `task-bridge://health` | Server health |

## Dev

```powershell
npm --prefix apps/mcp install
npm --prefix apps/mcp run dev
```

Server speaks MCP over stdio (no HTTP port).

## Test client

```powershell
npm --prefix apps/mcp run client -- list-tools
npm --prefix apps/mcp run client -- call list_projects {}
npm --prefix apps/mcp run client -- read-resource task-bridge://openapi
```

## Raw API

Same backend as HTTP: `GET /api/docs` for OpenAPI without MCP.
