import {
  listWorkflowStageRows,
  type WorkflowStageRow,
} from "../db/workflow-db.js";
import { isWorkDone, type WorkStatus } from "../domain/work-status.js";
import {
  assertCanAdvanceWorkStatus,
  listDescendantIds,
  listEpicWorkflowTasks,
  resolveEpicId,
  resolveTaskStageId,
  type BridgeTask,
} from "../domain/task.js";
import { stageHasActionableTemplates } from "../domain/workflow-stage.js";
import {
  buildEpicClaimIndex,
  normalizeClaimActor,
  type ClaimActor,
  workflowUpdateBlockReason,
} from "./task-claim-policy.js";
import { AppError } from "../errors/app-error.js";
import { getBridgeTask, listBridgeTasks, transitionBridgeTask } from "./task-service.js";
import { deleteTaskRows, mutateTaskRow } from "../db/tasks-db.js";
import { touchTask } from "../domain/task.js";
import { spawnEpicWorkflowGraph, spawnUnlockedWorkflowTasks } from "./workflow-spawn-service.js";
import {
  resetWorkflowStateNodesForTasks,
  rollbackEpicWorkflowFromStage,
  syncEpicWorkflowStage,
  syncTaskIntoWorkflowState,
} from "./workflow-state-service.js";

export function isEpic(task: BridgeTask): boolean {
  return task.parentId === null;
}

function stageTemplateInput(row: WorkflowStageRow) {
  return {
    taskTemplatesJson: row.task_templates_json,
    stageId: row.id,
    stageTitle: row.title,
  };
}

export function computeEpicStageId(
  stageRows: WorkflowStageRow[],
  subtasks: BridgeTask[],
): string | null {
  const ordered = [...stageRows].sort((a, b) => a.position - b.position);
  if (ordered.length === 0) return null;

  for (const row of ordered) {
    if (!stageHasActionableTemplates(stageTemplateInput(row))) continue;

    const stageTasks = subtasks.filter(
      (task) => resolveTaskStageId(subtasks, task) === row.id,
    );
    const hasIncomplete = stageTasks.some((task) => !isWorkDone(task));
    if (hasIncomplete || stageTasks.length === 0) return row.id;
  }

  const last = ordered[ordered.length - 1];
  if (last != null) {
    return last.id;
  }
  return null;
}

export async function syncEpicStage(epicId: number): Promise<BridgeTask | null> {
  const epic = await getBridgeTask(epicId);
  if (!epic || epic.parentId !== null) return epic;

  const rows = listWorkflowStageRows({ projectId: epic.projectId, stageId: "" }).sort((a, b) => a.position - b.position);
  let current = epic;
  for (let pass = 0; pass < rows.length + 1; pass += 1) {
    const allTasks = await listBridgeTasks();
    const subtasks = listEpicWorkflowTasks(allTasks, epicId);
    const nextStageId = computeEpicStageId(rows, subtasks);
    if (!nextStageId || nextStageId === current.stageId) break;
    const transitioned = await transitionBridgeTask(epicId, {
      stageId: nextStageId,
      assignee: null,
      by: "workflow",
    });
    if (transitioned != null) {
      current = transitioned;
      syncEpicWorkflowStage(epicId, nextStageId);
    }
  }
  await spawnUnlockedWorkflowTasks(current);
  return current;
}

export async function spawnEpicWorkflow(epic: BridgeTask): Promise<BridgeTask[]> {
  return spawnEpicWorkflowGraph(epic);
}

export function collectLaterStageTodoCascadeIds(
  tasks: BridgeTask[],
  source: BridgeTask,
  stageRows: WorkflowStageRow[],
): number[] {
  const stageId = resolveTaskStageId(tasks, source);
  if (!stageId) return [];

  let epicId: number | null;
  if (source.epicId !== null && source.epicId !== null) {
    epicId = source.epicId;
  } else {
    epicId = resolveEpicId(tasks, source);
  }
  if (!epicId) return [];

  const ordered = [...stageRows].sort((a, b) => a.position - b.position);
  const stageIndex = ordered.findIndex((row) => row.id === stageId);
  if (stageIndex < 0) return [];

  const ids = new Set<number>();
  const laterStageIds = new Set(ordered.slice(stageIndex + 1).map((row) => row.id));
  for (const task of listEpicWorkflowTasks(tasks, epicId)) {
    if (task.id === source.id) continue;
    const taskStageId = resolveTaskStageId(tasks, task);
    if (!taskStageId || !laterStageIds.has(taskStageId)) continue;
    ids.add(task.id);
    for (const descendantId of listDescendantIds(tasks, task.id)) {
      ids.add(descendantId);
    }
  }

  return [...ids];
}

