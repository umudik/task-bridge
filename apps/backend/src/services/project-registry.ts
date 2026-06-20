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
  repoPath: string | null;
  description: string;
  workflowTemplateId: string;
};

export type BridgeProjectPublic = {
  id: string;
  name: string;
  repoPath: string | null;
  description: string;
  workflowTemplateId: string;
};

export type CreateProjectInput = {
  name: string;
  id: string;
  repoPath: string;
  description: string;
  workflowTemplateId: string;
};

export type UpdateProjectInput = {
  name: string;
  repoPath: string;
  description: string;
  workflowTemplateId: string;
};

function normalizeRepoPath(value: string | number | boolean | null): string | null {
  if (String(value) !== value) return null;
  const trimmed = (value).trim();
  if (!trimmed) return null;
  return trimmed;
}

function rowToProject(row: {
  id: string;
  name: string;
  repo_path: string;
  description: string;
  workflow_template_id: string;
}): BridgeProject {
  return {
    id: row.id,
    name: row.name,
    repoPath: normalizeRepoPath(row.repo_path),
    description: row.description.trim(),
    workflowTemplateId: normalizeWorkflowTemplateId(row.workflow_template_id),
  };
}

function slugifyProjectId(name: string): string {
  const lowered = name.trim().toLowerCase();
  const mapped = lowered
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
  return listProjectRows().map((row) => ({
    id: row.id,
    name: row.name,
    repoPath: normalizeRepoPath(row.repo_path),
    description: row.description,
    workflowTemplateId: normalizeWorkflowTemplateId(row.workflow_template_id),
  }));
}

export function createProject(
  input: CreateProjectInput,
): BridgeProject | "duplicate" | null {
  const name = input.name.trim();
  const repoPath = input.repoPath.trim();
  if (!name || !repoPath) return null;
  const inputId = input.id.trim();
  const id = (inputId || slugifyProjectId(name)).trim();
  if (!id || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) return null;
  if (listProjectRowsById(id).length > 0) return "duplicate";
  const templateId = normalizeWorkflowTemplateId(input.workflowTemplateId);
  const description = input.description.trim();
  if (!insertProjectRow(id, name, repoPath, description, templateId)) {
    return "duplicate";
  }
  copyTemplateStagesToProject(id, templateId);
  const rows = listProjectRowsById(id);
  if (rows.length > 0) {
    return rowToProject(rows[0]);
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
  const repoPath = input.repoPath.trim();
  if (!name || !repoPath) return null;

  const description = input.description.trim();
  const workflowTemplateId = normalizeWorkflowTemplateId(input.workflowTemplateId);
  const templateChanged = workflowTemplateId !== existing.workflowTemplateId;

  if (templateChanged) {
    applyWorkflowTemplateToProject(projectId, workflowTemplateId);
  }

  if (
    !updateProjectRow(projectId, {
      name,
      repoPath,
      description,
      workflowTemplateId,
    })
  ) {
    return null;
  }

  return getProjectById(projectId);
}

export function updateProjectRepoPath(
  projectId: string,
  repoPath: string,
): BridgeProject | null {
  const existing = getProjectById(projectId);
  if (!existing) return null;
  return updateProject(projectId, {
    name: existing.name,
    repoPath: repoPath.trim(),
    description: existing.description,
    workflowTemplateId: existing.workflowTemplateId,
  });
}

export function getProjectById(projectId: string): BridgeProject | null {
  const id = projectId.trim();
  if (!id) return null;
  const rows = listProjectRowsById(id);
  if (rows.length > 0) {
    return rowToProject(rows[0]);
  }
  return null;
}

export function resetProjectRegistryCache(): void {}
