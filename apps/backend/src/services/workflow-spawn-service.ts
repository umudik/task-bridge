import type { WorkflowStageRow } from "../db/workflow-db.js";
import { listWorkflowStageRows } from "../db/workflow-db.js";
import {
  collectSpawnableTemplates,
  templateKind,
  type TemplateSpawnContext,
} from "../domain/task-template-graph.js";
import { isWorkDone } from "../domain/work-status.js";
import { listEpicWorkflowTasks, type BridgeTask } from "../domain/task.js";
import { resolveStageTaskTemplateRoots, type StageTaskTemplate } from "../domain/workflow-stage.js";
import { computeEpicStageId } from "./epic-service.js";
import { allocateTaskId, listBridgeTasks, upsertBridgeTask } from "./task-service.js";
import { pickMemberByProjectRole } from "./workflow-service.js";

function buildSpawnContext(
  stageRow: WorkflowStageRow,
  workflowTasks: BridgeTask[],
  stages: { id: string; position: number }[],
): TemplateSpawnContext {
  const activeStageId = computeEpicStageId(stages, workflowTasks);
  const activeStage = stages.find((stage) => stage.id === activeStageId) ?? stages[0];
  const spawnedTemplateIds = new Set(
    workflowTasks
      .map((task) => task.templateId)
      .filter((templateId): templateId is string => Boolean(templateId)),
  );
  const doneTemplateIds = new Set(
    workflowTasks
      .filter((task) => task.templateId && isWorkDone(task))
      .map((task) => task.templateId as string),
  );

  return {
    stageId: stageRow.id,
    stagePosition: stageRow.position,
    activeStagePosition: activeStage?.position ?? stageRow.position,
    spawnedTemplateIds,
    doneTemplateIds,
  };
}

async function spawnTemplateTask(input: {
  epic: BridgeTask;
  stageRow: WorkflowStageRow;
  template: { id: string; title: string; description?: string; assigneeRole?: string };
  parentTaskId: number;
}): Promise<BridgeTask> {
  let assignee: string | null = null;
  if (input.template.assigneeRole?.trim()) {
    assignee = await pickMemberByProjectRole(input.epic.projectId, input.template.assigneeRole);
  } else {
    const autoAssignRole = input.stageRow.auto_assign_role?.trim() ?? "";
    if (autoAssignRole) {
      assignee = await pickMemberByProjectRole(input.epic.projectId, autoAssignRole);
    }
  }

  const id = await allocateTaskId();
  return upsertBridgeTask({
    id,
    projectId: input.epic.projectId,
    projectName: input.epic.projectName,
    title: input.template.title,
    description: input.template.description ?? "",
    createdBy: "workflow",
    parentId: input.parentTaskId,
    epicId: input.epic.id,
    templateId: input.template.id,
    stageId: input.stageRow.id,
    assignee,
    workStatus: "todo",
  });
}

function resolveParentTaskId(
  epic: BridgeTask,
  workflowTasks: BridgeTask[],
  templateParentId: string | null,
): number {
  if (!templateParentId) return epic.id;
  const parent = workflowTasks.find((task) => task.templateId === templateParentId);
  return parent?.id ?? epic.id;
}

function findTemplateParentId(
  nodes: StageTaskTemplate[],
  templateId: string,
  parentTemplateId: string | null = null,
): string | null | undefined {
  for (const node of nodes) {
    if (node.id === templateId) return parentTemplateId;
    if (node.children?.length) {
      const nextParent = templateKind(node) === "task" ? node.id : parentTemplateId;
      const found = findTemplateParentId(node.children, templateId, nextParent);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

export async function spawnUnlockedWorkflowTasks(epic: BridgeTask): Promise<BridgeTask[]> {
  if (epic.parentId !== null) return [];

  const rows = listWorkflowStageRows(epic.projectId).sort((a, b) => a.position - b.position);
  const stages = rows.map((row) => ({ id: row.id, position: row.position }));
  const allTasks = await listBridgeTasks();
  const workflowTasks = listEpicWorkflowTasks(allTasks, epic.id);
  const created: BridgeTask[] = [];

  for (const row of rows) {
    const roots = resolveStageTaskTemplateRoots({
      taskTemplatesJson: row.task_templates_json,
      spawnTaskCount: row.spawn_task_count ?? 0,
      stageId: row.id,
      stageTitle: row.title,
    });
    if (roots.length === 0) continue;

    const ctx = buildSpawnContext(row, [...workflowTasks, ...created], stages);
    const spawnable = collectSpawnableTemplates(roots, ctx);

    for (const template of spawnable) {
      if (templateKind(template) === "group") continue;
      const templateParentId = findTemplateParentId(roots, template.id) ?? null;
      const parentTaskId = resolveParentTaskId(epic, [...workflowTasks, ...created], templateParentId);
      const task = await spawnTemplateTask({
        epic,
        stageRow: row,
        template,
        parentTaskId,
      });
      created.push(task);
      ctx.spawnedTemplateIds.add(template.id);
    }
  }

  return created;
}

export async function spawnEpicWorkflowGraph(epic: BridgeTask): Promise<BridgeTask[]> {
  return spawnUnlockedWorkflowTasks(epic);
}
