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

export function userAwaitingReply(task: BridgeTask): boolean {
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

export function taskIsClaimable(task: BridgeTask): boolean {
  if (task.status === "in_progress") return false;
  if (task.status === "done" && !userAwaitingReply(task)) return false;
  if (userAwaitingReply(task)) return true;
  if (task.status === "open") return true;
  return false;
}

export function turnIdForTask(task: BridgeTask): string {
  const comments = Array.isArray(task.comments) ? task.comments : [];
  const lastHuman = latestCommentByAuthor(comments, "human");
  if (lastHuman && userAwaitingReply(task)) {
    return `user-${lastHuman.id}`;
  }
  if (task.status === "in_progress" && task.claimedAt) return `claimed-${task.claimedAt}`;
  return `create-${task.createdAt}`;
}

function claimPriority(task: BridgeTask): number {
  if (userAwaitingReply(task)) return 0;
  if (task.status === "open") return 1;
  return 3;
}

function sortClaimableTasks(tasks: BridgeTask[]): BridgeTask[] {
  return [...tasks].sort((a, b) => {
    const priority = claimPriority(a) - claimPriority(b);
    if (priority !== 0) return priority;
    return b.id - a.id;
  });
}

function resolveWorkspacePath(task: BridgeTask): string | null {
  return getProjectById(task.projectId)?.repoPath?.trim() || null;
}

function buildClaimPayload(task: BridgeTask, turnId: string): TaskClaimPayload {
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

export type TaskClaimPayload = {
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

export async function listPendingTasks(): Promise<TaskClaimPayload[]> {
  const tasks = await listBridgeTasks();
  return sortClaimableTasks(tasks.filter(taskIsClaimable)).map((task) =>
    buildClaimPayload(task, turnIdForTask(task)),
  );
}

export async function claimNextTask(
  claimedBy: string,
  options?: { projectId?: string },
): Promise<{ task: BridgeTask; item: TaskClaimPayload } | null> {
  const tasks = await listBridgeTasks();
  const candidates = sortClaimableTasks(
    tasks.filter((task) => {
      if (options?.projectId && task.projectId !== options.projectId) return false;
      return taskIsClaimable(task) && task.status === "open";
    }),
  );

  for (const candidate of candidates) {
    const claimed = await claimBridgeTask(candidate.id, claimedBy);
    if (!claimed) continue;
    return {
      task: claimed,
      item: buildClaimPayload(claimed, turnIdForTask(claimed)),
    };
  }

  return null;
}
