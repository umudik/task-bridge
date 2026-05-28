import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type TaskEventType =
  | "created"
  | "claimed"
  | "answered"
  | "done"
  | "commented"
  | "status_changed"
  | "spec_updated";

export type TaskEvent = {
  type: TaskEventType;
  at: string;
  by: string;
  note?: string;
};

export type TaskStatus = "open" | "in_progress" | "done";

export type AuthorType = "human" | "ai" | "system";

export type CommentType =
  | "note"
  | "review"
  | "execution_log"
  | "decision"
  | "question"
  | "warning"
  | "summary";

export type TaskComment = {
  id: string;
  authorType: AuthorType;
  authorId: string;
  type: CommentType;
  body: string;
  at: string;
  metadata?: Record<string, unknown>;
};

export type BridgeTask = {
  id: number;
  projectId: string;
  projectName: string;
  title: string;
  description: string;
  acceptanceCriteria: string | null;
  priority: string | null;
  labels: string[];
  assignee: string | null;
  aiContext: string | null;
  aiSummary: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  claimedBy: string | null;
  claimedAt: string | null;
  answeredBy: string | null;
  answeredAt: string | null;
  answer: string | null;
  status: TaskStatus;
  comments: TaskComment[];
  events: TaskEvent[];
};

type StoreFile = {
  tasks: BridgeTask[];
};

const storePath =
  process.env.BRIDGE_TASKS_PATH?.trim() ||
  path.resolve(process.cwd(), "../../worker/bridge-tasks.json");

function normalizeStatus(status: string): TaskStatus {
  if (status === "claimed" || status === "in_progress") return "in_progress";
  if (status === "done") return "done";
  return "open";
}

