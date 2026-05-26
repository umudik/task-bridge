import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  resolveProjectForTask,
  refreshProjects,
  stripProjectTag,
} from "./projects.mjs";
import {
  WORKER_PREFIX,
  addComment,
  getComments,
  getTask,
  isWorkerComment,
  listAllOpenTasks,
  loadConfig,
  loadConfigAsync,
  updateTask,
} from "./vikunja-api.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const WORKER_DIR = join(ROOT, "worker");
const INBOX_PATH = join(WORKER_DIR, "cursor-inbox.json");
const STATE_PATH = join(WORKER_DIR, "state.json");

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

function log(message, extra) {
  const line = extra ? `${message} ${JSON.stringify(extra)}` : message;
  console.log(`[worker] ${line}`);
}

function stripWorkerPrefix(text) {
  return text.trimStart().replace(/^\[worker\]\s*/, "");
}

function isNoiseWorkerComment(text) {
  const stripped = stripWorkerPrefix(text);
  const lower = stripped.toLowerCase();
  return (
    lower.includes("alındı") ||
    lower.includes("calisiyorum") ||
    lower.includes("çalışıyorum") ||
    lower.includes("görev alındı") ||
    lower.includes("devam edeyim mi") ||
    lower.includes("anlaşıldı") ||
    lower.includes("anlasildi") ||
    lower.startsWith("plan:") ||
    /^tamamlandı:/i.test(stripped) ||
    /^done:/i.test(stripped)
  );
}

function hasWorkerResponse(comments) {
  return comments.some(
    (item) => isWorkerComment(item.comment) && !isNoiseWorkerComment(item.comment),
  );
}

async function readState() {
  try {
    const raw = await readFile(STATE_PATH, "utf8");
    return JSON.parse(raw);
  } catch {
    return { seen: {} };
  }
}

async function writeState(state) {
  await mkdir(WORKER_DIR, { recursive: true });
  await writeFile(STATE_PATH, JSON.stringify(state, null, 2));
}

async function writeInbox(items) {
  await mkdir(WORKER_DIR, { recursive: true });
  const payload = {
    updatedAt: new Date().toISOString(),
    hint: "Host agent picks these up via npm run agent",
    items,
  };
  await writeFile(INBOX_PATH, JSON.stringify(payload, null, 2));
  return payload;
}

function buildCursorPrompt(task, project) {
  const workspacePath = project.workspacePath;
  const description = stripProjectTag(task.description ?? "");
  return [
    `Workspace: ${workspacePath}`,
    `Project: ${project.name} (${project.id})`,
    `Vikunja task #${task.id}: ${task.title}`,
    description ? `Description: ${description}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function inboxItemForTask(task) {
  const project = resolveProjectForTask(task);
  if (!project) {
    log("skipped task without project", { id: task.id, title: task.title });
    return null;
  }
  return {
    taskId: task.id,
    projectId: project.id,
    projectName: project.name,
    workspacePath: project.workspacePath,
    title: task.title,
    description: stripProjectTag(task.description ?? ""),
    cursorPrompt: buildCursorPrompt(task, project),
  };
}

async function claimTask(config, task) {
  await updateTask(config, task.id, { done: false, percent_done: 0.5 });
  log("claimed", { id: task.id, title: task.title });
}

async function pollOnce(config, state) {
  await refreshProjects(true);
  const tasks = await listAllOpenTasks(config);
  const inbox = [];

  for (const task of tasks) {
    const comments = await getComments(config, task.id);
    const seenKey = `task:${task.id}`;

    if (!hasWorkerResponse(comments)) {
      if ((task.percent_done ?? 0) < 0.5) {
        await claimTask(config, task);
      }
      const item = inboxItemForTask(task);
      if (item) inbox.push(item);
    }

    state.seen[seenKey] = {
      claimed: true,
      hasResponse: hasWorkerResponse(comments),
    };
  }

  const payload = await writeInbox(inbox);
  await writeState(state);
  log("poll complete", {
    openTasks: tasks.length,
    cursorInbox: inbox.length,
  });
  return payload;
}

async function cmdList(config) {
  await refreshProjects();
  const tasks = await listAllOpenTasks(config);
  for (const task of tasks) {
    const comments = await getComments(config, task.id);
    const response = comments.find(
      (item) => isWorkerComment(item.comment) && !isNoiseWorkerComment(item.comment),
    );
    const project = resolveProjectForTask(task);
    console.log(
      `#${task.id} ${task.title} done=${task.done ?? false} project=${project?.id ?? "?"}`,
    );
    if (response) {
      console.log(`  response: ${stripWorkerPrefix(response.comment).slice(0, 120)}`);
    }
  }
  if (tasks.length === 0) console.log("No open tasks.");
}

async function cmdReply(config, taskId, message) {
  if (!taskId || !message) {
    throw new Error("Usage: worker:reply -- <taskId> \"message\"");
  }
  const task = await getTask(config, taskId);
  const body = message.startsWith(WORKER_PREFIX) ? message : `${WORKER_PREFIX} ${message}`;
  await addComment(config, taskId, body);
  await updateTask(config, taskId, { done: true, percent_done: 1 });
  log("response posted", { taskId, title: task.title });
}

async function cmdOnce(config) {
  const state = await readState();
  const payload = await pollOnce(config, state);
  console.log(JSON.stringify(payload, null, 2));
}

async function cmdWatch(initialConfig) {
  let config = initialConfig;
  log("watching", {
    baseUrl: config.baseUrl,
    projectIds: config.projectIds,
    pollMs: config.pollMs,
    inbox: INBOX_PATH,
  });
  while (true) {
    try {
      await refreshProjects(true);
      config = loadConfig();
      const state = await readState();
      await pollOnce(config, state);
    } catch (error) {
      log("poll error", { error: error.message });
    }
    await new Promise((resolve) => setTimeout(resolve, config.pollMs));
  }
}

async function main() {
  loadDotEnv();
  const config = await loadConfigAsync();
  const [command, arg1, ...rest] = process.argv.slice(2);
  const message = rest.join(" ").trim();

  switch (command) {
    case "list":
      await cmdList(config);
      break;
    case "reply":
      await cmdReply(config, Number(arg1), message);
      break;
    case "once":
      await cmdOnce(config);
      break;
    case "watch":
    default:
      await cmdWatch(config);
  }
}

main().catch((error) => {
  console.error(`[worker] ${error.message}`);
  process.exit(1);
});
