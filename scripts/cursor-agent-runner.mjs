import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getProjectById } from "./projects.mjs";
import {
  WORKER_PREFIX,
  addComment,
  loadConfigAsync,
  updateTask,
} from "./vikunja-api.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const WORKER_DIR = join(ROOT, "worker");
const INBOX_PATH = join(WORKER_DIR, "cursor-inbox.json");
const STATE_PATH = join(WORKER_DIR, "agent-state.json");

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
  console.log(`[cursor-agent] ${line}`);
}

function pollMs() {
  return Number(process.env.CURSOR_AGENT_POLL_MS ?? process.env.WORKER_POLL_MS ?? 10000);
}

function modelId() {
  return process.env.CURSOR_MODEL ?? "composer-2.5";
}

async function readState() {
  try {
    const raw = await readFile(STATE_PATH, "utf8");
    return JSON.parse(raw);
  } catch {
    return { tasks: {} };
  }
}

async function writeState(state) {
  await mkdir(WORKER_DIR, { recursive: true });
  await writeFile(STATE_PATH, JSON.stringify(state, null, 2));
}

async function readInbox() {
  try {
    const raw = await readFile(INBOX_PATH, "utf8");
    return JSON.parse(raw);
  } catch {
    return { items: [] };
  }
}

function resolveWorkspacePath(item) {
  if (item.workspacePath?.trim()) return item.workspacePath.trim();
  if (item.projectId) {
    const project = getProjectById(item.projectId);
    if (project?.workspacePath) return project.workspacePath;
  }
  const configured = process.env.WORKER_REPO_PATH?.trim();
  if (configured) return configured;
  return ROOT;
}

function buildPrompt(item) {
  return [
    "You are Task Bridge. A mobile user sent a voice request.",
    "Do the work in this repo if needed, then reply with a short plain-language answer for the user.",
    "Use Turkish if the request is Turkish. No markdown headers. No Tamamlandı prefix.",
    "",
    item.projectName ? `Project: ${item.projectName}` : "",
    `Task #${item.taskId}: ${item.title}`,
    item.description ? `Details: ${item.description}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function extractAnswer(result) {
  if (typeof result.result === "string") return result.result.trim();
  if (result.result && typeof result.result === "object") {
    const text = result.result.text ?? result.result.content;
    if (typeof text === "string") return text.trim();
  }
  return String(result.result ?? "").trim();
}

async function runLocalAgent(item) {
  const apiKey = process.env.CURSOR_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("CURSOR_API_KEY is not set");
  }

  const cwd = resolveWorkspacePath(item);
  if (!existsSync(cwd)) {
    throw new Error(`Project folder does not exist: ${cwd}`);
  }

  const { Agent, CursorAgentError } = await import("@cursor/sdk");
  const prompt = buildPrompt(item);

  log("starting local agent", {
    taskId: item.taskId,
    projectId: item.projectId,
    cwd,
    model: modelId(),
  });

  try {
    const result = await Agent.prompt(prompt, {
      apiKey,
      model: { id: modelId() },
      local: { cwd, settingSources: [] },
    });

    if (result.status === "error") {
      throw new Error(`Agent run failed (${result.id ?? "unknown"})`);
    }

    const answer = extractAnswer(result);
    if (!answer) {
      throw new Error("Agent returned empty answer");
    }

    log("agent finished", { taskId: item.taskId, runId: result.id, chars: answer.length });
    return answer;
  } catch (err) {
    if (CursorAgentError && err instanceof CursorAgentError) {
      throw new Error(`Agent startup failed: ${err.message}`);
    }
    throw err;
  }
}

async function postReply(config, taskId, message) {
  const body = message.startsWith(WORKER_PREFIX) ? message : `${WORKER_PREFIX} ${message}`;
  await addComment(config, taskId, body);
  await updateTask(config, taskId, { done: true, percent_done: 1 });
  log("reply posted", { taskId });
}

async function processOnce(config, state) {
  if (process.env.WORKER_CURSOR_AGENT === "false") {
    log("disabled", { hint: "Set WORKER_CURSOR_AGENT=true in .env" });
    return state;
  }

  if (!process.env.CURSOR_API_KEY?.trim()) {
    log("skipped", { reason: "CURSOR_API_KEY missing" });
    return state;
  }

  const inbox = await readInbox();
  const items = Array.isArray(inbox.items) ? inbox.items : [];

  for (const item of items) {
    const taskId = item.taskId;
    if (!taskId) continue;

    const entry = state.tasks[String(taskId)] ?? {};
    if (entry.status === "done" || entry.status === "running") continue;

    state.tasks[String(taskId)] = {
      status: "running",
      startedAt: new Date().toISOString(),
    };
    await writeState(state);

    try {
      const answer = await runLocalAgent(item);
      await postReply(config, taskId, answer);
      state.tasks[String(taskId)] = {
        status: "done",
        finishedAt: new Date().toISOString(),
      };
    } catch (error) {
      state.tasks[String(taskId)] = {
        status: "failed",
        error: error.message,
        failedAt: new Date().toISOString(),
      };
      log("task failed", { taskId, error: error.message });
    }

    await writeState(state);
  }

  return state;
}

async function cmdWatch(config) {
  log("watching local cursor agent", {
    inbox: INBOX_PATH,
    model: modelId(),
    pollMs: pollMs(),
  });

  let state = await readState();

  while (true) {
    try {
      state = await processOnce(config, state);
    } catch (error) {
      log("poll error", { error: error.message });
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs()));
  }
}

async function cmdOnce(config) {
  const state = await readState();
  await processOnce(config, state);
}

async function main() {
  loadDotEnv();
  const config = await loadConfigAsync();
  const [command] = process.argv.slice(2);

  switch (command) {
    case "once":
      await cmdOnce(config);
      break;
    case "watch":
    default:
      await cmdWatch(config);
  }
}

main().catch((error) => {
  console.error(`[cursor-agent] ${error.message}`);
  process.exit(1);
});
