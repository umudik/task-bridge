import type { BridgeTask, TaskComment } from "../domain/task.js";
import { canonicalDescription, isTaskClaimed } from "../domain/task.js";
import { resolveWorkStatus } from "../domain/work-status.js";
import { emptyToNull } from "../lib/strings.js";
import { getProjectById } from "./project-registry.js";
import {
  buildEpicClaimIndex,
  canActorClaimTask,
  type ClaimActor,
  isWorkflowClaimable,
  normalizeClaimActor,
  sortWorkflowClaimCandidates,
  userAwaitingReply,
  workflowClaimBlockReason,
} from "./task-claim-policy.js";
import { claimBridgeTask, listBridgeTasks } from "./task-service.js";

export { userAwaitingReply } from "./task-claim-policy.js";

export function turnIdForTask(task: BridgeTask): string {
  if (userAwaitingReply(task)) {
    for (let index = task.comments.length - 1; index >= 0; index -= 1) {
      const comment = task.comments[index];
      if (comment?.authorType === "human") return `user-${comment.id}`;
    }
  }
  if (isTaskClaimed(task) && task.claimedAt) return `claimed-${task.claimedAt}`;
  return `create-${task.createdAt}`;
}

function resolveWorkspacePath(task: BridgeTask): string | null {
  return emptyToNull(getProjectById(task.projectId)?.repoPath);
}

function buildClaimPayload(task: BridgeTask, turnId: string): TaskClaimPayload {
  return {
    taskId: task.id,
    turnId,
    projectId: task.projectId,
    projectName: task.projectName,
    parentId: task.parentId,
    epicId: task.parentId,
    title: task.title,
    description: canonicalDescription(task),
    workspacePath: resolveWorkspacePath(task),
    stageId: task.stageId,
    workStatus: task.parentId !== null ? resolveWorkStatus(task) : null,
    createdAt: task.createdAt,
    comments: task.comments,
  };
}

export type TaskClaimPayload = {
  taskId: number;
  turnId: string;
  projectId: string;
  projectName: string;
  parentId: number | null;
  epicId: number | null;
  title: string;
  description: string;
  workspacePath: string | null;
  stageId: string | null;
  workStatus: ReturnType<typeof resolveWorkStatus> | null;
  createdAt: string;
  comments: TaskComment[];
};

function scopeTasks(tasks: BridgeTask[], projectId?: string): BridgeTask[] {
  if (!projectId) return tasks;
  return tasks.filter((task) => task.projectId === projectId);
}

export async function listPendingTasks(
  projectId?: string,
  rawActor?: ClaimActor,
): Promise<TaskClaimPayload[]> {
  const actor = rawActor ? normalizeClaimActor(rawActor) : undefined;
  const tasks = scopeTasks(await listBridgeTasks(), projectId);
  const index = buildEpicClaimIndex(tasks);
  return sortWorkflowClaimCandidates(
    tasks.filter((task) => isWorkflowClaimable(task, index, actor)),
    index,
  ).map((task) => buildClaimPayload(task, turnIdForTask(task)));
}

export async function claimNextTask(
  rawActor: ClaimActor,
  options?: { projectId?: string },
): Promise<{ task: BridgeTask; item: TaskClaimPayload } | null> {
  const actor = normalizeClaimActor(rawActor);
  const tasks = scopeTasks(await listBridgeTasks(), options?.projectId);
  const index = buildEpicClaimIndex(tasks);
  const candidates = sortWorkflowClaimCandidates(
    tasks.filter((task) => canActorClaimTask(task, index, actor)),
    index,
  );

  for (const candidate of candidates) {
    const claimed = await claimBridgeTask(candidate.id, actor.claimedBy);
    if (!claimed) continue;
    return {
      task: claimed,
      item: buildClaimPayload(claimed, turnIdForTask(claimed)),
    };
  }

  return null;
}

export async function validateTaskClaim(taskId: number, rawActor: ClaimActor): Promise<string | null> {
  const actor = normalizeClaimActor(rawActor);
  const tasks = await listBridgeTasks();
  const task = tasks.find((entry) => entry.id === taskId);
  if (!task) return "Task not found";
  const index = buildEpicClaimIndex(tasks);
  if (canActorClaimTask(task, index, actor)) return null;
  if (isTaskClaimed(task) && !userAwaitingReply(task)) return "Task is already claimed";
  return workflowClaimBlockReason(task, index, actor);
}
