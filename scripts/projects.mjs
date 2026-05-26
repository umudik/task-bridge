import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { authHeaders } from "./vikunja-api.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
export const PROJECT_TAG_PREFIX = "[project:";
export const PROJECT_TAG_PATTERN = /^\[project:([^\]]+)\]\s*(?:\n\n?|\r\n\r\n?)?/;

export function projectsPath() {
  const configured =
    process.env.BRIDGE_PROJECTS_PATH?.trim() ||
    process.env.PROJECTS_PATH?.trim();
  if (configured) return configured;
  return join(ROOT, "projects.json");
}

function defaultWorkspacePath() {
  return process.env.WORKER_REPO_PATH?.trim() || ROOT;
}

function loadRepoPathOverrides() {
  const path = projectsPath();
  if (!existsSync(path)) return [];
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    const projects = Array.isArray(parsed?.projects) ? parsed.projects : [];
    return projects
      .map((item) => {
        const vikunjaProjectId = Number(
          item?.vikunjaProjectId ?? process.env.VIKUNJA_PROJECT_ID ?? 0,
        );
        const workspacePath = item?.workspacePath ?? item?.repoPath;
        if (!vikunjaProjectId || !workspacePath) return null;
        return {
          vikunjaProjectId,
          workspacePath: String(workspacePath),
          id: item?.id ? String(item.id) : undefined,
          name: item?.name ? String(item.name) : undefined,
        };
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function resolveWorkspacePath(vikunjaProjectId, overrides) {
  const match = overrides.find((item) => item.vikunjaProjectId === vikunjaProjectId);
  if (match?.workspacePath) return match.workspacePath;
  return defaultWorkspacePath();
}

function fallbackProjects() {
  const projectId = Number(process.env.VIKUNJA_PROJECT_ID ?? 0);
  if (!projectId) return [];
  return [
    {
      id: String(projectId),
      name: "Default",
      vikunjaProjectId: projectId,
      workspacePath: defaultWorkspacePath(),
    },
  ];
}

function buildProjectsFromVikunja(vikunjaProjects) {
  const overrides = loadRepoPathOverrides();
  return vikunjaProjects
    .filter((project) => !project.is_archived)
    .map((project) => {
      const override = overrides.find((item) => item.vikunjaProjectId === project.id);
      return {
        id: override?.id || String(project.id),
        name: override?.name || project.title?.trim() || `Project ${project.id}`,
        vikunjaProjectId: project.id,
        workspacePath: resolveWorkspacePath(project.id, overrides),
      };
    });
}

let cached = null;

async function fetchVikunjaProjects() {
  const baseUrl = (process.env.VIKUNJA_BASE_URL ?? "http://localhost:3456").replace(
    /\/$/,
    "",
  );
  const token = process.env.VIKUNJA_API_TOKEN ?? "";
  if (!token) return [];
  const response = await fetch(
    `${baseUrl}/api/v1/projects?per_page=100&is_archived=false`,
    { headers: authHeaders(token) },
  );
  if (!response.ok) return [];
  const data = await response.json();
  return Array.isArray(data) ? data : [];
}

export async function refreshProjects(force = false) {
  if (!force && cached) return cached;
  try {
    const vikunjaProjects = await fetchVikunjaProjects();
    const projects = buildProjectsFromVikunja(vikunjaProjects);
    cached = projects.length > 0 ? projects : fallbackProjects();
    return cached;
  } catch {
    cached = fallbackProjects();
    return cached;
  }
}

export function loadProjects() {
  if (cached) return cached;
  return fallbackProjects();
}

export function listPublicProjects() {
  return loadProjects().map(({ id, name }) => ({ id, name }));
}

export function getProjectById(projectId) {
  const id = String(projectId ?? "").trim();
  if (!id) return null;
  const projects = loadProjects();
  const direct = projects.find((item) => item.id === id);
  if (direct) return direct;
  const numericId = Number(id);
  if (Number.isFinite(numericId) && numericId > 0) {
    return projects.find((item) => item.vikunjaProjectId === numericId) ?? null;
  }
  return null;
}

export function getProjectByVikunjaId(vikunjaProjectId) {
  return (
    loadProjects().find((item) => item.vikunjaProjectId === vikunjaProjectId) ?? null
  );
}

export function uniqueVikunjaProjectIds() {
  return [...new Set(loadProjects().map((project) => project.vikunjaProjectId))];
}

export function parseProjectIdFromDescription(description) {
  const text = String(description ?? "");
  const match = text.match(PROJECT_TAG_PATTERN);
  if (!match) return null;
  return match[1]?.trim() || null;
}

export function stripProjectTag(description) {
  return String(description ?? "").replace(PROJECT_TAG_PATTERN, "").trim();
}

export function withProjectTag(projectId, text) {
  const body = String(text ?? "").trim();
  return body ? `${PROJECT_TAG_PREFIX}${projectId}]\n\n${body}` : `${PROJECT_TAG_PREFIX}${projectId}]`;
}

export function resolveProjectForTask(task) {
  const projectId = parseProjectIdFromDescription(task.description);
  if (projectId) {
    const project = getProjectById(projectId);
    if (project) return project;
  }
  const vikunjaProjectId = Number(task.project_id ?? 0);
  if (vikunjaProjectId) {
    const project = getProjectByVikunjaId(vikunjaProjectId);
    if (project) return project;
  }
  return loadProjects()[0] ?? null;
}
