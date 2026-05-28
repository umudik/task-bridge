import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadProjects } from "./projects.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

function loadDotEnv() {
  const path = join(ROOT, ".env");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!(key in process.env)) process.env[key] = val;
  }
}

function backendConfig() {
  return {
    url: (process.env.BACKEND_URL ?? "http://localhost:3001").replace(/\/$/, ""),
    apiKey: process.env.BACKEND_API_KEY ?? "dev-key",
  };
}

async function backendFetch(path, options = {}) {
  const { url, apiKey } = backendConfig();
  const response = await fetch(`${url}${path}`, {
    ...options,
    headers: {
      Accept: "application/json",
      "X-Api-Key": apiKey,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers ?? {}),
    },
  });
  const raw = await response.text();
  if (!response.ok) {
    const error = new Error(`Backend ${response.status} ${path}: ${raw}`);
    error.status = response.status;
    throw error;
  }
  return raw ? JSON.parse(raw) : null;
}

function parseFlags(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const eq = arg.indexOf("=");
      if (eq !== -1) {
        flags[arg.slice(2, eq)] = arg.slice(eq + 1);
      } else if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) {
        flags[arg.slice(2)] = argv[++i];
      } else {
        flags[arg.slice(2)] = "true";
      }
    } else {
      positional.push(arg);
    }
  }
  return { flags, positional };
}

function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

function resolveProjectId(flags) {
  return (
    flags.project?.trim() ||
    process.env.BRIDGE_PROJECT_ID?.trim() ||
    loadProjects()[0]?.id ||
    null
  );
}

function usage() {
  console.error(`Usage:
  npm run tb -- projects list
  npm run tb -- tasks list
  npm run tb -- tasks get <id>
  npm run tb -- tasks claim [--by <name>] [--project <id>]
  npm run tb -- tasks claim <id> [--by <name>]
  npm run tb -- tasks create "<text>" [--project <id>] [--title <title>] [--description <text>]
  npm run tb -- inbox list
  npm run tb -- inbox show <id>
  npm run tb -- tasks comment <id> "<text>"`);
}

async function cmdProjectsList() {
  const data = await backendFetch("/projects");
  printJson(data.projects ?? data);
}

async function cmdTasksList() {
  const data = await backendFetch("/tasks");
  printJson(data.items ?? data);
}

async function cmdTasksGet(taskId) {
  if (!taskId) throw new Error("Usage: tb tasks get <id>");
  const data = await backendFetch(`/answers/${taskId}`);
  printJson(data);
}

async function cmdTasksCreate(flags, positional) {
  const text = positional.join(" ").trim();
  if (!text) throw new Error('Usage: tb tasks create "<text>" [--project <id>]');
  const projectId = resolveProjectId(flags);
  if (!projectId) throw new Error("No project. Set projects.json or BRIDGE_PROJECT_ID.");

  const body = { text, projectId };
  if (flags.title) body.title = flags.title;
  if (flags.description) body.description = flags.description;

  const task = await backendFetch("/tasks", {
    method: "POST",
    body: JSON.stringify(body),
  });
  printJson(task);
}

async function cmdInboxList() {
  const data = await backendFetch("/inbox");
  printJson(data.items ?? data);
}

async function cmdInboxShow(taskId) {
  if (!taskId) throw new Error("Usage: tb inbox show <id>");
  const data = await backendFetch(`/answers/${taskId}`);
  printJson(data);
}

async function cmdTasksClaim(flags, positional) {
  const claimedBy = flags.by?.trim() || "cli";
  const taskId = positional[0]?.trim();

  if (taskId) {
    const task = await backendFetch(`/tasks/${taskId}/claim`, {
      method: "POST",
      body: JSON.stringify({ claimedBy }),
    });
    printJson(task);
    return;
  }

  const projectId = resolveProjectId(flags);
  const body = { claimedBy };
  if (projectId) body.projectId = projectId;

  try {
    const task = await backendFetch("/worker/claim-next", {
      method: "POST",
      body: JSON.stringify(body),
    });
    printJson(task);
  } catch (error) {
    if (error.status === 404) {
      console.log("No tasks available");
      return;
    }
    throw error;
  }
}

async function cmdTasksComment(taskId, positional) {
  if (!taskId) throw new Error("Usage: tb tasks comment <id> \"<text>\"");
  const text = positional.join(" ").trim();
  if (!text) throw new Error("Comment text is required");
  const data = await backendFetch(`/tasks/${taskId}/comments`, {
    method: "POST",
    body: JSON.stringify({ text, by: "cli" }),
  });
  printJson(data);
}

async function main() {
  loadDotEnv();
  const [group, command, ...rest] = process.argv.slice(2);
  if (!group || group === "help" || group === "--help" || group === "-h") {
    usage();
    process.exit(group ? 0 : 1);
  }

  const { flags, positional } = parseFlags(rest);

  switch (`${group}:${command}`) {
    case "projects:list":
      await cmdProjectsList();
      break;
    case "tasks:list":
      await cmdTasksList();
      break;
    case "tasks:get":
      await cmdTasksGet(positional[0]);
      break;
    case "tasks:claim":
      await cmdTasksClaim(flags, positional);
      break;
    case "tasks:create":
      await cmdTasksCreate(flags, positional);
      break;
    case "tasks:comment":
      await cmdTasksComment(positional[0], positional.slice(1));
      break;
    case "inbox:list":
      await cmdInboxList();
      break;
    case "inbox:show":
      await cmdInboxShow(positional[0]);
      break;
    default:
      usage();
      process.exit(1);
  }
}

main().catch((error) => {
  console.error(`[tb] ${error.message}`);
  process.exit(1);
});
