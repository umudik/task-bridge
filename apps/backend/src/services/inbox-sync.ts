import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AuthorType, BridgeTask, TaskComment } from "./bridge-task-store.js";
import { canonicalDescription, claimBridgeTask, listBridgeTasks } from "./bridge-task-store.js";
import { getProjectById } from "./project-registry.js";

function latestCommentByAuthor(comments: TaskComment[], authorType: AuthorType) {
  for (let index = comments.length - 1; index >= 0; index -= 1) {
    const entry = comments[index];
    if (entry.authorType === authorType) return entry;
  }
  return null;
}

export function userAwaitingAgentReply(task: BridgeTask): boolean {
  const comments = Array.isArray(task.comments) ? task.comments : [];
  const lastHuman = latestCommentByAuthor(comments, "human");
  const lastAi = latestCommentByAuthor(comments, "ai");
  if (!lastHuman) return false;
  if (!lastAi) return true;

  const humanAt = Date.parse(lastHuman.at);
  const aiAt = Date.parse(lastAi.at);
  if (Number.isNaN(humanAt) || Number.isNaN(aiAt)) return true;
  return humanAt > aiAt;
}

export function taskNeedsAgent(task: BridgeTask): boolean {
  if (task.status === "in_progress") return false;
  if (task.status === "done" && !userAwaitingAgentReply(task)) return false;
  if (userAwaitingAgentReply(task)) return true;
  if (task.status === "open") return true;
  return false;
}

export function turnIdForTask(task: BridgeTask): string {
  const comments = Array.isArray(task.comments) ? task.comments : [];
  const lastHuman = latestCommentByAuthor(comments, "human");
  if (lastHuman && userAwaitingAgentReply(task)) {
    return `user-${lastHuman.id}`;
  }
  if (task.status === "in_progress" && task.claimedAt) return `claimed-${task.claimedAt}`;
  return `create-${task.createdAt}`;
}

function agentPriority(task: BridgeTask): number {
  if (userAwaitingAgentReply(task)) return 0;
  if (task.status === "open") return 1;
  return 3;
}

function sortTasksForAgent(tasks: BridgeTask[]): BridgeTask[] {
  return [...tasks].sort((a, b) => {
    const priority = agentPriority(a) - agentPriority(b);
    if (priority !== 0) return priority;
    return b.id - a.id;
  });
}

function resolveWorkspacePath(task: BridgeTask): string | null {
  const fromProject = getProjectById(task.projectId)?.repoPath?.trim();
  if (fromProject) return fromProject;
  const fromEnv = process.env.WORKER_REPO_PATH?.trim();
  return fromEnv || null;
}

function buildInboxEntry(task: BridgeTask, turnId: string): CursorInboxItem {
  return {
    taskId: task.id,
    turnId,
    projectId: task.projectId,
    projectName: task.projectName,
    title: task.title,
    description: canonicalDescription(task),
    workspacePath: resolveWorkspacePath(task),
    createdAt: task.createdAt,
    comments: Array.isArray(task.comments) ? task.comments : [],
  };
}

export type CursorInboxItem = {
  taskId: number;
  turnId: string;
  projectId: string;
  projectName: string;
  title: string;
  description: string;
  workspacePath: string | null;
  createdAt: string;
  comments: TaskComment[];
};

const inboxPath =
  process.env.CURSOR_INBOX_PATH?.trim() ||
  path.resolve(process.cwd(), "../../worker/cursor-inbox.json");

async function readInbox(): Promise<{ items: CursorInboxItem[] }> {
  try {
    const raw = await readFile(inboxPath, "utf8");
    const parsed = JSON.parse(raw) as { items?: CursorInboxItem[] };
    return { items: Array.isArray(parsed.items) ? parsed.items : [] };
  } catch {
    return { items: [] };
  }
}

async function writeInbox(items: CursorInboxItem[]): Promise<void> {
  await mkdir(path.dirname(inboxPath), { recursive: true });
  await writeFile(
    inboxPath,
    `${JSON.stringify(
      {
        updatedAt: new Date().toISOString(),
        hint: "Host agent: npm run agent",
        items,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

export async function enqueueCursorInbox(
  task: BridgeTask,
  turnId = new Date().toISOString(),
): Promise<void> {
  const inbox = await readInbox();
  const existing = inbox.items.find((item) => item.taskId === task.id);
  const entry = buildInboxEntry(task, turnId);
  if (existing) {
    Object.assign(existing, entry);
  } else {
    inbox.items.push(entry);
  }
  await writeInbox(inbox.items);
}

export async function reconcileCursorInbox(): Promise<number> {
  const tasks = await listBridgeTasks();
  const pending = tasks.filter(taskNeedsAgent);
  const inbox = await readInbox();
  const pendingIds = new Set(pending.map((task) => task.id));
  const kept = inbox.items.filter((item) => pendingIds.has(item.taskId));
  const byTaskId = new Map(kept.map((item) => [item.taskId, item]));

  for (const task of sortTasksForAgent(pending)) {
    const turnId = turnIdForTask(task);
    const entry = buildInboxEntry(task, turnId);
    const existing = byTaskId.get(task.id);
    if (existing) {
      Object.assign(existing, entry);
    } else {
      kept.push(entry);
      byTaskId.set(task.id, entry);
    }
  }

  await writeInbox(kept);
  return pending.length;
}

export async function listPendingAgentItems(): Promise<CursorInboxItem[]> {
  const tasks = await listBridgeTasks();
  return sortTasksForAgent(tasks.filter(taskNeedsAgent)).map((task) =>
    buildInboxEntry(task, turnIdForTask(task)),
  );
}

export async function claimNextAgentTask(
  claimedBy: string,
  options?: { projectId?: string },
): Promise<{ task: BridgeTask; item: CursorInboxItem } | null> {
  const tasks = await listBridgeTasks();
  const candidates = sortTasksForAgent(
    tasks.filter((task) => {
      if (options?.projectId && task.projectId !== options.projectId) return false;
      return taskNeedsAgent(task) && task.status === "open";
    }),
  );

  for (const candidate of candidates) {
    const claimed = await claimBridgeTask(candidate.id, claimedBy);
    if (!claimed) continue;
    return {
      task: claimed,
      item: buildInboxEntry(claimed, turnIdForTask(claimed)),
    };
  }

  return null;
}

