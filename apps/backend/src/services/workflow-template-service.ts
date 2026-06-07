import {
  deleteWorkflowStagesForProject,
  insertWorkflowStageRow,
} from "../db/workflow-db.js";
import {
  deleteWorkflowTemplateStages,
  getWorkflowTemplateRow,
  insertWorkflowTemplateStageRow,
  listWorkflowTemplateRows,
  listWorkflowTemplateStageRows,
  seedDefaultWorkflowTemplates,
} from "../db/workflow-template-db.js";
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

function parseJsonArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  } catch {
    return [];
  }
}

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
}): WorkflowStage {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    purpose: row.purpose,
    rules: parseJsonArray(row.rules_json),
    position: row.position,
    autoAssign: row.auto_assign === 1,
    layoutX: row.layout_x,
    layoutY: row.layout_y,
    spawnTaskCount: row.spawn_task_count ?? 0,
    decisionIds: [],
  };
}

export function ensureDefaultWorkflowTemplates(): void {
  seedDefaultWorkflowTemplates();
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
    insertWorkflowTemplateStageRow({
      templateId: id,
      id: stage.id.trim(),
      title: stage.title,
      description: stage.description,
      purpose: stage.purpose,
      rulesJson: JSON.stringify(stage.rules ?? []),
      position: stage.position ?? index,
      autoAssign: stage.autoAssign,
      layoutX: stage.layoutX ?? null,
      layoutY: stage.layoutY ?? null,
      spawnTaskCount: stage.spawnTaskCount ?? 0,
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
    insertWorkflowStageRow({
      id: stage.id,
      projectId: id,
      title: stage.title,
      description: stage.description,
      purpose: stage.purpose,
      rulesJson: JSON.stringify(stage.rules ?? []),
      position: stage.position,
      autoAssign: stage.autoAssign,
      decisionIdsJson: "[]",
      layoutX: stage.layoutX ?? null,
      layoutY: stage.layoutY ?? null,
      spawnTaskCount: stage.spawnTaskCount ?? 0,
    });
  }
  return template.stages;
}
