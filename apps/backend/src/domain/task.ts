import { AppError } from "../errors/app-error.js";
import { emptyToNull } from "../lib/strings.js";
import { isWorkDone, type WorkStatus } from "./work-status.js";

export const DONE_STAGE_ID = "done";

export type TaskEventType =
  | "created"
  | "claimed"
  | "answered"
  | "done"
  | "commented"
  | "stage_changed"
  | "spec_updated";

export type TaskEvent = {
  type: TaskEventType;
  at: string;
  by: string;
  note?: string;
};

export type AuthorType = "human" | "system";

export type TaskComment = {
  id: string;
  authorType: AuthorType;
  authorId: string;
  tags: string[];
  body: string;
  at: string;
  metadata?: Record<string, unknown>;
};

export type BridgeTask = {
  id: number;
  projectId: string;
  projectName: string;
  parentId: number | null;
  epicId: number | null;
  templateId: string | null;
  title: string;
  description: string;
  acceptanceCriteria: string | null;
  priority: string | null;
  labels: string[];
  assignee: string | null;
  assigneeRole: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  claimedBy: string | null;
  claimedAt: string | null;
  answeredBy: string | null;
  answeredAt: string | null;
  answer: string | null;
  stageId: string | null;
  workStatus?: WorkStatus | null;
  comments: TaskComment[];
  events: TaskEvent[];
};

export type RawTask = BridgeTask & { status?: string };

export function isDoneStage(stageId: string | null | undefined): boolean {
  return stageId === DONE_STAGE_ID;
}

export function isTaskClaimed(task: BridgeTask): boolean {
  return task.claimedBy !== null;
}

export function touchTask(task: BridgeTask): void {
  task.updatedAt = new Date().toISOString();
}

export function sortTasks(tasks: BridgeTask[]): BridgeTask[] {
  return [...tasks].sort((a, b) => {
    const aTime = Date.parse(a.updatedAt || a.createdAt);
    const bTime = Date.parse(b.updatedAt || b.createdAt);
    if (!Number.isNaN(aTime) && !Number.isNaN(bTime) && aTime !== bTime) {
      return bTime - aTime;
    }
    return b.id - a.id;
  });
}

export function listSubtasks(tasks: BridgeTask[], parentId: number): BridgeTask[] {
  return sortTasks(tasks.filter((task) => task.parentId === parentId));
}

export function listDescendantIds(tasks: BridgeTask[], parentId: number): number[] {
  const ids: number[] = [];
  for (const child of listSubtasks(tasks, parentId)) {
    ids.push(child.id);
    ids.push(...listDescendantIds(tasks, child.id));
  }
  return ids;
}

export function listEpicWorkflowTasks(tasks: BridgeTask[], epicId: number): BridgeTask[] {
  return sortTasks(
    tasks.filter((task) => (task.epicId ?? resolveEpicId(tasks, task)) === epicId),
  );
}

export function resolveTaskStageId(tasks: BridgeTask[], task: BridgeTask): string | null {
  if (task.stageId) return task.stageId;
  if (!task.parentId) return null;
  const parent = tasks.find((entry) => entry.id === task.parentId);
  if (!parent) return null;
  return resolveTaskStageId(tasks, parent);
}

export function resolveEpicId(tasks: BridgeTask[], task: BridgeTask): number | null {
  if (task.epicId !== null && task.epicId !== undefined) return task.epicId;
  if (task.parentId === null) return null;
  const parent = tasks.find((entry) => entry.id === task.parentId);
  if (!parent) return task.parentId;
  if (parent.parentId === null) return parent.id;
  return resolveEpicId(tasks, parent);
}

export function incompleteSubtasks(tasks: BridgeTask[], parentId: number): BridgeTask[] {
  return listSubtasks(tasks, parentId).filter((task) => !isWorkDone(task));
}

export function assertCanAdvanceWorkStatus(
  tasks: BridgeTask[],
  task: BridgeTask,
  nextStatus: WorkStatus,
): void {
  if (nextStatus === "todo") return;
  if (!task.parentId) return;
  const parent = tasks.find((entry) => entry.id === task.parentId);
  if (!parent || parent.parentId === null) return;
  if (!isWorkDone(parent)) {
    throw new AppError("Parent task must be done first", 409);
  }
}

