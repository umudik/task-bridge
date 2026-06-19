import { AppError } from "../errors/app-error.js";
import { emptyToUndefined } from "../lib/strings.js";
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
  note: string | undefined;
};

export type AuthorType = "human" | "system";

export type AssigneeKind = "human" | "ai";

export type TaskComment = {
  id: string;
  authorType: AuthorType;
  authorId: string;
  tags: string[];
  body: string;
  at: string;
  metadata: Record<string, unknown> | undefined;
};

export type BridgeTask = {
  id: number;
  projectId: string;
  projectName: string;
  parentId: number | undefined;
  epicId: number | undefined;
  templateId: string | undefined;
  title: string;
  description: string;
  acceptanceCriteria: string | undefined;
  priority: string | undefined;
  labels: string[];
  assignee: string | undefined;
  assigneeRole: string | undefined;
  assigneeKind: AssigneeKind | undefined;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  claimedBy: string | undefined;
  claimedAt: string | undefined;
  answeredBy: string | undefined;
  answeredAt: string | undefined;
  answer: string | undefined;
  stageId: string | undefined;
  workStatus: WorkStatus | undefined;
  comments: TaskComment[];
  events: TaskEvent[];
};

/** Raw task from the DB layer or legacy JSON — may contain a leftover `status` string. */
export type RawTask = BridgeTask & { status: string | undefined };

export function isDoneStage(stageId: string | undefined): boolean {
  return stageId === DONE_STAGE_ID;
}

export function isTaskClaimed(task: BridgeTask): boolean {
  return Boolean(task.claimedBy?.trim());
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
    tasks.filter((task) => {
      const resolved = task.epicId != null ? task.epicId : resolveEpicId(tasks, task);
      return resolved === epicId;
    }),
  );
}

export function resolveTaskStageId(tasks: BridgeTask[], task: BridgeTask): string | undefined {
  if (task.stageId) return task.stageId;
  if (!task.parentId) return undefined;
  const parent = tasks.find((entry) => entry.id === task.parentId);
  if (!parent) return undefined;
  return resolveTaskStageId(tasks, parent);
}

export function resolveEpicId(tasks: BridgeTask[], task: BridgeTask): number | undefined {
  if (task.epicId != null) return task.epicId;
  if (task.parentId == null) return undefined;
  const parent = tasks.find((entry) => entry.id === task.parentId);
  if (!parent) return task.parentId;
  if (parent.parentId == null) return parent.id;
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
  if (!parent || parent.parentId == null) return;
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
  const legacy = emptyToUndefined(task.acceptanceCriteria);
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
): TaskComment | undefined {
  const rawBody =
    typeof raw.body === "string" ? raw.body : typeof raw.text === "string" ? raw.text : undefined;
  const body = emptyToUndefined(rawBody);
  if (!body) return undefined;

  const role = typeof raw.role === "string" ? raw.role : "";
  const rawBy = typeof raw.by === "string" ? raw.by : undefined;
  const rawAuthorId = typeof raw.authorId === "string" ? raw.authorId : undefined;
  const resolvedAuthor =
    rawBy !== undefined ? rawBy : rawAuthorId !== undefined ? rawAuthorId : "unknown";
  const authorId = String(resolvedAuthor).trim() || "unknown";

  const rawAuthorType = raw.authorType === "ai" ? "system" : raw.authorType;
  const authorType: AuthorType =
    rawAuthorType === "human" || rawAuthorType === "system"
      ? rawAuthorType
      : role === "user"
        ? "human"
        : "system";

  const rawId = raw.id !== undefined ? String(raw.id) : undefined;
  const rawAt = raw.at !== undefined ? String(raw.at) : undefined;

  return {
    id: rawId !== undefined ? rawId : `legacy-${taskId}-${index}`,
    authorType,
    authorId,
    tags: parseTags(raw.tags, raw.type),
    body,
    at: rawAt !== undefined ? rawAt : new Date().toISOString(),
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

  // Coerce fields that may arrive as null from legacy JSON or older DB rows.
  // We use type-safe checks so null and undefined both become undefined.
  task.parentId = typeof task.parentId === "number" ? task.parentId : undefined;
  task.epicId = typeof task.epicId === "number" ? task.epicId : undefined;
  task.templateId = typeof task.templateId === "string" ? task.templateId.trim() || undefined : undefined;

  task.labels = Array.isArray(task.labels) ? task.labels : [];
  task.priority = emptyToUndefined(task.priority);
  task.assignee = emptyToUndefined(task.assignee);
  task.assigneeRole = emptyToUndefined(task.assigneeRole);
  task.assigneeKind =
    task.assigneeKind === "human" || task.assigneeKind === "ai" ? task.assigneeKind : undefined;
  task.stageId = emptyToUndefined(task.stageId);
  task.answer = emptyToUndefined(task.answer);
  task.claimedBy = emptyToUndefined(task.claimedBy);
  task.updatedAt = task.updatedAt || task.createdAt;

  const legacyCriteria = emptyToUndefined(task.acceptanceCriteria);
  if (legacyCriteria) {
    task.description = mergeAcceptanceIntoDescription(task.description || "", legacyCriteria);
  }
  task.acceptanceCriteria = undefined;

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
        metadata: undefined,
      });
    }
  } else {
    task.comments = rawComments
      .map((entry, index) => migrateComment(entry as Record<string, unknown>, task.id, index))
      .filter((entry): entry is TaskComment => entry !== undefined);
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
