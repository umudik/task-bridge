import {
  getWorkflowStageRow,
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
import { getBridgeTask, listBridgeTasks, transitionBridgeTask } from "./task-service.js";
import { mutateTaskRow } from "../db/tasks-db.js";
import { touchTask } from "../domain/task.js";
import { spawnEpicWorkflowGraph, spawnUnlockedWorkflowTasks } from "./workflow-spawn-service.js";

export function isEpic(task: BridgeTask): boolean {
  return task.parentId === null;
}

function stageTemplateInput(row: WorkflowStageRow) {
  return {
    taskTemplatesJson: row.task_templates_json,
    spawnTaskCount: row.spawn_task_count ?? 0,
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

  return ordered[ordered.length - 1]?.id ?? null;
}

export async function syncEpicStage(epicId: number): Promise<BridgeTask | null> {
  const epic = await getBridgeTask(epicId);
  if (!epic || epic.parentId !== null) return epic;

  const rows = listWorkflowStageRows(epic.projectId).sort((a, b) => a.position - b.position);
  let current = epic;
  for (let pass = 0; pass < rows.length + 1; pass += 1) {
    const allTasks = await listBridgeTasks();
    const subtasks = listEpicWorkflowTasks(allTasks, epicId);
    const nextStageId = computeEpicStageId(rows, subtasks);
    if (!nextStageId || nextStageId === current.stageId) break;
    current =
      (await transitionBridgeTask(epicId, {
        stageId: nextStageId,
        by: "workflow",
      })) ?? current;
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

  const epicId = source.epicId ?? resolveEpicId(tasks, source);
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

export function collectTodoCascadeTaskIds(
  tasks: BridgeTask[],
  source: BridgeTask,
  stageRows: WorkflowStageRow[],
): number[] {
  const ids = new Set<number>();
  for (const descendantId of listDescendantIds(tasks, source.id)) {
    ids.add(descendantId);
  }
  for (const laterId of collectLaterStageTodoCascadeIds(tasks, source, stageRows)) {
    ids.add(laterId);
  }
  return [...ids];
}

export async function applyTodoCascadeFromTask(
  source: BridgeTask,
  by: string,
  options?: { laterStages?: boolean; descendants?: boolean },
): Promise<void> {
  const includeLaterStages = options?.laterStages !== false;
  const includeDescendants = options?.descendants !== false;
  const tasks = await listBridgeTasks();
  const epicId = source.epicId ?? resolveEpicId(tasks, source);
  const projectId = tasks.find((task) => task.id === epicId)?.projectId ?? source.projectId;
  const stageRows = epicId ? listWorkflowStageRows(projectId) : [];

  const ids = new Set<number>();
  if (includeDescendants) {
    for (const descendantId of listDescendantIds(tasks, source.id)) {
      ids.add(descendantId);
    }
  }
  if (includeLaterStages) {
    for (const laterId of collectLaterStageTodoCascadeIds(tasks, source, stageRows)) {
      ids.add(laterId);
    }
  }

  const at = new Date().toISOString();
  for (const cascadeId of ids) {
    mutateTaskRow(cascadeId, (task) => {
      if (task.workStatus === "todo") return;
      task.workStatus = "todo";
      task.events.push({
        type: "spec_updated",
        at,
        by,
        note: `work_status:todo:cascade:${source.id}`,
      });
      touchTask(task);
    });
  }
}

export async function updateTaskWorkStatus(
  taskId: number,
  workStatus: WorkStatus,
  by: string,
): Promise<BridgeTask | null> {
  const existing = await getBridgeTask(taskId);
  if (!existing || existing.parentId === null) {
    return existing;
  }
  const tasksForPolicy = await listBridgeTasks();
  assertCanAdvanceWorkStatus(tasksForPolicy, existing, workStatus);

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
    await applyTodoCascadeFromTask(updated, by, {
      laterStages: workStatus === "todo",
      descendants: true,
    });
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
  return listEpicWorkflowTasks(tasks, epicId);
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
