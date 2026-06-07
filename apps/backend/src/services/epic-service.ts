import {
  getWorkflowStageRow,
  listWorkflowStageRows,
} from "../db/workflow-db.js";
import { isWorkDone, type WorkStatus } from "../domain/work-status.js";
import {
  listEpicWorkflowTasks,
  listSubtasks,
  resolveEpicId,
  type BridgeTask,
} from "../domain/task.js";
import { getBridgeTask, listBridgeTasks, transitionBridgeTask } from "./task-service.js";
import { mutateTaskRow } from "../db/tasks-db.js";
import { touchTask } from "../domain/task.js";
import { spawnEpicWorkflowGraph, spawnUnlockedWorkflowTasks } from "./workflow-spawn-service.js";

export function isEpic(task: BridgeTask): boolean {
  return task.parentId === null;
}

export function computeEpicStageId(
  stages: { id: string; position: number }[],
  subtasks: BridgeTask[],
): string | null {
  const ordered = [...stages].sort((a, b) => a.position - b.position);
  if (ordered.length === 0) return null;
  if (subtasks.length === 0) return ordered[0]?.id ?? null;

  for (const stage of ordered) {
    const stageTasks = subtasks.filter((task) => task.stageId === stage.id);
    const hasIncomplete = stageTasks.some((task) => !isWorkDone(task));
    if (hasIncomplete) return stage.id;
  }

  return ordered[ordered.length - 1]?.id ?? null;
}

export async function syncEpicStage(epicId: number): Promise<BridgeTask | null> {
  const epic = await getBridgeTask(epicId);
  if (!epic || epic.parentId !== null) return epic;

  const rows = listWorkflowStageRows(epic.projectId).sort((a, b) => a.position - b.position);
  const stages = rows.map((row) => ({ id: row.id, position: row.position }));
  const allTasks = await listBridgeTasks();
  const subtasks = listEpicWorkflowTasks(allTasks, epic.id);
  const nextStageId = computeEpicStageId(stages, subtasks);
  if (!nextStageId || nextStageId === epic.stageId) return epic;

  const transitioned =
    (await transitionBridgeTask(epicId, {
      stageId: nextStageId,
      by: "workflow",
    })) ?? epic;
  await spawnUnlockedWorkflowTasks(transitioned);
  return transitioned;
}

export async function spawnEpicWorkflow(epic: BridgeTask): Promise<BridgeTask[]> {
  return spawnEpicWorkflowGraph(epic);
}

export async function updateTaskWorkStatus(
  taskId: number,
  workStatus: WorkStatus,
  by: string,
): Promise<BridgeTask | null> {
  const updated = mutateTaskRow(taskId, (task) => {
    if (task.parentId === null) return;
    task.workStatus = workStatus;
    const at = new Date().toISOString();
    task.events.push({
      type: "spec_updated",
      at,
      by,
      note: `work_status:${workStatus}`,
    });
    touchTask(task);
  });
  if (!updated || updated.parentId === null) {
    return updated;
  }
  const allTasks = await listBridgeTasks();
  const epicId = updated.epicId ?? resolveEpicId(allTasks, updated);
  if (!epicId) return updated;
  const epic = await getBridgeTask(epicId);
  if (!epic) return updated;
  await spawnUnlockedWorkflowTasks(epic);
  await syncEpicStage(epicId);
  return updated;
}

export async function listEpicSubtasks(epicId: number): Promise<BridgeTask[]> {
  const tasks = await listBridgeTasks();
  return listSubtasks(tasks, epicId);
}

export async function getEpicWithStage(epicId: number) {
  const epic = await getBridgeTask(epicId);
  if (!epic || epic.parentId !== null) return null;
  const synced = (await syncEpicStage(epicId)) ?? epic;
  const row = synced.stageId ? getWorkflowStageRow(synced.projectId, synced.stageId) : null;
  return {
    epic: synced,
    stageTitle: row?.title ?? synced.stageId,
  };
}
