import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  getProjectById,
  loadProjects,
  refreshProjects,
  stripProjectTag,
} from "./projects.mjs";
import {
  getTask,
  listProjectTasks,
  loadConfigAsync,
  updateTask,
} from "./vikunja-api.mjs";

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
    throw new Error(`Backend ${response.status} ${path}: ${raw}`);
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

function flattenTask(task, project) {
  return {
    id: task.id,
    title: task.title,
    description: stripProjectTag(task.description ?? ""),
    done: task.done ?? false,
    percentDone: task.percent_done ?? 0,
    projectId: project?.id ?? null,
    projectName: project?.name ?? null,
    vikunjaProjectId: task.project_id ?? project?.vikunjaProjectId ?? null,
    createdAt: task.created ?? null,
    updatedAt: task.updated ?? null,
  };
}

function usage() {
  console.error(`Usage:
  npm run tb -- projects list
  npm run tb -- tasks list [--project <id>] [--filter "done = false"]
  npm run tb -- tasks get <id>
  npm run tb -- tasks create "<text>" [--project <id>] [--title <title>] [--description <text>]
  npm run tb -- tasks update <id> [--title <title>] [--description <text>] [--done true|false]
  npm run tb -- inbox list
  npm run tb -- inbox show <id>`);
}

async function cmdProjectsList() {
  const data = await backendFetch("/projects");
  printJson(data.projects ?? data);
}

async function cmdTasksList(flags) {
  await refreshProjects(true);
  const config = await loadConfigAsync();
  const projectId = resolveProjectId(flags);
  const filter = flags.filter ?? "done = false";
  const perPage = Number(flags["per-page"] ?? flags.perPage ?? 50);

  if (projectId) {
    const project = getProjectById(projectId);
    if (!project) throw new Error(`Unknown project: ${projectId}`);
    const tasks = await listProjectTasks(config, project.vikunjaProjectId, {
      filter,
      perPage,
    });
    printJson(tasks.map((task) => flattenTask(task, project)));
    return;
  }

  const items = [];
  for (const project of loadProjects()) {
    const tasks = await listProjectTasks(config, project.vikunjaProjectId, {
      filter,
      perPage,
    });
    for (const task of tasks) items.push(flattenTask(task, project));
  }
  items.sort((a, b) => b.id - a.id);
  printJson(items);
}

async function cmdTasksGet(taskId) {
  if (!taskId) throw new Error("Usage: tb tasks get <id>");
  const config = await loadConfigAsync();
  await refreshProjects(true);
  const task = await getTask(config, Number(taskId));
  const project =
    loadProjects().find((item) => item.vikunjaProjectId === Number(task.project_id)) ??
    null;
  printJson(flattenTask(task, project));
}

async function cmdTasksCreate(flags, positional) {
  const text = positional.join(" ").trim();
  if (!text) throw new Error('Usage: tb tasks create "<text>" [--project <id>]');
  const projectId = resolveProjectId(flags);
  if (!projectId) throw new Error("No project. Set BRIDGE_PROJECT_ID or use --project.");

  const body = { text, projectId };
  if (flags.title) body.title = flags.title;
  if (flags.description) body.description = flags.description;

  const task = await backendFetch("/tasks", {
    method: "POST",
    body: JSON.stringify(body),
  });
  printJson(task);
}

async function cmdTasksUpdate(taskId, flags) {
  if (!taskId) throw new Error("Usage: tb tasks update <id> [--title ...] [--description ...] [--done true|false]");
  const config = await loadConfigAsync();
  const patch = {};
  if (flags.title !== undefined) patch.title = flags.title;
  if (flags.description !== undefined) patch.description = flags.description;
  if (flags.done !== undefined) {
    const done = flags.done === "true" || flags.done === "1";
    patch.done = done;
    patch.percent_done = done ? 1 : 0;
  }
  if (Object.keys(patch).length === 0) {
    throw new Error("Provide at least one of --title, --description, --done");
  }
  const task = await updateTask(config, Number(taskId), patch);
  await refreshProjects(true);
  const project =
    loadProjects().find((item) => item.vikunjaProjectId === Number(task.project_id)) ??
    null;
  printJson(flattenTask(task, project));
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
      await cmdTasksList(flags);
      break;
    case "tasks:get":
      await cmdTasksGet(positional[0]);
      break;
    case "tasks:create":
      await cmdTasksCreate(flags, positional);
      break;
    case "tasks:update":
      await cmdTasksUpdate(positional[0], flags);
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
