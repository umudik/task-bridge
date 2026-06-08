import {
  deleteWorkflowStagesForProject,
  insertWorkflowStageRow,
} from "../db/workflow-db.js";
import { randomUUID } from "node:crypto";
import {
  deleteWorkflowTemplateStages,
  getWorkflowTemplateRow,
  insertWorkflowTemplateRow,
  insertWorkflowTemplateStageRow,
  listWorkflowTemplateRows,
  listWorkflowTemplateStageRows,
  seedDefaultWorkflowTemplates,
} from "../db/workflow-template-db.js";
import {
  resolveEpicDescription,
  resolveStageTaskTemplates,
  serializeTaskTemplates,
} from "../domain/workflow-stage.js";
import { AppError } from "../errors/app-error.js";
import type { WorkflowStage } from "./workflow-service.js";

export type WorkflowTemplateSummary = {
  id: string;
  title: string;
  description: string;
};

export type WorkflowTemplate = WorkflowTemplateSummary & {
  stages: WorkflowStage[];
};

function templateStageRowToStage(row: {
  id: string;
  title: string;
  description: string;
  purpose: string;
  rules_json: string;
  position: number;
  auto_assign: number;
  layout_x: number | null;
  layout_y: number | null;
  spawn_task_count: number;
  task_templates_json: string;
}): WorkflowStage {
  const taskTemplates = resolveStageTaskTemplates({
    taskTemplatesJson: row.task_templates_json,
    spawnTaskCount: row.spawn_task_count ?? 0,
    stageId: row.id,
    stageTitle: row.title,
  });
  return {
    id: row.id,
    title: row.title,
    description: resolveEpicDescription({
      description: row.description,
      purpose: row.purpose,
      rulesJson: row.rules_json,
    }),
    position: row.position,
    autoAssignRole: undefined,
    layoutX: row.layout_x,
    layoutY: row.layout_y,
    spawnTaskCount: taskTemplates.length,
    taskTemplates,
  };
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function defaultTemplateStage(): WorkflowStage {
  return {
    id: `stage-${randomUUID()}`,
    title: "New epic",
    description: "",
    position: 0,
    layoutX: null,
    layoutY: null,
    spawnTaskCount: 0,
    taskTemplates: [],
  };
}

export function ensureDefaultWorkflowTemplates(): void {
  seedDefaultWorkflowTemplates();
}

export function createWorkflowTemplate(input: {
  id?: string;
  title: string;
  description?: string;
}): WorkflowTemplate {
  ensureDefaultWorkflowTemplates();
  const title = input.title.trim();
  if (!title) {
    throw new AppError("Title is required", 400);
  }
  const baseId = input.id?.trim() || slugify(title) || `template-${randomUUID().slice(0, 8)}`;
  let id = baseId;
  let suffix = 2;
  while (getWorkflowTemplateRow(id)) {
    id = `${baseId}-${suffix}`;
    suffix += 1;
  }
  insertWorkflowTemplateRow({
    id,
    title,
    description: input.description?.trim() ?? "",
  });
  return replaceWorkflowTemplate(id, [defaultTemplateStage()]);
}

export function listWorkflowTemplates(): WorkflowTemplateSummary[] {
  ensureDefaultWorkflowTemplates();
  return listWorkflowTemplateRows().map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
  }));
}

export function getWorkflowTemplate(templateId: string): WorkflowTemplate | null {
  ensureDefaultWorkflowTemplates();
  const id = templateId.trim();
  const row = getWorkflowTemplateRow(id);
  if (!row) return null;
  const stages = listWorkflowTemplateStageRows(id).map(templateStageRowToStage);
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    stages,
  };
}

export function replaceWorkflowTemplate(
  templateId: string,
  stages: WorkflowStage[],
): WorkflowTemplate {
  ensureDefaultWorkflowTemplates();
  const id = templateId.trim();
  const row = getWorkflowTemplateRow(id);
  if (!row) {
    throw new AppError("Workflow template not found", 404);
  }
  deleteWorkflowTemplateStages(id);
  stages.forEach((stage, index) => {
    const taskTemplates = stage.taskTemplates ?? [];
    insertWorkflowTemplateStageRow({
      templateId: id,
      id: stage.id.trim(),
      title: stage.title,
      description: stage.description ?? "",
      purpose: "",
      rulesJson: "[]",
      position: stage.position ?? index,
      autoAssign: false,
      layoutX: stage.layoutX ?? null,
      layoutY: stage.layoutY ?? null,
      spawnTaskCount: taskTemplates.length,
      taskTemplatesJson: serializeTaskTemplates(taskTemplates),
    });
  });
  const updated = getWorkflowTemplate(id);
  if (!updated) {
    throw new AppError("Workflow template not found", 404);
  }
  return updated;
}

export function copyTemplateStagesToProject(projectId: string, templateId: string): WorkflowStage[] {
  const template = getWorkflowTemplate(templateId);
  if (!template) {
    throw new AppError("Workflow template not found", 404);
  }
  const id = projectId.trim();
  deleteWorkflowStagesForProject(id);
  for (const stage of template.stages) {
    const taskTemplates = stage.taskTemplates ?? [];
    insertWorkflowStageRow({
      id: stage.id,
      projectId: id,
      title: stage.title,
      description: stage.description ?? "",
      purpose: "",
      rulesJson: "[]",
      position: stage.position,
      autoAssignRole: "",
      layoutX: stage.layoutX ?? null,
      layoutY: stage.layoutY ?? null,
      spawnTaskCount: taskTemplates.length,
      taskTemplatesJson: serializeTaskTemplates(taskTemplates),
    });
  }
  return template.stages;
}
