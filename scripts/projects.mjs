import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

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

function loadProjectsFromFile() {
  const path = projectsPath();
  if (!existsSync(path)) return [];
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    const projects = Array.isArray(parsed?.projects) ? parsed.projects : [];
    return projects
      .map((item) => {
        const id = String(item?.id ?? "").trim();
        const name = String(item?.name ?? id).trim();
        const workspacePath = String(item?.workspacePath ?? item?.repoPath ?? "").trim();
        if (!id || !workspacePath) return null;
        return { id, name: name || id, workspacePath };
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function defaultProjects() {
  const workspacePath = defaultWorkspacePath();
  if (!workspacePath) return [];
  return [{ id: "default", name: "Default", workspacePath }];
}

let cached = null;

export async function refreshProjects(force = false) {
  if (!force && cached) return cached;
  const fromFile = loadProjectsFromFile();
  cached = fromFile.length > 0 ? fromFile : defaultProjects();
  return cached;
}

export function loadProjects() {
  if (cached) return cached;
  return defaultProjects();
}

export function listPublicProjects() {
  return loadProjects().map(({ id, name }) => ({ id, name }));
}

export function getProjectById(projectId) {
  const id = String(projectId ?? "").trim();
  if (!id) return null;
  return loadProjects().find((item) => item.id === id) ?? null;
}

export function resolveProjectForInboxItem(item) {
  if (item.projectId) {
    const project = getProjectById(item.projectId);
    if (project) return project;
  }
  return loadProjects()[0] ?? null;
}