export async function applyTodoCascadeFromTask(
  source: BridgeTask,
  by: string,
  options: { laterStages: boolean | null; descendants: boolean | null } | null,
): Promise<void> {
  const includeLaterStages = options === null || options.laterStages !== false;
  const includeDescendants = options === null || options.descendants !== false;
  const tasks = await listBridgeTasks();

  let epicId: number | null;
  if (source.epicId !== null && source.epicId !== null) {
    epicId = source.epicId;
  } else {
    epicId = resolveEpicId(tasks, source);
  }

  let epicTask: BridgeTask | null;
  if (epicId != null) {
    const found = tasks.find((task) => task.id === epicId);
    if (found != null) {
      epicTask = found;
    } else {
      epicTask = null;
    }
  } else {
    epicTask = null;
  }

  let projectId: string;
  if (epicTask != null) {
    projectId = epicTask.projectId;
  } else {
    projectId = source.projectId;
  }

  const stageRows = epicId !== null ? listWorkflowStageRows({ projectId, stageId: "" }) : [];
  const sourceStageId = resolveTaskStageId(tasks, source);

  const deleteIds = new Set<number>();
  const resetIds = new Set<number>();
  if (includeDescendants) {
    for (const descendantId of listDescendantIds(tasks, source.id)) {
      resetIds.add(descendantId);
    }
  }
  if (includeLaterStages) {
    for (const laterId of collectLaterStageTodoCascadeIds(tasks, source, stageRows)) {
      deleteIds.add(laterId);
      resetIds.delete(laterId);
    }
  }

  deleteTaskRows([...deleteIds]);

  const at = new Date().toISOString();
  for (const cascadeId of resetIds) {
    mutateTaskRow(cascadeId, (task) => {
      if (task.workStatus === "todo") return;
      task.workStatus = "todo";
      task.claimedBy = null;
      task.claimedAt = null;
      task.events.push({
        type: "spec_updated",
        at,
        by,
        note: `work_status:todo:cascade:${source.id}`,
      });
      touchTask(task);
    });
  }

  if (epicId !== null && sourceStageId) {
    if (deleteIds.size > 0) {
      rollbackEpicWorkflowFromStage(epicId, sourceStageId, projectId);
    }
    resetWorkflowStateNodesForTasks(epicId, resetIds);
  }
}

export async function updateTaskWorkStatus(
  taskId: number,
  workStatus: WorkStatus,
  by: string,
  actor: ClaimActor,
): Promise<BridgeTask | null> {
  const existing = await getBridgeTask(taskId);
  if (!existing || existing.parentId === null) {
    return existing;
  }
  const tasksForPolicy = await listBridgeTasks();
  assertCanAdvanceWorkStatus(tasksForPolicy, existing, workStatus);

  const normalized = normalizeClaimActor(actor);
  const index = buildEpicClaimIndex(tasksForPolicy);
  const blockReason = workflowUpdateBlockReason(existing, index, normalized, workStatus);
  if (blockReason) {
    throw new AppError(blockReason, 409);
  }

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

  if (workStatus === "todo" || workStatus === "in_progress") {
    const reopening = isWorkDone(existing);
    await applyTodoCascadeFromTask(updated, by, {
      laterStages: workStatus === "todo" || reopening,
      descendants: true,
    });
  }
  syncTaskIntoWorkflowState(updated);
  const allTasks = await listBridgeTasks();

  let epicId: number | null;
  if (updated.epicId !== null && updated.epicId !== null) {
    epicId = updated.epicId;
  } else {
    epicId = resolveEpicId(allTasks, updated);
  }

  if (!epicId) return updated;
  const epic = await getBridgeTask(epicId);
  if (!epic) return updated;
  await spawnUnlockedWorkflowTasks(epic);
  await syncEpicStage(epicId);
  return updated;
}

export async function listEpicSubtasks(epicId: number): Promise<BridgeTask[]> {
  const tasks = await listBridgeTasks();
  return listEpicWorkflowTasks(tasks, epicId);
}

export async function getEpicWithStage(epicId: number) {
  const epic = await getBridgeTask(epicId);
  if (!epic || epic.parentId !== null) return null;
  const rawSynced = await syncEpicStage(epicId);
  let synced: BridgeTask;
  if (rawSynced != null) {
    synced = rawSynced;
  } else {
    synced = epic;
  }
  const stageRows =
    synced.stageId !== null && synced.stageId !== ""
      ? listWorkflowStageRows({ projectId: synced.projectId, stageId: synced.stageId })
      : [];
  let stageTitle: string | null;
  if (stageRows.length > 0) {
    const firstRow = stageRows[0];
    if (firstRow == null) {
      throw new Error("Expected stageRows[0] to exist but it was missing");
    }
    stageTitle = firstRow.title;
  } else {
    stageTitle = synced.stageId;
  }
  return {
    epic: synced,
    stageTitle,
  };
}
