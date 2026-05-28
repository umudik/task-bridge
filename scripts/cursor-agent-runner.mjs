import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getProjectById } from "./projects.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const WORKER_DIR = join(ROOT, "worker");
const INBOX_PATH = join(WORKER_DIR, "cursor-inbox.json");
const STATE_PATH = join(WORKER_DIR, "agent-state.json");

let shuttingDown = false;
let activeSession = null;
let activeClaim = null;

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

async function syncInboxFromBackend() {
  try {
    const data = await backendFetch("/worker/pending");
    const remoteItems = Array.isArray(data?.items) ? data.items.filter((item) => item?.taskId) : [];
    await writeInbox({ items: remoteItems });
    if (remoteItems.length > 0) {
      log("synced pending from backend", { count: remoteItems.length });
    }
  } catch (error) {
    log("backend sync failed", { error: error.message });
  }
}

async function writeInbox(inbox) {
  await mkdir(WORKER_DIR, { recursive: true });
  await writeFile(
    INBOX_PATH,
    `${JSON.stringify(
      {
        updatedAt: new Date().toISOString(),
        hint: "Host agent: npm run agent",
        items: Array.isArray(inbox.items) ? inbox.items : [],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

async function removeInboxItem(taskId) {
  const inbox = await readInbox();
  const items = Array.isArray(inbox.items) ? inbox.items : [];
  const next = items.filter((item) => item.taskId !== taskId);
  if (next.length === items.length) return;
  await writeInbox({ items: next });
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
  const lines = [
    "You are Task Bridge AI worker.",
    "Do required repo work when needed.",
    "Use Turkish when the user writes in Turkish.",
    "",
    "Separate layers strictly:",
    "- task.title is fixed; never repeat it inside description",
    "- task.description = canonical contract (stable markdown, no title line); include # Acceptance Criteria inside it",
    "- never use a separate acceptanceCriteria JSON field",
    "- comment.body = execution trace (structured markdown sections)",
    "- JSON action = machine state only",
    "",
    "Never put chat tone in comments. No emojis. No casual filler.",
    "",
    item.projectName ? `Project: ${item.projectName}` : "",
    `Task #${item.taskId}: ${item.title}`,
    "",
    "Current description:",
    item.description || "(empty)",
  ];

  const comments = Array.isArray(item.comments) ? item.comments : [];
  if (comments.length > 0) {
    lines.push("", "Comment history:");
    for (const comment of comments) {
      const author = comment.authorId ?? comment.by ?? "unknown";
      const type = comment.type ?? "note";
      const body = comment.body ?? comment.text ?? "";
      lines.push(`[${type}] ${author}:\n${body}`);
    }
  }

  lines.push(
    "",
    "Update description using this contract shape:",
    "# Goal",
    "# Context",
    "# Requirements",
    "# Non-Goals",
    "# Acceptance Criteria",
    "# References",
    "",
    "Add one execution comment using sections like:",
    "## Observation",
    "## Changes",
    "## Validation",
    "## Confidence",
    "",
    "End with a single JSON block:",
    "```json",
    "{",
    '  "action": "task.complete",',
    '  "description": "# Goal\\n...\\n# Acceptance Criteria\\n- ...",',
    '  "aiSummary": "one line status",',
    '  "comment": {',
    '    "type": "execution_log",',
    '    "body": "## Changes\\n..."',
    "  }",
    "}",
    "```",
  );

  return lines.filter(Boolean).join("\n");
}

function parseAgentPayload(raw) {
  const trimmed = raw.trim();
  const fence = trimmed.match(/```json\s*([\s\S]*?)```/i);
  if (fence) {
    try {
      return JSON.parse(fence[1].trim());
    } catch {
      // fall through
    }
  }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      // fall through
    }
  }
  return {
    action: "task.complete",
    comment: {
      type: "summary",
      body: `## Summary\n${trimmed}`,
    },
  };
}

function inboxTurnId(item) {
  return item.turnId ?? item.createdAt ?? String(item.taskId);
}

