import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";
import {
  countProjects,
  getProjectRow,
  listProjectRows,
  updateProjectRepoPathRow,
  upsertProjectRow,
} from "../db/projects-db.js";

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

type ProjectFileEntry = {
  id: string;
  name: string;
  repoPath: string | null;
};

const __dirname = dirname(fileURLToPath(import.meta.url));

function resolveProjectsPath(): string {
  if (config.projectsPath) return config.projectsPath;
  return join(__dirname, "..", "..", "..", "..", "projects.json");
}

function defaultRepoPath(): string | null {
  const path = process.env.WORKER_REPO_PATH?.trim();
  return path || null;
}

function normalizeRepoPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function loadProjectsFromFile(): ProjectFileEntry[] {
  const path = resolveProjectsPath();
  if (!existsSync(path) || statSync(path).isDirectory()) return [];
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    if (!parsed || typeof parsed !== "object") return [];
    const projects = (parsed as { projects?: unknown }).projects;
    if (!Array.isArray(projects)) return [];
    return projects
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const entry = item as Record<string, unknown>;
        const id = typeof entry.id === "string" ? entry.id.trim() : "";
        const name = typeof entry.name === "string" ? entry.name.trim() : id;
        const repoPath = normalizeRepoPath(entry.repoPath ?? entry.workspacePath);
        if (!id) return null;
        return { id, name: name || id, repoPath };
      })
      .filter((item): item is ProjectFileEntry => item !== null);
  } catch {
    return [];
  }
}

function rowToProject(row: { id: string; name: string; repo_path: string }): BridgeProject {
  return {
    id: row.id,
    name: row.name,
    repoPath: normalizeRepoPath(row.repo_path),
  };
}

function seedProjectsIfEmpty() {
  if (countProjects() > 0) return;

  const fromFile = loadProjectsFromFile();
  if (fromFile.length > 0) {
    for (const project of fromFile) {
      upsertProjectRow(project.id, project.name, project.repoPath ?? "");
    }
    return;
  }

  const repoPath = defaultRepoPath();
  if (repoPath) {
    upsertProjectRow("default", "Default", repoPath);
  }
}

export async function initProjectRegistry(): Promise<void> {
  seedProjectsIfEmpty();
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
