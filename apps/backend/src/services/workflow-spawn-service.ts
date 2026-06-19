import type { WorkflowStageRow } from "../db/workflow-db.js";
import { listWorkflowStageRows } from "../db/workflow-db.js";
import {
  collectSpawnableTemplates,
  templateKind,
  type TemplateSpawnContext,
} from "../domain/task-template-graph.js";
import { isWorkDone } from "../domain/work-status.js";
import { listEpicWorkflowTasks, type BridgeTask } from "../domain/task.js";
import {
  resolveStageTaskTemplateRoots,
  stageHasActionableTemplates,
  type StageTaskTemplate,
} from "../domain/workflow-stage.js";
import { emptyToNull } from "../lib/strings.js";
import { computeEpicStageId } from "./epic-service.js";
import { allocateTaskId, listBridgeTasks, upsertBridgeTask } from "./task-service.js";
import { pickMemberByProjectRole } from "./workflow-service.js";

function buildSpawnContext(
  stageRow: WorkflowStageRow,
  workflowTasks: BridgeTask[],
  stageRows: WorkflowStageRow[],
): TemplateSpawnContext {
  const activeStageId = computeEpicStageId(stageRows, workflowTasks);
  const activeStage = stageRows.find((stage) => stage.id === activeStageId) ?? stageRow;
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
  template: {
    id: string;
    title: string;
    description?: string;
    assigneeRole?: string;
    assigneeKind?: StageTaskTemplate["assigneeKind"];
  };
  parentTaskId: number;
}): Promise<BridgeTask> {
  const assigneeRole =
    emptyToNull(input.template.assigneeRole) ?? emptyToNull(input.stageRow.auto_assign_role);
  const assignee = assigneeRole
    ? await pickMemberByProjectRole(input.epic.projectId, assigneeRole)
    : null;

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
    assigneeRole,
    assigneeKind: input.template.assigneeKind ?? null,
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
  const allTasks = await listBridgeTasks();
  const workflowTasks = listEpicWorkflowTasks(allTasks, epic.id);
  const created: BridgeTask[] = [];

  for (const row of rows) {
    const templateInput = {
      taskTemplatesJson: row.task_templates_json,
      spawnTaskCount: row.spawn_task_count ?? 0,
      stageId: row.id,
      stageTitle: row.title,
    };
    if (!stageHasActionableTemplates(templateInput)) continue;

    const roots = resolveStageTaskTemplateRoots(templateInput);
    const ctx = buildSpawnContext(row, [...workflowTasks, ...created], rows);
    let progressed = true;
    while (progressed) {
      progressed = false;
      const spawnable = collectSpawnableTemplates(roots, ctx);
      for (const template of spawnable) {
        if (templateKind(template) === "group") continue;
        const templateParentId = findTemplateParentId(roots, template.id) ?? null;
        const parentTaskId = resolveParentTaskId(
          epic,
          [...workflowTasks, ...created],
          templateParentId,
        );
        const task = await spawnTemplateTask({
          epic,
          stageRow: row,
          template,
          parentTaskId,
        });
        created.push(task);
        ctx.spawnedTemplateIds.add(template.id);
        progressed = true;
      }
    }
  }

  return created;
}

export async function spawnEpicWorkflowGraph(epic: BridgeTask): Promise<BridgeTask[]> {
  return spawnUnlockedWorkflowTasks(epic);
}
