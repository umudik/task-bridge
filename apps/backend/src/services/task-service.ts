import {
  allocateTaskRowId,
  getTaskRow,
  listTaskRows,
  mutateTaskRow,
  upsertTaskRow,
} from "../db/tasks-db.js";
import {
  isDoneStage,
  mergeAcceptanceCriteria,
  resolveEpicId,
  touchTask,
  type AuthorType,
  type BridgeTask,
} from "../domain/task.js";
import { isWorkDone, type WorkStatus } from "../domain/work-status.js";
import { emptyToNull } from "../lib/strings.js";

export {
  assertCanCompleteTask,
  canonicalDescription,
  DONE_STAGE_ID,
  isDoneStage,
  isTaskClaimed,
  listSubtasks,
  sortTasks,
  type AuthorType,
  type BridgeTask,
  type TaskComment,
  type TaskEvent,
} from "../domain/task.js";

export async function allocateTaskId(): Promise<number> {
  return allocateTaskRowId();
}

export async function listBridgeTasks(): Promise<BridgeTask[]> {
  return listTaskRows();
}

export async function getBridgeTask(id: number): Promise<BridgeTask | null> {
  return getTaskRow(id);
}

export async function upsertBridgeTask(input: {
  id: number;
  projectId: string;
  projectName: string;
  title: string;
  description: string;
  createdBy?: string;
  createdAt?: string;
  stageId?: string | null;
  assignee?: string | null;
  assigneeRole?: string | null;
  parentId?: number | null;
  epicId?: number | null;
  templateId?: string | null;
  workStatus?: WorkStatus | null;
}): Promise<BridgeTask> {
  const existing = getTaskRow(input.id);
  if (existing) {
    existing.title = input.title;
    existing.description = input.description;
    existing.projectId = input.projectId;
    existing.projectName = input.projectName;
    touchTask(existing);
    upsertTaskRow(existing);
    return existing;
  }

  const createdAt = input.createdAt ?? new Date().toISOString();
  const createdBy = input.createdBy ?? "mobile";
  const existingTasks = listTaskRows();
  const parentRow = input.parentId ? getTaskRow(input.parentId) : null;
  const resolvedEpicId =
    input.epicId ??
    (parentRow ? resolveEpicId(existingTasks, parentRow) : null);
  const task: BridgeTask = {
    id: input.id,
    projectId: input.projectId,
    projectName: input.projectName,
    parentId: input.parentId ?? null,
    epicId: resolvedEpicId,
    templateId: input.templateId ?? null,
    title: input.title,
    description: input.description,
    acceptanceCriteria: null,
    priority: null,
    labels: [],
    createdBy,
    createdAt,
    updatedAt: createdAt,
    claimedBy: null,
    claimedAt: null,
    answeredBy: null,
    answeredAt: null,
    answer: null,
    stageId: input.stageId ?? null,
    workStatus: input.workStatus ?? (input.parentId ? "todo" : null),
    assignee: input.assignee ?? null,
    assigneeRole: input.assigneeRole ?? null,
    comments: [],
    events: [{ type: "created", at: createdAt, by: createdBy }],
  };
  upsertTaskRow(task);
  return task;
}

export async function transitionBridgeTask(
  id: number,
  input: {
    stageId: string;
    assignee?: string | null;
    by: string;
  },
): Promise<BridgeTask | null> {
  return mutateTaskRow(id, (task) => {
    const at = new Date().toISOString();
    const fromStage = task.stageId;
    task.stageId = input.stageId;
    if (input.assignee !== undefined) {
      task.assignee = input.assignee;
    }
    if (isDoneStage(input.stageId)) {
      task.claimedBy = null;
      task.claimedAt = null;
    }
    task.events.push({
      type: "stage_changed",
      at,
      by: input.by,
      note: `${fromStage ?? "none"} -> ${input.stageId}`,
    });
    touchTask(task);
  });
}

export async function claimBridgeTask(
  id: number,
  claimedBy: string,
): Promise<BridgeTask | null> {
  const existing = getTaskRow(id);
  if (!existing || existing.claimedBy) return null;
  if (existing.parentId === null) return null;
  if (isWorkDone(existing)) return null;

  return mutateTaskRow(id, (task) => {
    const claimedAt = new Date().toISOString();
    task.claimedBy = claimedBy;
    task.claimedAt = claimedAt;
    task.events.push({ type: "claimed", at: claimedAt, by: claimedBy });
    touchTask(task);
  });
}

export async function releaseBridgeTask(id: number): Promise<BridgeTask | null> {
  return mutateTaskRow(id, (task) => {
    task.claimedBy = null;
    task.claimedAt = null;
    touchTask(task);
  });
}

export async function updateBridgeTaskSpec(
  id: number,
  input: {
    description?: string;
    acceptanceCriteria?: string;
    title?: string;
    by: string;
  },
): Promise<BridgeTask | null> {
  return mutateTaskRow(id, (task) => {
    if (input.title !== undefined) task.title = input.title;
    if (input.description !== undefined || input.acceptanceCriteria !== undefined) {
      let desc = input.description !== undefined ? input.description : task.description;
      if (input.acceptanceCriteria !== undefined) {
        desc = mergeAcceptanceCriteria(desc, input.acceptanceCriteria);
      }
      task.description = desc;
      task.acceptanceCriteria = null;
    }
    const at = new Date().toISOString();
    task.events.push({ type: "spec_updated", at, by: input.by });
    touchTask(task);
  });
}

export async function addBridgeTaskComment(
  id: number,
  input: {
    authorType: AuthorType;
    authorId: string;
    tags?: string[];
    body: string;
    metadata?: Record<string, unknown>;
  },
): Promise<BridgeTask | null> {
  const body = emptyToNull(input.body);
  if (!body) return null;

  return mutateTaskRow(id, (task) => {
    const at = new Date().toISOString();
    task.comments.push({
      id: `${input.authorType}-${id}-${Date.now()}`,
      authorType: input.authorType,
      authorId: input.authorId,
      tags: input.tags ?? [],
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
    touchTask(task);
  });
}

export async function addBridgeTaskUserComment(
  id: number,
  by: string,
  text: string,
): Promise<BridgeTask | null> {
  const body = emptyToNull(text);
  if (!body) return null;

  return mutateTaskRow(id, (task) => {
    const at = new Date().toISOString();
    task.comments.push({
      id: `human-${id}-${Date.now()}`,
      authorType: "human",
      authorId: by,
      tags: [],
      body,
      at,
    });
    task.claimedBy = null;
    task.claimedAt = null;
    task.events.push({ type: "commented", at, by, note: body.slice(0, 200) });
    touchTask(task);
  });
}

