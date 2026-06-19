import {
  canonicalDescription,
  isDoneStage,
  isTaskClaimed,
  listEpicWorkflowTasks,
  listSubtasks,
  resolveTaskStageId,
  type BridgeTask,
  type TaskComment,
} from "../domain/task.js";
import { isWorkDone, resolveWorkStatus, workStatusLabel } from "../domain/work-status.js";
import { syncEpicStage } from "../services/epic-service.js";
import { listTaskLibraryLinks } from "../services/library-service.js";
import { getStageSnapshot, getStageTitleLookup } from "../services/workflow-service.js";
import { AppError } from "../errors/app-error.js";
import {
  decodeInboxCursor,
  encodeInboxCursor,
  inboxItemBeforeCursor,
} from "../lib/inbox-cursor.js";
import { listBridgeTasks } from "../services/task-service.js";

function latestCommentByAuthor(comments: TaskComment[], authorType: TaskComment["authorType"]) {
  for (let index = comments.length - 1; index >= 0; index -= 1) {
    const entry = comments[index];
    if (!entry) continue;
    if (entry.authorType === authorType) return entry;
  }
  return null;
}

export function consumerStatus(task: BridgeTask | null): "sent" | "ready" {
  if (!task) return "sent";

  if (isTaskClaimed(task)) return "sent";
  if (isWorkDone(task)) return "ready";

  const lastHuman = latestCommentByAuthor(task.comments, "human");
  const lastSystem = latestCommentByAuthor(task.comments, "system");
  if (lastHuman && lastSystem) {
    const humanAt = Date.parse(lastHuman.at);
    const systemAt = Date.parse(lastSystem.at);
    if (!Number.isNaN(humanAt) && !Number.isNaN(systemAt) && humanAt > systemAt) {
      return "sent";
    }
  }
  if (lastSystem) return "ready";
  if (lastHuman && lastHuman.authorId !== task.createdBy) return "ready";
  return "sent";
}

export function mapComments(task: BridgeTask) {
  return task.comments.map((comment) => ({
    id: comment.id,
    authorType: comment.authorType,
    authorId: comment.authorId,
    tags: comment.tags,
    body: comment.body,
    at: comment.at,
    metadata: comment.metadata ?? null,
    by: comment.authorId,
    text: comment.body,
    role: comment.authorType === "human" ? "user" : "system",
  }));
}

function previewForTask(task: BridgeTask): string | null {
  const lastComment = task.comments.at(-1);
  const text = lastComment?.body ?? null;
  if (!text) return null;
  return text.length > 160 ? `${text.slice(0, 157)}...` : text;
}

function mapSubtaskSummary(
  task: BridgeTask,
  stageTitles: Map<string, string>,
  allTasks: BridgeTask[],
) {
  const stageId = resolveTaskStageId(allTasks, task) ?? task.stageId;
  const stageKey = stageId ? `${task.projectId}:${stageId}` : null;
  const workStatus = resolveWorkStatus(task);
  return {
    taskId: task.id,
    parentId: task.parentId,
    title: task.title,
    stageId,
    stageTitle: stageKey ? (stageTitles.get(stageKey) ?? stageId) : null,
    templateId: task.templateId,
    assignee: task.assignee,
    assigneeKind: task.assigneeKind,
    claimedBy: task.claimedBy,
    workStatus,
    workStatusLabel: workStatusLabel(workStatus),
    done: workStatus === "done",
  };
}

