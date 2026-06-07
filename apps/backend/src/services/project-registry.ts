import {
  getProjectRow,
  getProjectsDb,
  insertProjectRow,
  listProjectRows,
  updateProjectRepoPathRow,
} from "../db/projects-db.js";
import {
  copyTemplateStagesToProject,
  ensureDefaultWorkflowTemplates,
} from "./workflow-template-service.js";

export type BridgeProject = {
  id: string;
  name: string;
  repoPath: string | null;
};

export type BridgeProjectPublic = {
  id: string;
  name: string;
  repoPath: string | null;
};

function normalizeRepoPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function rowToProject(row: { id: string; name: string; repo_path: string }): BridgeProject {
  return {
    id: row.id,
    name: row.name,
    repoPath: normalizeRepoPath(row.repo_path),
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
  }));
}

export async function createProject(input: {
  name: string;
  id?: string;
  repoPath: string;
  workflowTemplateId?: string;
}): Promise<BridgeProject | "duplicate" | null> {
  const name = input.name.trim();
  const repoPath = input.repoPath.trim();
  if (!name || !repoPath) return null;
  const id = (input.id?.trim() || slugifyProjectId(name)).trim();
  if (!id || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) return null;
  if (getProjectRow(id)) return "duplicate";
  if (!insertProjectRow(id, name, repoPath)) return "duplicate";
  const templateId = input.workflowTemplateId?.trim() || "empty";
  copyTemplateStagesToProject(id, templateId);
  const row = getProjectRow(id);
  return row ? rowToProject(row) : null;
}

export async function updateProjectRepoPath(
  projectId: string,
  repoPath: string,
): Promise<BridgeProject | null> {
  const trimmedPath = repoPath.trim();
  if (!trimmedPath) return null;
  const existing = getProjectById(projectId);
  if (!existing) return null;
  if (!updateProjectRepoPathRow(projectId, trimmedPath)) return null;
  return getProjectById(projectId);
}

export function getProjectById(projectId: string): BridgeProject | null {
  const id = projectId.trim();
  if (!id) return null;
  const row = getProjectRow(id);
  return row ? rowToProject(row) : null;
}

export function resetProjectRegistryCache(): void {}
