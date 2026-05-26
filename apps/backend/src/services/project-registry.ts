import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";
import type { VikunjaClient } from "./vikunja-client.js";

export type BridgeProject = {
  id: string;
  name: string;
  vikunjaProjectId: number;
  repoPath: string;
};

export type BridgeProjectPublic = {
  id: string;
  name: string;
  vikunjaProjectId: number;
  repoPath: string;
};

type RepoPathOverride = {
  vikunjaProjectId: number;
  repoPath: string;
  id?: string;
  name?: string;
};

const __dirname = dirname(fileURLToPath(import.meta.url));

function resolveProjectsPath(): string {
  if (config.projectsPath) return config.projectsPath;
  return join(__dirname, "..", "..", "..", "..", "projects.json");
}

function defaultRepoPath(): string {
  return process.env.WORKER_REPO_PATH?.trim() || "";
}

function loadRepoPathOverrides(): RepoPathOverride[] {
  const path = resolveProjectsPath();
  if (!existsSync(path)) return [];
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    if (!parsed || typeof parsed !== "object") return [];
    const projects = (parsed as { projects?: unknown }).projects;
    if (!Array.isArray(projects)) return [];
    return projects
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const entry = item as Record<string, unknown>;
        const vikunjaProjectId = Number(
          entry.vikunjaProjectId ?? config.vikunjaProjectId ?? 0,
        );
        const repoPath = String(entry.repoPath ?? entry.workspacePath ?? "").trim();
        if (!vikunjaProjectId || !repoPath) return null;
        const override: RepoPathOverride = { vikunjaProjectId, repoPath };
        if (entry.id) override.id = String(entry.id).trim();
        if (entry.name) override.name = String(entry.name).trim();
        return override;
      })
      .filter((item): item is RepoPathOverride => item !== null);
  } catch {
    return [];
  }
}

function resolveRepoPath(
  vikunjaProjectId: number,
  overrides: RepoPathOverride[],
): string {
  const match = overrides.find((item) => item.vikunjaProjectId === vikunjaProjectId);
  if (match?.repoPath) return match.repoPath;
  return defaultRepoPath();
}

function fallbackProjects(): BridgeProject[] {
  if (!config.vikunjaProjectId) return [];
  return [
    {
      id: String(config.vikunjaProjectId),
      name: "Default",
      vikunjaProjectId: config.vikunjaProjectId,
      repoPath: defaultRepoPath(),
    },
  ];
}

function buildProjectsFromVikunja(
  vikunjaProjects: Array<{ id: number; title: string; is_archived?: boolean }>,
): BridgeProject[] {
  const overrides = loadRepoPathOverrides();
  return vikunjaProjects
    .filter((project) => !project.is_archived)
    .map((project) => {
      const override = overrides.find((item) => item.vikunjaProjectId === project.id);
      return {
        id: override?.id || String(project.id),
        name: override?.name || project.title.trim() || `Project ${project.id}`,
        vikunjaProjectId: project.id,
        repoPath: resolveRepoPath(project.id, overrides),
      };
    });
}

let cached: BridgeProject[] | null = null;
let vikunjaClient: VikunjaClient | null = null;

export function bindProjectRegistry(vikunja: VikunjaClient): void {
  vikunjaClient = vikunja;
}

export function loadProjectRegistry(): BridgeProject[] {
  if (cached) return cached;
  cached = fallbackProjects();
  return cached;
}

export async function refreshProjectRegistry(vikunja?: VikunjaClient): Promise<BridgeProject[]> {
  const client = vikunja ?? vikunjaClient;
  if (!client?.isConfigured()) {
    cached = fallbackProjects();
    return cached;
  }
  try {
    const vikunjaProjects = await client.listProjects();
    const projects = buildProjectsFromVikunja(vikunjaProjects);
    cached = projects.length > 0 ? projects : fallbackProjects();
    return cached;
  } catch {
    cached = fallbackProjects();
    return cached;
  }
}

export function listPublicProjects(): BridgeProjectPublic[] {
  return loadProjectRegistry().map(({ id, name, vikunjaProjectId, repoPath }) => ({
    id,
    name,
    vikunjaProjectId,
    repoPath,
  }));
}

export async function updateProjectRepoPath(
  projectId: string,
  repoPath: string,
  vikunja?: VikunjaClient,
): Promise<BridgeProject | null> {
  const trimmedPath = repoPath.trim();
  if (!trimmedPath) return null;
  await refreshProjectRegistry(vikunja);
  const project = getProjectById(projectId);
  if (!project) return null;

  const filePath = resolveProjectsPath();
  let file: { projects: Array<Record<string, unknown>> } = { projects: [] };
  if (existsSync(filePath)) {
    try {
      const parsed = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
      if (parsed && typeof parsed === "object") {
        const projects = (parsed as { projects?: unknown }).projects;
        if (Array.isArray(projects)) {
          file = { projects: projects as Array<Record<string, unknown>> };
        }
      }
    } catch {
      file = { projects: [] };
    }
  }

  let entry = file.projects.find((item) => {
    const id = String(item.id ?? "").trim();
    const vikunjaProjectId = Number(item.vikunjaProjectId ?? 0);
    return id === project.id || vikunjaProjectId === project.vikunjaProjectId;
  });

  if (!entry) {
    entry = {
      id: project.id,
      name: project.name,
      vikunjaProjectId: project.vikunjaProjectId,
      repoPath: trimmedPath,
    };
    file.projects.push(entry);
  } else {
    entry.id = project.id;
    entry.name = project.name;
    entry.vikunjaProjectId = project.vikunjaProjectId;
    entry.repoPath = trimmedPath;
  }

  writeFileSync(filePath, `${JSON.stringify(file, null, 2)}\n`, "utf8");
  resetProjectRegistryCache();
  await refreshProjectRegistry(vikunja);
  return getProjectById(projectId);
}

export function getProjectById(projectId: string): BridgeProject | null {
  const id = projectId.trim();
  if (!id) return null;
  const projects = loadProjectRegistry();
  const direct = projects.find((project) => project.id === id);
  if (direct) return direct;
  const numericId = Number(id);
  if (Number.isFinite(numericId) && numericId > 0) {
    return projects.find((project) => project.vikunjaProjectId === numericId) ?? null;
  }
  return null;
}

export function getProjectByVikunjaId(vikunjaProjectId: number): BridgeProject | null {
  return (
    loadProjectRegistry().find((project) => project.vikunjaProjectId === vikunjaProjectId) ??
    null
  );
}

export function uniqueVikunjaProjectIds(): number[] {
  return [...new Set(loadProjectRegistry().map((project) => project.vikunjaProjectId))];
}

export function resetProjectRegistryCache(): void {
  cached = null;
}