export async function mapTaskDetail(task: BridgeTask) {
  if (task.parentId === null) {
    await syncEpicStage(task.id);
    const refreshed = (await listBridgeTasks()).find((entry) => entry.id === task.id);
    if (refreshed) task = refreshed;
  }

  const stage = await getStageSnapshot(task.projectId, task.stageId);
  const allTasks = await listBridgeTasks();
  const stageTitles = getStageTitleLookup(task.projectId);
  const workflowSubtasks =
    task.parentId === null
      ? listEpicWorkflowTasks(allTasks, task.id)
      : listSubtasks(allTasks, task.id);
  const subtasks = workflowSubtasks.map((entry) => mapSubtaskSummary(entry, stageTitles, allTasks));
  const parent =
    task.parentId !== null
      ? allTasks.find((entry) => entry.id === task.parentId) ?? null
      : null;

  return {
    taskId: task.id,
    title: task.title,
    request: canonicalDescription(task),
    description: canonicalDescription(task),
    acceptanceCriteria: null,
    priority: task.priority,
    labels: task.labels,
    assignee: task.assignee,
    parentId: task.parentId,
    parent: parent
      ? {
          taskId: parent.id,
          title: parent.title,
          stageId: parent.stageId,
        }
      : null,
    subtasks,
    stageId: task.stageId,
    stage,
    workStatus: task.parentId !== null ? resolveWorkStatus(task) : null,
    workStatusLabel: task.parentId !== null ? workStatusLabel(resolveWorkStatus(task)) : null,
    isEpic: task.parentId === null,
    status: consumerStatus(task),
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    createdBy: task.createdBy,
    projectId: task.projectId,
    projectName: task.projectName,
    claimedBy: task.claimedBy,
    events: task.events,
    comments: mapComments(task),
    libraryLinks: listTaskLibraryLinks(task.id),
  };
}

function parseActivityTime(item: {
  activityAt?: string | null;
  createdAt?: string | null;
}): number {
  const raw = item.activityAt ?? item.createdAt;
  if (!raw) return NaN;
  return Date.parse(raw);
}

function sortInboxByActivity<
  T extends { taskId: number; activityAt?: string | null; createdAt?: string | null },
>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const aTime = parseActivityTime(a);
    const bTime = parseActivityTime(b);
    if (!Number.isNaN(aTime) && !Number.isNaN(bTime) && aTime !== bTime) {
      return bTime - aTime;
    }
    return b.taskId - a.taskId;
  });
}

export async function buildInboxItems(query: {
  projectId?: string;
  commentsOnly?: boolean;
  epicsOnly?: boolean;
  cursor?: string;
  limit: number;
}) {
  const bridgeTasks = await listBridgeTasks();
  const stageTitles = new Map<string, string>();
  for (const task of bridgeTasks) {
    if (stageTitles.has(task.projectId)) continue;
    const lookup = getStageTitleLookup(task.projectId);
    for (const [stageId, title] of lookup.entries()) {
      stageTitles.set(`${task.projectId}:${stageId}`, title);
    }
    stageTitles.set(task.projectId, "loaded");
  }

  let items = bridgeTasks.map((task) => {
    const activityAt = task.updatedAt ?? task.claimedAt ?? task.createdAt;
    const stageKey = task.stageId ? `${task.projectId}:${task.stageId}` : null;
    return {
      taskId: task.id,
      title: task.title,
      preview: previewForTask(task),
      status: consumerStatus(task),
      activityAt,
      updatedAt: task.updatedAt ?? task.claimedAt ?? task.createdAt,
      createdAt: task.createdAt,
      done: isDoneStage(task.stageId),
      parentId: task.parentId,
      projectId: task.projectId,
      projectName: task.projectName,
      createdBy: task.createdBy,
      claimedBy: task.claimedBy,
      assignee: task.assignee,
      stageId: task.stageId,
      stageTitle: stageKey ? (stageTitles.get(stageKey) ?? task.stageId) : null,
    };
  });

  if (query.projectId) {
    items = items.filter((item) => item.projectId === query.projectId);
  }
  if (query.commentsOnly) {
    items = items.filter((item) => item.status === "ready");
  }
  if (query.epicsOnly) {
    items = items.filter((item) => item.parentId === null);
  }

  items = sortInboxByActivity(items);

  if (query.cursor) {
    const decoded = decodeInboxCursor(query.cursor);
    if (!decoded) throw new AppError("Invalid cursor", 400);
    const cursorTime = Date.parse(decoded.activityAt);
    items = items.filter((item) =>
      inboxItemBeforeCursor(item, cursorTime, decoded.taskId, parseActivityTime),
    );
  }

  const slice = items.slice(0, query.limit + 1);
  const hasMore = slice.length > query.limit;
  const pageItems = hasMore ? slice.slice(0, query.limit) : slice;
  const lastItem = pageItems[pageItems.length - 1];

  return {
    items: pageItems,
    limit: query.limit,
    nextCursor: hasMore && lastItem ? encodeInboxCursor(lastItem) : null,
    hasMore,
  };
}
