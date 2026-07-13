import {
  getProjectsDb,
  insertProjectRow,
  listProjectRows,
  listProjectRowsById,
  updateProjectRow,
} from "../db/projects-db.js";
import { migrateEpicWorkflowTables } from "../db/epic-workflow-db.js";
import {
  copyTemplateStagesToProject,
  ensureDefaultWorkflowTemplates,
} from "./workflow-template-service.js";
import { applyWorkflowTemplateToProject } from "./workflow-service.js";
import {
  normalizeWorkflowTemplateId,
} from "../domain/workflow-template-id.js";
export type BridgeProject = {
  id: string;
  name: string;
  description: string;
  workflowTemplateId: string;
};

export type BridgeProjectPublic = {
  id: string;
  name: string;
  description: string;
  workflowTemplateId: string;
};

export type CreateProjectInput = {
  name: string;
  id: string;
  description: string;
  workflowTemplateId: string;
};

export type UpdateProjectInput = {
  name: string;
  description: string;
  workflowTemplateId: string;
};

function rowToProject(row: {
  id: string;
  name: string;
  description: string;
  workflow_template_id: string;
}): BridgeProject {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    workflowTemplateId: normalizeWorkflowTemplateId(row.workflow_template_id),
  };
}

function slugifyProjectId(name: string): string {
  const mapped = name
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/ı/g, "i")
    .replace(/İ/g, "i");
  return mapped
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function initProjectRegistry(): void {
  getProjectsDb();
  migrateEpicWorkflowTables();
  ensureDefaultWorkflowTemplates();
}

export function refreshProjectRegistry(): BridgeProject[] {
  return listProjectRows().map(rowToProject);
}

export function listPublicProjects(): BridgeProjectPublic[] {
  return listProjectRows().map((row) => rowToProject(row));
}

export function createProject(
  input: CreateProjectInput,
): BridgeProject | "duplicate" | null {
  const name = input.name.trim();
  if (!name) return null;
  const inputId = input.id;
  const id = inputId || slugifyProjectId(name);
  if (!id || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) return null;
  if (listProjectRowsById(id).length > 0) return "duplicate";
  const templateId = normalizeWorkflowTemplateId(input.workflowTemplateId);
  const description = input.description;
  if (!insertProjectRow(id, name, description, templateId)) {
    return "duplicate";
  }
  copyTemplateStagesToProject(id, templateId);
  const rows = listProjectRowsById(id);
  const row = rows[0];
  if (row) {
    return rowToProject(row);
  }
  return null;
}

export function updateProject(
  projectId: string,
  input: UpdateProjectInput,
): BridgeProject | null {
  const existing = getProjectById(projectId);
  if (!existing) return null;

  const name = input.name.trim();
  if (!name) return null;

  const description = input.description;
  const workflowTemplateId = normalizeWorkflowTemplateId(input.workflowTemplateId);
  const templateChanged = workflowTemplateId !== existing.workflowTemplateId;

  if (templateChanged) {
    applyWorkflowTemplateToProject(projectId, workflowTemplateId);
  }

  if (
    !updateProjectRow(projectId, {
      name,
      description,
      workflowTemplateId,
    })
  ) {
    return null;
  }

  return getProjectById(projectId);
}

export function getProjectById(projectId: string): BridgeProject | null {
  const id = projectId;
  if (!id) return null;
  const rows = listProjectRowsById(id);
  const row = rows[0];
  if (row) {
    return rowToProject(row);
  }
  return null;
}

export function resetProjectRegistryCache(): void {}