function inboxPriority(item) {
  const comments = Array.isArray(item.comments) ? item.comments : [];
  let lastUser = null;
  let lastAssistant = null;
  for (let index = comments.length - 1; index >= 0; index -= 1) {
    const entry = comments[index];
    const authorType = entry.authorType ?? (entry.role === "user" ? "human" : "ai");
    if (!lastUser && authorType === "human") lastUser = entry;
    if (!lastAssistant && authorType === "ai") lastAssistant = entry;
    if (lastUser && lastAssistant) break;
  }
  if (lastUser && lastAssistant) {
    const userAt = Date.parse(lastUser.at);
    const assistantAt = Date.parse(lastAssistant.at);
    if (!Number.isNaN(userAt) && !Number.isNaN(assistantAt) && userAt > assistantAt) {
      return 0;
    }
  }
  return 1;
}

function sortInboxItems(items) {
  return [...items].sort((a, b) => {
    const priority = inboxPriority(a) - inboxPriority(b);
    if (priority !== 0) return priority;
    return (b.taskId ?? 0) - (a.taskId ?? 0);
  });
}

function runningExpired(entry) {
  if (entry.status !== "running") return false;
  const startedAt = Date.parse(entry.startedAt ?? "");
  if (Number.isNaN(startedAt)) return true;
  return Date.now() - startedAt > 20 * 60 * 1000;
}

function extractAnswer(result) {
  if (typeof result.result === "string") return result.result.trim();
  if (result.result && typeof result.result === "object") {
    const text = result.result.text ?? result.result.content;
    if (typeof text === "string") return text.trim();
  }
  return String(result.result ?? "").trim();
}

async function closeActiveSession(reason) {
  const session = activeSession;
  if (!session) return;
  activeSession = null;

  log("closing agent panel", {
    reason,
    taskId: session.taskId,
    agentId: session.agentId,
    runId: session.runId,
  });

  try {
    if (session.run?.supports?.("cancel") && session.run.status === "running") {
      await session.run.cancel();
    } else if (session.runId && session.cwd) {
      const { Agent } = await import("@cursor/sdk");
      await Agent.cancelRun(session.runId, { runtime: "local", cwd: session.cwd });
    }
  } catch (error) {
    log("run cancel failed", { error: error.message });
  }

  try {
    if (session.agent) {
      session.agent.close();
      await session.agent[Symbol.asyncDispose]();
    }
  } catch (error) {
    log("agent close failed", { error: error.message });
  }
}

function installShutdownHandlers() {
  let handling = false;
  const onSignal = (signal) => {
    if (handling) return;
    handling = true;
    shuttingDown = true;
    const taskId = activeClaim?.taskId ?? activeSession?.taskId ?? null;
    log("shutdown signal", { signal, taskId });
    void (async () => {
      await closeActiveSession(signal);
      if (taskId) {
        activeClaim = null;
        try {
          await backendFetch(`/tasks/${taskId}/unclaim`, { method: "POST", body: "{}" });
          log("released claim on shutdown", { taskId });
        } catch (error) {
          log("unclaim on shutdown failed", { taskId, error: error.message });
        }
      }
      process.exit(0);
    })();
  };

  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);
  if (process.platform === "win32") {
    process.on("SIGBREAK", onSignal);
  }
}

function sleep(ms) {
  return new Promise((resolve) => {
    if (shuttingDown) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, ms);
    const check = setInterval(() => {
      if (!shuttingDown) return;
      clearTimeout(timer);
      clearInterval(check);
      resolve();
    }, 100);
    timer.unref?.();
    check.unref?.();
  });
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

  const agent = await Agent.create({
    apiKey,
    model: { id: modelId() },
    local: { cwd, settingSources: [] },
  });

  const session = {
    agent,
    run: null,
    taskId: item.taskId,
    cwd,
    agentId: agent.agentId,
    runId: null,
  };
  activeSession = session;

  try {
    if (shuttingDown) {
      throw new Error("Shutdown requested");
    }

    const run = await agent.send(prompt);
    session.run = run;
    session.runId = run.id;

    if (shuttingDown) {
      throw new Error("Shutdown requested");
    }

    const result = await run.wait();

    if (shuttingDown || result.status === "cancelled") {
      throw new Error("Shutdown requested");
    }

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
    if (shuttingDown) {
      throw new Error("Shutdown requested");
    }
    if (CursorAgentError && err instanceof CursorAgentError) {
      throw new Error(`Agent startup failed: ${err.message}`);
    }
    throw err;
  } finally {
    if (activeSession === session) {
      await closeActiveSession("run finished");
    }
  }
}