export function assertCanCompleteTask(tasks: BridgeTask[], task: BridgeTask): void {
  const blocked = incompleteSubtasks(tasks, task.id);
  if (blocked.length === 0) return;
  throw new AppError(`Cannot complete: ${blocked.length} subtask(s) are not done`, 409, {
    subtasks: blocked.map((entry) => ({
      id: entry.id,
      title: entry.title,
      stageId: entry.stageId,
    })),
  });
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
  const desc = task.description.trim();
  const legacy = emptyToNull(task.acceptanceCriteria);
  if (!legacy) return desc;
  return mergeAcceptanceIntoDescription(desc, legacy);
}

function parseTags(raw: unknown, legacyType: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  }
  if (typeof legacyType === "string" && legacyType.trim()) {
    return [legacyType.trim()];
  }
  return [];
}

export function migrateComment(
  raw: Record<string, unknown>,
  taskId: number,
  index: number,
): TaskComment | null {
  const body = emptyToNull(
    typeof raw.body === "string" ? raw.body : typeof raw.text === "string" ? raw.text : null,
  );
  if (!body) return null;

  const role = typeof raw.role === "string" ? raw.role : "";
  const authorId = String(raw.by ?? raw.authorId ?? "unknown").trim() || "unknown";
  const rawAuthorType = raw.authorType === "ai" ? "system" : raw.authorType;
  const authorType: AuthorType =
    rawAuthorType === "human" || rawAuthorType === "system"
      ? rawAuthorType
      : role === "user"
        ? "human"
        : "system";

  return {
    id: String(raw.id ?? `legacy-${taskId}-${index}`),
    authorType,
    authorId,
    tags: parseTags(raw.tags, raw.type),
    body,
    at: String(raw.at ?? new Date().toISOString()),
    metadata:
      raw.metadata && typeof raw.metadata === "object"
        ? (raw.metadata as Record<string, unknown>)
        : undefined,
  };
}

function applyLegacyStage(task: RawTask): void {
  if (task.stageId) return;
  if (task.status === "done") {
    task.stageId = DONE_STAGE_ID;
  }
}

export function normalizeTask(task: RawTask): BridgeTask {
  applyLegacyStage(task);
  task.parentId = task.parentId ?? null;
  task.epicId = task.epicId ?? null;
  task.templateId = task.templateId ?? null;
  task.labels = Array.isArray(task.labels) ? task.labels : [];
  task.priority = emptyToNull(task.priority);
  task.assignee = emptyToNull(task.assignee);
  task.assigneeRole = emptyToNull(task.assigneeRole);
  task.stageId = emptyToNull(task.stageId);
  task.answer = emptyToNull(task.answer);
  task.claimedBy = emptyToNull(task.claimedBy);
  task.updatedAt = task.updatedAt || task.createdAt;

  const legacyCriteria = emptyToNull(task.acceptanceCriteria);
  if (legacyCriteria) {
    task.description = mergeAcceptanceIntoDescription(task.description ?? "", legacyCriteria);
  }
  task.acceptanceCriteria = null;

  const rawComments = task.comments as unknown;
  if (!Array.isArray(rawComments)) {
    task.comments = [];
    if (task.answer && task.answeredAt) {
      task.comments.push({
        id: `assistant-${task.id}-initial`,
        authorType: "system",
        authorId: "system",
        tags: [],
        body: task.answer,
        at: task.answeredAt,
      });
    }
  } else {
    task.comments = rawComments
      .map((entry, index) => migrateComment(entry as Record<string, unknown>, task.id, index))
      .filter((entry): entry is TaskComment => entry !== null);
  }

  delete task.status;
  return task;
}

export function mergeAcceptanceCriteria(
  description: string,
  acceptanceCriteria: string,
): string {
  return mergeAcceptanceIntoDescription(description, acceptanceCriteria);
}