function mergeAcceptanceIntoDescription(description: string, acceptanceCriteria: string): string {
  const desc = description.trim();
  const criteria = acceptanceCriteria.trim();
  if (!criteria) return desc;
  if (/#+\s*acceptance criteria/i.test(desc)) return desc;
  const block = `# Acceptance Criteria\n${criteria}`;
  return desc ? `${desc}\n\n${block}` : block;
}

export function canonicalDescription(task: BridgeTask): string {
  const desc = task.description?.trim() ?? "";
  const legacy = task.acceptanceCriteria?.trim();
  if (!legacy) return desc;
  return mergeAcceptanceIntoDescription(desc, legacy);
}

function migrateComment(
  raw: Record<string, unknown>,
  taskId: number,
  index: number,
): TaskComment | null {
  const at = String(raw.at ?? new Date().toISOString());
  const rawBody = raw.body ?? raw.text;
  const body = typeof rawBody === "string" ? rawBody.trim() : "";
  if (!body) return null;
  const role = typeof raw.role === "string" ? raw.role : "";
  const by = String(raw.by ?? raw.authorId ?? "unknown").trim();
  const authorType: AuthorType =
    raw.authorType === "human" || raw.authorType === "ai" || raw.authorType === "system"
      ? raw.authorType
      : role === "user"
        ? "human"
        : "ai";
  const type: CommentType =
    raw.type === "note" ||
    raw.type === "review" ||
    raw.type === "execution_log" ||
    raw.type === "decision" ||
    raw.type === "question" ||
    raw.type === "warning" ||
    raw.type === "summary"
      ? raw.type
      : authorType === "ai"
        ? "summary"
        : "note";

  return {
    id: String(raw.id ?? `legacy-${taskId}-${index}`),
    authorType,
    authorId: by || (authorType === "ai" ? "cursor-ai" : "user"),
    type,
    body,
    at,
    metadata:
      raw.metadata && typeof raw.metadata === "object"
        ? (raw.metadata as Record<string, unknown>)
        : undefined,
  };
}

function normalizeTask(task: BridgeTask): BridgeTask {
  task.status = normalizeStatus(String(task.status ?? "open"));
  if (!Array.isArray(task.labels)) task.labels = [];
  if (!task.priority) task.priority = null;
  if (!task.assignee) task.assignee = null;
  if (task.acceptanceCriteria?.trim()) {
    task.description = mergeAcceptanceIntoDescription(
      task.description ?? "",
      task.acceptanceCriteria,
    );
    task.acceptanceCriteria = null;
  } else {
    task.acceptanceCriteria = null;
  }
  if (!task.aiContext) task.aiContext = null;
  else {
    const trimmed = task.aiContext.trim();
    task.aiContext = trimmed || null;
  }
  if (!task.aiSummary) task.aiSummary = null;
  else {
    const trimmed = task.aiSummary.trim();
    task.aiSummary = trimmed || null;
  }
  if (!task.answer) task.answer = null;
  else {
    const trimmed = task.answer.trim();
    task.answer = trimmed || null;
  }
  if (!task.updatedAt) task.updatedAt = task.createdAt;

  const rawComments = task.comments as unknown;
  if (!Array.isArray(rawComments)) {
    task.comments = [];
    if (task.answer?.trim() && task.answeredAt) {
      task.comments.push({
        id: `assistant-${task.id}-initial`,
        authorType: "ai",
        authorId: "cursor-ai",
        type: "summary",
        body: task.answer.trim(),
        at: task.answeredAt,
      });
    }
  } else {
    task.comments = rawComments
      .map((entry, index) => migrateComment(entry as Record<string, unknown>, task.id, index))
      .filter((entry): entry is TaskComment => entry !== null);
  }

  return task;
}

async function readStore(): Promise<StoreFile> {
  try {
    const raw = await readFile(storePath, "utf8");
    const parsed = JSON.parse(raw) as StoreFile;
    if (!Array.isArray(parsed.tasks)) return { tasks: [] };
    parsed.tasks = parsed.tasks.map((task) => normalizeTask(task as BridgeTask));
    return parsed;
  } catch {
    return { tasks: [] };
  }
}

async function writeStore(store: StoreFile): Promise<void> {
  await mkdir(path.dirname(storePath), { recursive: true });
  await writeFile(storePath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

function touch(task: BridgeTask) {
  task.updatedAt = new Date().toISOString();
}

function sortTasks(tasks: BridgeTask[]): BridgeTask[] {
  return [...tasks].sort((a, b) => {
    const aTime = Date.parse(a.updatedAt || a.createdAt);
    const bTime = Date.parse(b.updatedAt || b.createdAt);
    if (!Number.isNaN(aTime) && !Number.isNaN(bTime) && aTime !== bTime) {
      return bTime - aTime;
    }
    return b.id - a.id;
  });
}

export async function allocateTaskId(): Promise<number> {
  const store = await readStore();
  const max = store.tasks.reduce((highest, task) => Math.max(highest, task.id), 0);
  return max + 1;
}

export async function listBridgeTasks(): Promise<BridgeTask[]> {
  const store = await readStore();
  return sortTasks(store.tasks);
}

export async function getBridgeTask(id: number): Promise<BridgeTask | null> {
  const store = await readStore();
  return store.tasks.find((task) => task.id === id) ?? null;
}

export async function upsertBridgeTask(input: {
  id: number;
  projectId: string;
  projectName: string;
  title: string;
  description: string;
  createdBy?: string;
  createdAt?: string;
}): Promise<BridgeTask> {
  const store = await readStore();
  const existing = store.tasks.find((task) => task.id === input.id);
  if (existing) {
    existing.title = input.title;
    existing.description = input.description;
    existing.projectId = input.projectId;
    existing.projectName = input.projectName;
    touch(existing);
    await writeStore(store);
    return existing;
  }

  const createdAt = input.createdAt ?? new Date().toISOString();
  const createdBy = input.createdBy ?? "mobile";
  const task: BridgeTask = {
    id: input.id,
    projectId: input.projectId,
    projectName: input.projectName,
    title: input.title,
    description: input.description,
    acceptanceCriteria: null,
    priority: null,
    labels: [],
    assignee: null,
    aiContext: null,
    aiSummary: null,
    createdBy,
    createdAt,
    updatedAt: createdAt,
    claimedBy: null,
    claimedAt: null,
    answeredBy: null,
    answeredAt: null,
    answer: null,
    status: "open",
    comments: [],
    events: [{ type: "created", at: createdAt, by: createdBy }],
  };
  store.tasks.push(task);
  await writeStore(store);
  return task;
}

export async function claimBridgeTask(
  id: number,
  claimedBy: string,
): Promise<BridgeTask | null> {
  const store = await readStore();
  const task = store.tasks.find((entry) => entry.id === id);
  if (!task || task.status !== "open") return null;

  const claimedAt = new Date().toISOString();
  task.claimedBy = claimedBy;
  task.claimedAt = claimedAt;
  task.status = "in_progress";
  task.events.push({ type: "claimed", at: claimedAt, by: claimedBy });
  touch(task);
  await writeStore(store);
  return task;
}

export async function releaseBridgeTask(id: number): Promise<BridgeTask | null> {
  return setBridgeTaskStatus(id, "open", "system");
}

export async function setBridgeTaskStatus(
  id: number,
  status: TaskStatus,
  by: string,
): Promise<BridgeTask | null> {
  const store = await readStore();
  const task = store.tasks.find((entry) => entry.id === id);
  if (!task) return null;

  task.status = status;
  if (status === "open") {
    task.claimedBy = null;
    task.claimedAt = null;
  }
  const at = new Date().toISOString();
  task.events.push({ type: "status_changed", at, by, note: status });
  touch(task);
  await writeStore(store);
  return task;
}

export async function updateBridgeTaskSpec(
  id: number,
  input: {
    description?: string;
    acceptanceCriteria?: string;
    aiSummary?: string;
    aiContext?: string;
    title?: string;
    by: string;
  },
): Promise<BridgeTask | null> {
  const store = await readStore();
  const task = store.tasks.find((entry) => entry.id === id);
  if (!task) return null;

  if (input.title !== undefined) task.title = input.title;
  if (input.description !== undefined || input.acceptanceCriteria !== undefined) {
    let desc = input.description !== undefined ? input.description : task.description;
    if (input.acceptanceCriteria !== undefined) {
      desc = mergeAcceptanceIntoDescription(desc, input.acceptanceCriteria);
    }
    task.description = desc;
    task.acceptanceCriteria = null;
  }
  if (input.aiSummary !== undefined) {
    const trimmed = input.aiSummary.trim();
    task.aiSummary = trimmed || null;
    task.answer = trimmed || null;
  }
  if (input.aiContext !== undefined) {
    const trimmed = input.aiContext.trim();
    task.aiContext = trimmed || null;
  }

  const at = new Date().toISOString();
  task.events.push({ type: "spec_updated", at, by: input.by });
  touch(task);
  await writeStore(store);
  return task;
}

export async function addBridgeTaskComment(
  id: number,
  input: {
    authorType: AuthorType;
    authorId: string;
    type: CommentType;
    body: string;
    metadata?: Record<string, unknown>;
  },
): Promise<BridgeTask | null> {
  const store = await readStore();
  const task = store.tasks.find((entry) => entry.id === id);
  if (!task) return null;

  const body = input.body.trim();
  if (!body) return null;

  const at = new Date().toISOString();
  if (!Array.isArray(task.comments)) task.comments = [];
  task.comments.push({
    id: `${input.authorType}-${id}-${Date.now()}`,
    authorType: input.authorType,
    authorId: input.authorId,
    type: input.type,
    body,
    at,
    metadata: input.metadata,
  });
  task.events.push({
    type: "commented",
    at,
    by: input.authorId,
    note: body.slice(0, 200),
  });
  touch(task);
  await writeStore(store);
  return task;
}

export async function addBridgeTaskUserComment(
  id: number,
  by: string,
  text: string,
): Promise<BridgeTask | null> {
  const store = await readStore();
  const task = store.tasks.find((entry) => entry.id === id);
  if (!task) return null;

  const trimmed = text.trim();
  if (!trimmed) return null;

  const at = new Date().toISOString();
  task.comments.push({
    id: `human-${id}-${Date.now()}`,
    authorType: "human",
    authorId: by,
    type: "note",
    body: trimmed,
    at,
  });
  task.status = "open";
  task.claimedBy = null;
  task.claimedAt = null;
  task.events.push({ type: "commented", at, by, note: trimmed.slice(0, 200) });
  touch(task);
  await writeStore(store);
  return task;
}

export type AgentWorkPayload = {
  action?: "task.start" | "task.complete";
  description?: string;
  acceptanceCriteria?: string;
  aiSummary?: string;
  aiContext?: string;
  comment?: {
    type?: CommentType;
    body: string;
    metadata?: Record<string, unknown>;
  };
};

export async function applyAgentWorkResult(
  id: number,
  payload: AgentWorkPayload,
): Promise<BridgeTask | null> {
  const store = await readStore();
  const task = store.tasks.find((entry) => entry.id === id);
  if (!task) return null;

  if (payload.description !== undefined || payload.acceptanceCriteria !== undefined) {
    let desc = payload.description !== undefined ? payload.description : task.description;
    if (payload.acceptanceCriteria !== undefined) {
      desc = mergeAcceptanceIntoDescription(desc, payload.acceptanceCriteria);
    }
    task.description = desc;
    task.acceptanceCriteria = null;
  }
  if (payload.aiSummary !== undefined) {
    const trimmed = payload.aiSummary.trim();
    task.aiSummary = trimmed || null;
    task.answer = trimmed || null;
  }
  if (payload.aiContext !== undefined) {
    const trimmed = payload.aiContext.trim();
    task.aiContext = trimmed || null;
  }

  if (payload.comment?.body?.trim()) {
    task.comments.push({
      id: `ai-${id}-${Date.now()}`,
      authorType: "ai",
      authorId: "cursor-ai",
      type: payload.comment.type ?? "execution_log",
      body: payload.comment.body.trim(),
      at: new Date().toISOString(),
      metadata: payload.comment.metadata,
    });
  }

  if (payload.action === "task.complete") {
    const answeredAt = new Date().toISOString();
    task.status = "done";
    task.answeredBy = "Cursor AI";
    task.answeredAt = answeredAt;
    task.events.push({ type: "answered", at: answeredAt, by: "Cursor AI" });
    task.events.push({ type: "done", at: answeredAt, by: "Cursor AI" });
  } else if (payload.action === "task.start") {
    task.status = "in_progress";
  }

  task.events.push({ type: "spec_updated", at: new Date().toISOString(), by: "cursor-ai" });
  touch(task);
  await writeStore(store);
  return task;
}

export async function markBridgeTaskAnswered(
  id: number,
  _answeredBy: string,
  answer?: string,
): Promise<BridgeTask | null> {
  return applyAgentWorkResult(id, {
    action: "task.complete",
    aiSummary: answer,
    comment: answer?.trim()
      ? { type: "summary", body: answer.trim() }
      : undefined,
  });
}