async function postAgentResult(taskId, rawOutput) {
  const payload = parseAgentPayload(rawOutput);
  await backendFetch(`/tasks/${taskId}/agent-result`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  log("agent result posted", { taskId, action: payload.action ?? "task.complete" });
}

async function claimNextFromBackend() {
  try {
    return await backendFetch("/worker/claim-next", {
      method: "POST",
      body: JSON.stringify({ claimedBy: "cursor-agent" }),
    });
  } catch (error) {
    if (String(error.message).includes("404")) return null;
    throw error;
  }
}

async function processOnce(state) {
  if (process.env.WORKER_CURSOR_AGENT === "false") {
    log("disabled", { hint: "Set WORKER_CURSOR_AGENT=true in .env" });
    return state;
  }

  if (!process.env.CURSOR_API_KEY?.trim()) {
    log("skipped", { reason: "CURSOR_API_KEY missing" });
    return state;
  }

  const item = await claimNextFromBackend();
  if (!item?.taskId) {
    return state;
  }

  const taskId = item.taskId;
  const turnId = inboxTurnId(item);
  const entry = state.tasks[String(taskId)] ?? {};
  if (entry.status === "done" && entry.lastTurnId === turnId) {
    return state;
  }
  if (entry.status === "failed" && entry.lastTurnId === turnId) {
    const failedAt = Date.parse(entry.failedAt ?? "");
    if (!Number.isNaN(failedAt) && Date.now() - failedAt < 60000) {
      try {
        await backendFetch(`/tasks/${taskId}/unclaim`, { method: "POST", body: "{}" });
      } catch {
        // ignore
      }
      return state;
    }
  }

  state.tasks[String(taskId)] = {
    status: "running",
    lastTurnId: turnId,
    startedAt: new Date().toISOString(),
  };
  await writeState(state);

  log("claimed task", { taskId, turnId, title: item.title });
  activeClaim = { taskId };

  try {
    const answer = await runLocalAgent(item);
    await postAgentResult(taskId, answer);
    await removeInboxItem(taskId);
    state.tasks[String(taskId)] = {
      status: "done",
      lastTurnId: turnId,
      finishedAt: new Date().toISOString(),
    };
  } catch (error) {
    if (error.message !== "Shutdown requested") {
      try {
        await backendFetch(`/tasks/${taskId}/unclaim`, { method: "POST", body: "{}" });
      } catch {
        // ignore
      }
      state.tasks[String(taskId)] = {
        status: "failed",
        lastTurnId: turnId,
        error: error.message,
        failedAt: new Date().toISOString(),
      };
      log("task failed", { taskId, turnId, error: error.message });
    }
  } finally {
    if (activeClaim?.taskId === taskId) {
      activeClaim = null;
    }
  }

  await writeState(state);
  return state;
}

async function cmdWatch() {
  log("watching local cursor agent", {
    inbox: INBOX_PATH,
    model: modelId(),
    pollMs: pollMs(),
  });

  let state = await readState();

  while (!shuttingDown) {
    try {
      state = await processOnce(state);
    } catch (error) {
      log("poll error", { error: error.message });
    }
    if (shuttingDown) break;
    await sleep(pollMs());
  }
}

async function cmdOnce() {
  const state = await readState();
  await processOnce(state);
}

async function main() {
  loadDotEnv();
  installShutdownHandlers();
  const [command] = process.argv.slice(2);

  switch (command) {
    case "once":
      await cmdOnce();
      break;
    case "watch":
    default:
      await cmdWatch();
  }
}

main().catch((error) => {
  console.error(`[cursor-agent] ${error.message}`);
  process.exit(1);
});
