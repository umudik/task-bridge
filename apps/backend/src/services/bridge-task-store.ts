import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type TaskEventType = "created" | "claimed" | "answered" | "done";

export type TaskEvent = {
  type: TaskEventType;
  at: string;
  by: string;
  note?: string;
};

export type BridgeTask = {
  id: number;
  projectId: string;
  projectName: string;
  title: string;
  description: string;
  createdBy: string;
  createdAt: string;
  claimedBy: string | null;
  claimedAt: string | null;
  status: "open" | "claimed" | "done";
  events: TaskEvent[];
};

type StoreFile = {
  tasks: BridgeTask[];
};

const storePath =
  process.env.BRIDGE_TASKS_PATH?.trim() ||
  path.resolve(process.cwd(), "../../worker/bridge-tasks.json");

async function readStore(): Promise<StoreFile> {
  try {
    const raw = await readFile(storePath, "utf8");
    const parsed = JSON.parse(raw) as StoreFile;
    if (!Array.isArray(parsed.tasks)) return { tasks: [] };
    return parsed;
  } catch {
    return { tasks: [] };
  }
}

async function writeStore(store: StoreFile): Promise<void> {
  await mkdir(path.dirname(storePath), { recursive: true });
  await writeFile(storePath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

function sortTasks(tasks: BridgeTask[]): BridgeTask[] {
  return [...tasks].sort((a, b) => {
    const aTime = Date.parse(a.createdAt);
    const bTime = Date.parse(b.createdAt);
    if (!Number.isNaN(aTime) && !Number.isNaN(bTime) && aTime !== bTime) {
      return bTime - aTime;
    }
    return b.id - a.id;
  });
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
    createdBy,
    createdAt,
    claimedBy: null,
    claimedAt: null,
    status: "open",
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
  if (!task) return null;

  const claimedAt = new Date().toISOString();
  task.claimedBy = claimedBy;
  task.claimedAt = claimedAt;
  task.status = "claimed";
  task.events.push({ type: "claimed", at: claimedAt, by: claimedBy });
  await writeStore(store);
  return task;
}

export async function markBridgeTaskAnswered(
  id: number,
  answeredBy: string,
): Promise<BridgeTask | null> {
  const store = await readStore();
  const task = store.tasks.find((entry) => entry.id === id);
  if (!task) return null;

  const answeredAt = new Date().toISOString();
  task.status = "done";
  task.events.push({ type: "answered", at: answeredAt, by: answeredBy });
  await writeStore(store);
  return task;
}
