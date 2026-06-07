import { listWorkflowStageRows } from "../db/workflow-db.js";
import type { AuthorType, BridgeTask, TaskComment } from "../domain/task.js";
import { isWorkDone, resolveWorkStatus } from "../domain/work-status.js";
import { listEpicWorkflowTasks } from "../domain/task.js";
import { computeEpicStageId } from "./epic-service.js";

function latestCommentByAuthor(comments: TaskComment[], authorType: AuthorType) {
  for (let index = comments.length - 1; index >= 0; index -= 1) {
    const entry = comments[index];
    if (!entry) continue;
    if (entry.authorType === authorType) return entry;
  }
  return null;
}

export function userAwaitingReply(task: BridgeTask): boolean {
  const lastHuman = latestCommentByAuthor(task.comments, "human");
  const lastAi = latestCommentByAuthor(task.comments, "ai");
  if (!lastHuman) return false;
  if (!lastAi) return true;

  const humanAt = Date.parse(lastHuman.at);
  const aiAt = Date.parse(lastAi.at);
  if (Number.isNaN(humanAt) || Number.isNaN(aiAt)) return true;
  return humanAt > aiAt;
}

export type EpicClaimIndex = {
  activeStageByEpic: Map<number, string | null>;
  stagePositionByProject: Map<string, Map<string, number>>;
};

export function buildEpicClaimIndex(tasks: BridgeTask[]): EpicClaimIndex {
  const activeStageByEpic = new Map<number, string | null>();
  const stagePositionByProject = new Map<string, Map<string, number>>();
  const epics = tasks.filter((task) => task.parentId === null);

  for (const epic of epics) {
    if (!stagePositionByProject.has(epic.projectId)) {
      const positions = new Map<string, number>();
      for (const row of listWorkflowStageRows(epic.projectId).sort((a, b) => a.position - b.position)) {
        positions.set(row.id, row.position);
      }
      stagePositionByProject.set(epic.projectId, positions);
    }
    const positions = stagePositionByProject.get(epic.projectId) ?? new Map<string, number>();
    const stages = [...positions.entries()].map(([id, position]) => ({ id, position }));
    const subtasks = listEpicWorkflowTasks(tasks, epic.id);
    activeStageByEpic.set(epic.id, computeEpicStageId(stages, subtasks));
  }

  return { activeStageByEpic, stagePositionByProject };
}

export function isTaskOnEpicActiveStage(task: BridgeTask, index: EpicClaimIndex): boolean {
  if (!task.stageId) return false;
  const epicId = task.epicId ?? task.parentId;
  if (!epicId) return false;
  const activeStageId = index.activeStageByEpic.get(epicId);
  return activeStageId === task.stageId;
}

export function passesWorkflowClaimGate(task: BridgeTask, index: EpicClaimIndex): boolean {
  if (task.parentId === null) return false;
  if (isWorkDone(task)) return false;
  return isTaskOnEpicActiveStage(task, index);
}

export function isWorkflowClaimable(task: BridgeTask, index: EpicClaimIndex): boolean {
  if (userAwaitingReply(task)) return task.parentId !== null && !isWorkDone(task);
  if (task.claimedBy) return false;
  return passesWorkflowClaimGate(task, index);
}

function activeStageSortKey(task: BridgeTask, index: EpicClaimIndex): number {
  if (!task.parentId) return Number.MAX_SAFE_INTEGER;
  const positions = index.stagePositionByProject.get(task.projectId);
  const activeStageId = index.activeStageByEpic.get(task.parentId);
  if (!positions || !activeStageId) return Number.MAX_SAFE_INTEGER;
  return positions.get(activeStageId) ?? Number.MAX_SAFE_INTEGER;
}

function workStatusSortKey(task: BridgeTask): number {
  const status = resolveWorkStatus(task);
  if (status === "in_progress") return 0;
  if (status === "todo") return 1;
  return 2;
}

export function compareWorkflowClaimPriority(
  a: BridgeTask,
  b: BridgeTask,
  index: EpicClaimIndex,
): number {
  const awaitingA = userAwaitingReply(a) ? 0 : 1;
  const awaitingB = userAwaitingReply(b) ? 0 : 1;
  if (awaitingA !== awaitingB) return awaitingA - awaitingB;

  const stageA = activeStageSortKey(a, index);
  const stageB = activeStageSortKey(b, index);
  if (stageA !== stageB) return stageA - stageB;

  const epicA = a.epicId ?? a.parentId ?? Number.MAX_SAFE_INTEGER;
  const epicB = b.epicId ?? b.parentId ?? Number.MAX_SAFE_INTEGER;
  if (epicA !== epicB) return epicA - epicB;

  const workA = workStatusSortKey(a);
  const workB = workStatusSortKey(b);
  if (workA !== workB) return workA - workB;

  const createdA = Date.parse(a.createdAt);
  const createdB = Date.parse(b.createdAt);
  if (!Number.isNaN(createdA) && !Number.isNaN(createdB) && createdA !== createdB) {
    return createdA - createdB;
  }

  return a.id - b.id;
}

export function sortWorkflowClaimCandidates(tasks: BridgeTask[], index: EpicClaimIndex): BridgeTask[] {
  return [...tasks].sort((a, b) => compareWorkflowClaimPriority(a, b, index));
}

export function workflowClaimBlockReason(task: BridgeTask, index: EpicClaimIndex): string | null {
  if (task.parentId === null) return "Epics cannot be claimed";
  if (isWorkDone(task)) return "Task is already done";
  if (!isTaskOnEpicActiveStage(task, index)) {
    const epicId = task.epicId ?? task.parentId;
    const activeStageId = epicId ? index.activeStageByEpic.get(epicId) : null;
    if (!activeStageId) return "Epic has no active pipeline step";
    return `Task is on a later pipeline step; epic is at "${activeStageId}"`;
  }
  return null;
}
