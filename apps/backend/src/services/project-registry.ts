import {
  getProjectRow,
  getProjectsDb,
  insertProjectRow,
  listProjectRows,
  updateProjectRow,
} from "../db/projects-db.js";
import {
  copyTemplateStagesToProject,
  ensureDefaultWorkflowTemplates,
} from "./workflow-template-service.js";
import { applyWorkflowTemplateToProject } from "./workflow-service.js";

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

function normalizeRepoPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
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
    workflowTemplateId: row.workflow_template_id.trim(),
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

export async function initProjectRegistry(): Promise<void> {
  getProjectsDb();
  ensureDefaultWorkflowTemplates();
}

export async function refreshProjectRegistry(): Promise<BridgeProject[]> {
  return listProjectRows().map(rowToProject);
}

export function listPublicProjects(): BridgeProjectPublic[] {
  return listProjectRows().map((row) => ({
    id: row.id,
    name: row.name,
    repoPath: row.repo_path,
    description: row.description,
    workflowTemplateId: row.workflow_template_id,
  }));
}

export async function createProject(input: {
  name: string;
  id?: string;
  repoPath: string;
  description?: string;
  workflowTemplateId?: string;
}): Promise<BridgeProject | "duplicate" | null> {
  const name = input.name.trim();
  const repoPath = input.repoPath.trim();
  if (!name || !repoPath) return null;
  const id = (input.id?.trim() || slugifyProjectId(name)).trim();
  if (!id || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) return null;
  if (getProjectRow(id)) return "duplicate";
  const templateId = input.workflowTemplateId?.trim() || "empty";
  if (
    !insertProjectRow(id, name, repoPath, input.description?.trim() ?? "", templateId)
  ) {
    return "duplicate";
  }
  copyTemplateStagesToProject(id, templateId);
  const row = getProjectRow(id);
  return row ? rowToProject(row) : null;
}

export async function updateProject(
  projectId: string,
  patch: {
    name?: string;
    repoPath?: string;
    description?: string;
    workflowTemplateId?: string;
  },
): Promise<BridgeProject | null> {
  const existing = getProjectById(projectId);
  if (!existing) return null;

  const name = patch.name?.trim();
  const repoPath = patch.repoPath?.trim();
  if (name !== undefined && !name) return null;
  if (repoPath !== undefined && !repoPath) return null;

  const dbPatch: {
    name?: string;
    repoPath?: string;
    description?: string;
    workflowTemplateId?: string;
  } = {};
  if (name !== undefined) dbPatch.name = name;
  if (repoPath !== undefined) dbPatch.repoPath = repoPath;
  if (patch.description !== undefined) dbPatch.description = patch.description.trim();

  if (Object.keys(dbPatch).length > 0 && !updateProjectRow(projectId, dbPatch)) {
    return null;
  }

  const templateId = patch.workflowTemplateId?.trim();
  if (templateId) {
    await applyWorkflowTemplateToProject(projectId, templateId);
    if (!updateProjectRow(projectId, { workflowTemplateId: templateId })) {
      return null;
    }
  }

  return getProjectById(projectId);
}

export async function updateProjectRepoPath(
  projectId: string,
  repoPath: string,
): Promise<BridgeProject | null> {
  return updateProject(projectId, { repoPath });
}

export function getProjectById(projectId: string): BridgeProject | null {
  const id = projectId.trim();
  if (!id) return null;
  const row = getProjectRow(id);
  return row ? rowToProject(row) : null;
}

export function resetProjectRegistryCache(): void {}
