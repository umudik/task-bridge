import { refreshProjects, uniqueVikunjaProjectIds } from "./projects.mjs";

const WORKER_PREFIX = "[worker]";

export function loadConfig() {
  const baseUrl = (process.env.VIKUNJA_BASE_URL ?? "http://localhost:3456").replace(
    /\/$/,
    "",
  );
  const token = process.env.VIKUNJA_API_TOKEN ?? "";
  const pollMs = Number(process.env.WORKER_POLL_MS ?? 15000);
  const projectIds = uniqueVikunjaProjectIds();
  const fallbackProjectId = Number(process.env.VIKUNJA_PROJECT_ID ?? 0);
  const resolvedProjectIds =
    projectIds.length > 0 ? projectIds : fallbackProjectId ? [fallbackProjectId] : [];

  if (!token || resolvedProjectIds.length === 0) {
    throw new Error("Set VIKUNJA_API_TOKEN and ensure Vikunja has at least one project");
  }

  return { baseUrl, token, projectIds: resolvedProjectIds, pollMs };
}

export async function loadConfigAsync() {
  await refreshProjects(true);
  return loadConfig();
}

export function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

export function isWorkerComment(text) {
  return String(text ?? "").trimStart().startsWith(WORKER_PREFIX);
}

export async function vikunjaFetch(config, path, options = {}) {
  const response = await fetch(`${config.baseUrl}/api/v1${path}`, {
    ...options,
    headers: {
      ...authHeaders(config.token),
      ...(options.headers ?? {}),
    },
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Vikunja ${response.status} ${path}: ${detail}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

export async function listProjectTasks(
  config,
  projectId,
  { filter = "done = false", perPage = 50 } = {},
) {
  const data = await vikunjaFetch(
    config,
    `/projects/${projectId}/tasks?filter=${encodeURIComponent(filter)}&sort_by=id&order_by=desc&per_page=${perPage}`,
  );
  return Array.isArray(data) ? data : [];
}

export async function listOpenTasks(config, projectId = config.projectIds[0]) {
  return listProjectTasks(config, projectId, { filter: "done = false" });
}

export async function listAllOpenTasks(config) {
  const merged = new Map();
  for (const projectId of config.projectIds) {
    const tasks = await listOpenTasks(config, projectId);
    for (const task of tasks) merged.set(task.id, task);
  }
  return [...merged.values()];
}

export async function getComments(config, taskId) {
  const data = await vikunjaFetch(config, `/tasks/${taskId}/comments`);
  return Array.isArray(data) ? data : [];
}

export async function addComment(config, taskId, comment) {
  return vikunjaFetch(config, `/tasks/${taskId}/comments`, {
    method: "PUT",
    body: JSON.stringify({ comment }),
  });
}

export async function getTask(config, taskId) {
  return vikunjaFetch(config, `/tasks/${taskId}`);
}

export async function updateTask(config, taskId, patch) {
  const task = await getTask(config, taskId);
  return vikunjaFetch(config, `/tasks/${taskId}`, {
    method: "POST",
    body: JSON.stringify({ ...task, ...patch, id: taskId }),
  });
}

export { WORKER_PREFIX };
