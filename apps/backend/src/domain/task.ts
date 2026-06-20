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
  note: string | null;
};

export type AssigneeKind = "human" | "ai";

export type AuthorType = "human" | "ai" | "system";

export type TaskComment = {
  id: string;
  role: "user" | "system";
  authorId: string;
  tags: string[];
  body: string;
  at: string;
  metadata: Record<string, unknown> | null;
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
  assignee: string;
  assigneeRole: string | null;
  assigneeKind: AssigneeKind | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  claimedBy: string | null;
  claimedAt: string | null;
  answeredBy: string | null;
  answeredAt: string | null;
  answer: string | null;
  stageId: string | null;
  workStatus: WorkStatus | null;
  comments: TaskComment[];
  events: TaskEvent[];
};

export type RawTask = BridgeTask & { status: string | null };

export function isDoneStage(stageId: string | null): boolean {
  return stageId === DONE_STAGE_ID;
}

export function isTaskClaimed(task: BridgeTask): boolean {
  return task.claimedBy !== null && task.claimedBy.trim() !== "";
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

export function listSubtasks(
  tasks: BridgeTask[],
  parentId: number,
): BridgeTask[] {
  return sortTasks(tasks.filter((task) => task.parentId === parentId));
}

export function listDescendantIds(
  tasks: BridgeTask[],
  parentId: number,
): number[] {
  const ids: number[] = [];
  for (const child of listSubtasks(tasks, parentId)) {
    ids.push(child.id);
    ids.push(...listDescendantIds(tasks, child.id));
  }
  return ids;
}

export function listEpicWorkflowTasks(
  tasks: BridgeTask[],
  epicId: number,
): BridgeTask[] {
  return sortTasks(
    tasks.filter((task) => {
      const resolved = task.epicId || resolveEpicId(tasks, task);
      return resolved === epicId;
    }),
  );
}

export function resolveTaskStageId(
  tasks: BridgeTask[],
  task: BridgeTask,
): string | null {
  if (task.stageId) return task.stageId;
  if (!task.parentId) return null;
  const parent = tasks.find((entry) => entry.id === task.parentId);
  if (!parent) return null;
  return resolveTaskStageId(tasks, parent);
}

export function resolveEpicId(
  tasks: BridgeTask[],
  task: BridgeTask,
): number | null {
  if (task.epicId !== null) return task.epicId;
  if (task.parentId === null) return null;
  const parent = tasks.find((entry) => entry.id === task.parentId);
  if (!parent) return task.parentId;
  if (parent.parentId === null) return parent.id;
  return resolveEpicId(tasks, parent);
}

export function incompleteSubtasks(
  tasks: BridgeTask[],
  parentId: number,
): BridgeTask[] {
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

export function assertCanCompleteTask(
  tasks: BridgeTask[],
  task: BridgeTask,
): void {
  const blocked = incompleteSubtasks(tasks, task.id);
  if (blocked.length === 0) return;
  throw new AppError(
    `Cannot complete: ${blocked.length} subtask(s) are not done`,
    409,
    {
      subtasks: blocked.map((entry) => ({
        id: entry.id,
        title: entry.title,
        stageId: entry.stageId,
      })),
    },
  );
}

export function canonicalDescription(task: BridgeTask): string {
  return task.description.trim();
}

function parseTags(raw: unknown, legacyType: unknown): string[] {
  if (Array.isArray(raw)) {
    const result: string[] = [];
    for (const item of raw) {
      if (item !== null && String(item) === item) {
        const s = (item as string).trim();
        if (s) result.push(s);
      }
    }
    return result;
  }
  if (legacyType !== null) {
    const legacyTypeStr = legacyType as string;
    const s = String(legacyTypeStr).trim();
    if (s && s !== "null") {
      return [s];
    }
  }
  return [];
}

export function migrateComment(
  raw: Record<string, unknown>,
  taskId: number,
  index: number,
): TaskComment | null {
  let rawBody: string | null = null;
  const bodyCandidate = raw.body as string;
  const textCandidate = raw.text as string;
  if (raw.body !== null && String(bodyCandidate) === bodyCandidate) {
    rawBody = bodyCandidate;
  } else if (raw.text !== null && String(textCandidate) === textCandidate) {
    rawBody = textCandidate;
  }
  const body = emptyToNull(rawBody);
  if (!body) return null;

  let rawRole = "";
  const roleCandidate = raw.role as string;
  if (raw.role !== null && String(roleCandidate) === roleCandidate) {
    rawRole = roleCandidate;
  }

  let rawBy: string | null = null;
  const byCandidate = raw.by as string;
  if (raw.by !== null && String(byCandidate) === byCandidate) {
    const trimmed = byCandidate.trim();
    rawBy = trimmed || null;
  }

  let rawAuthorId: string | null = null;
  const authorIdCandidate = raw.authorId as string;
  if (raw.authorId !== null && String(authorIdCandidate) === authorIdCandidate) {
    const trimmed = authorIdCandidate.trim();
    rawAuthorId = trimmed || null;
  }

  let authorId = "unknown";
  if (rawBy !== null) {
    authorId = rawBy;
  } else if (rawAuthorId !== null) {
    authorId = rawAuthorId;
  }

  let commentRole: "user" | "system" = "system";
  if (rawRole === "user" || rawRole === "system") {
    commentRole = rawRole;
  } else if (raw.authorType === "human") {
    commentRole = "user";
  } else if (raw.authorType === "system" || raw.authorType === "ai") {
    commentRole = "system";
  }

  let id: string;
  const idCandidate = raw.id as string;
  if (raw.id !== null && String(idCandidate) !== "null") {
    id = String(idCandidate);
  } else {
    id = `legacy-${taskId}-${index}`;
  }

  let at: string;
  const atCandidate = raw.at as string;
  if (raw.at !== null && String(atCandidate) !== "null") {
    at = String(atCandidate);
  } else {
    at = new Date().toISOString();
  }

  let metadata: Record<string, unknown> | null = null;
  if (raw.metadata instanceof Object && !Array.isArray(raw.metadata)) {
    metadata = raw.metadata as Record<string, unknown>;
  }

  return {
    id,
    role: commentRole,
    authorId,
    tags: parseTags(raw.tags, raw.type),
    body,
    at,
    metadata,
  };
}

export function normalizeTask(raw: RawTask): BridgeTask {
  if (!raw.stageId && raw.status === "done") {
    raw.stageId = DONE_STAGE_ID;
  }
  const { status: _ignored, ...task } = raw;
  return task;
}
