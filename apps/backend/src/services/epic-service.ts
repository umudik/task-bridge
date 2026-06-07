import {
  getWorkflowStageRow,
  listWorkflowStageRows,
} from "../db/workflow-db.js";
import {
  resolveStageTaskTemplates,
} from "../domain/workflow-stage.js";
import { isWorkDone, type WorkStatus } from "../domain/work-status.js";
import { listSubtasks, type BridgeTask } from "../domain/task.js";
import {
  allocateTaskId,
  getBridgeTask,
  listBridgeTasks,
  transitionBridgeTask,
  upsertBridgeTask,
} from "./task-service.js";
import { mutateTaskRow } from "../db/tasks-db.js";
import { touchTask } from "../domain/task.js";
import { pickMemberByProjectRole } from "./workflow-service.js";

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
  const subtasks = listSubtasks(allTasks, epic.id);
  const nextStageId = computeEpicStageId(stages, subtasks);
  if (!nextStageId || nextStageId === epic.stageId) return epic;

  return (
    (await transitionBridgeTask(epicId, {
      stageId: nextStageId,
      by: "workflow",
    })) ?? epic
  );
}

export async function spawnEpicWorkflow(epic: BridgeTask): Promise<BridgeTask[]> {
  if (epic.parentId !== null) return [];

  const rows = listWorkflowStageRows(epic.projectId).sort((a, b) => a.position - b.position);
  const allTasks = await listBridgeTasks();
  const existing = listSubtasks(allTasks, epic.id);
  const created: BridgeTask[] = [];

  for (const row of rows) {
    const templates = resolveStageTaskTemplates({
      taskTemplatesJson: row.task_templates_json,
      spawnTaskCount: row.spawn_task_count ?? 0,
      stageId: row.id,
      stageTitle: row.title,
    });
    if (templates.length === 0) continue;

    const existingForStage = existing.filter((task) => task.stageId === row.id);
    for (let index = existingForStage.length; index < templates.length; index += 1) {
      const template = templates[index];
      if (!template) continue;

      let assignee: string | null = null;
      if (template.assigneeRole?.trim()) {
        assignee = await pickMemberByProjectRole(epic.projectId, template.assigneeRole);
      } else {
        const autoAssignRole = row.auto_assign_role?.trim() ?? "";
        if (autoAssignRole) {
          assignee = await pickMemberByProjectRole(epic.projectId, autoAssignRole);
        }
      }

      const id = await allocateTaskId();
      const task = await upsertBridgeTask({
        id,
        projectId: epic.projectId,
        projectName: epic.projectName,
        title: template.title,
        description: template.description ?? "",
        createdBy: "workflow",
        parentId: epic.id,
        stageId: row.id,
        assignee,
        workStatus: "todo",
      });
      created.push(task);
    }
  }

  return created;
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
  if (updated?.parentId) {
    await syncEpicStage(updated.parentId);
  }
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
