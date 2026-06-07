import {
  canonicalDescription,
  isDoneStage,
  isTaskClaimed,
  listSubtasks,
  type BridgeTask,
  type TaskComment,
} from "../domain/task.js";
import { resolveWorkStatus, workStatusLabel } from "../domain/work-status.js";
import { syncEpicStage } from "../services/epic-service.js";
import { getStageSnapshot, getStageTitleLookup } from "../services/workflow-service.js";
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

  const lastHuman = latestCommentByAuthor(task.comments, "human");
  const lastAi = latestCommentByAuthor(task.comments, "ai");
  if (lastHuman && lastAi) {
    const humanAt = Date.parse(lastHuman.at);
    const aiAt = Date.parse(lastAi.at);
    if (!Number.isNaN(humanAt) && !Number.isNaN(aiAt) && humanAt > aiAt) {
      return "sent";
    }
  }

  if (isTaskClaimed(task)) return "sent";
  if (task.aiSummary || task.answer || task.answeredAt) return "ready";
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
    role: comment.authorType === "human" ? "user" : "assistant",
  }));
}

function previewForTask(task: BridgeTask): string | null {
  if (!task.answer) return null;
  const text = task.answer;
  return text.length > 160 ? `${text.slice(0, 157)}...` : text;
}

function mapSubtaskSummary(task: BridgeTask, stageTitles: Map<string, string>) {
  const stageKey = task.stageId ? `${task.projectId}:${task.stageId}` : null;
  const workStatus = resolveWorkStatus(task);
  return {
    taskId: task.id,
    title: task.title,
    stageId: task.stageId,
    stageTitle: stageKey ? (stageTitles.get(stageKey) ?? task.stageId) : null,
    assignee: task.assignee,
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

  const createdTime = Date.parse(task.createdAt);
  const answeredTime = task.answeredAt ? Date.parse(task.answeredAt) : NaN;
  const durationMs =
    !Number.isNaN(createdTime) && !Number.isNaN(answeredTime)
      ? Math.max(0, answeredTime - createdTime)
      : null;
  const stage = await getStageSnapshot(task.projectId, task.stageId);
  const allTasks = await listBridgeTasks();
  const stageTitles = getStageTitleLookup(task.projectId);
  const subtasks = listSubtasks(allTasks, task.id).map((entry) =>
    mapSubtaskSummary(entry, stageTitles),
  );
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
    aiSummary: task.aiSummary,
    aiContext: task.aiContext,
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
    answer: task.aiSummary ?? task.answer,
    status: consumerStatus(task),
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    answeredAt: task.answeredAt,
    durationMs,
    createdBy: task.createdBy,
    answeredBy: task.answeredBy,
    projectId: task.projectId,
    projectName: task.projectName,
    claimedBy: task.claimedBy,
    events: task.events,
    comments: mapComments(task),
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
  page: number;
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
    const activityAt = task.answeredAt ?? task.claimedAt ?? task.createdAt;
    const stageKey = task.stageId ? `${task.projectId}:${task.stageId}` : null;
    return {
      taskId: task.id,
      title: task.title,
      preview: previewForTask(task),
      status: consumerStatus(task),
      activityAt,
      updatedAt: task.answeredAt ?? task.claimedAt ?? task.createdAt,
      createdAt: task.createdAt,
      answeredAt: task.answeredAt,
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

  items = sortInboxByActivity(items);
  const total = items.length;
  const offset = (query.page - 1) * query.limit;
  const pageItems = items.slice(offset, offset + query.limit);

  return {
    items: pageItems,
    total,
    page: query.page,
    limit: query.limit,
    totalPages: Math.max(1, Math.ceil(total / query.limit)),
  };
}
