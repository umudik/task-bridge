import { config } from "../config.js";
import {
  extractProjectId,
  stripProjectMarker,
  withProjectMarker,
} from "../lib/bridge-project.js";
import {
  getProjectById,
  getProjectByVikunjaId,
  refreshProjectRegistry,
  uniqueVikunjaProjectIds,
} from "../services/project-registry.js";

export const WORKER_PREFIX = "[worker]";

export type CreateTaskInput = {
  title: string;
  description?: string;
  vikunjaProjectId: number;
};

export type VikunjaTask = {
  id: number;
  title: string;
  description?: string;
  project_id?: number;
  done?: boolean;
  percent_done?: number;
  created?: string;
  updated?: string;
};

export type VikunjaComment = {
  id: number;
  comment: string;
  created?: string;
  updated?: string;
};

export type VikunjaProject = {
  id: number;
  title: string;
  is_archived?: boolean;
};

export function isWorkerComment(text: string): boolean {
  return text.trimStart().startsWith(WORKER_PREFIX);
}

export function stripWorkerPrefix(text: string): string {
  return text.trimStart().replace(/^\[worker\]\s*/, "");
}

export function isNoiseWorkerComment(text: string, taskTitle?: string): boolean {
  const stripped = stripWorkerPrefix(text);
  const lower = stripped.toLowerCase();
  if (
    lower.includes("alındı") ||
    lower.includes("calisiyorum") ||
    lower.includes("çalışıyorum") ||
    lower.includes("görev alındı") ||
    lower.includes("devam edeyim mi") ||
    lower.includes("anlaşıldı") ||
    lower.includes("anlasildi") ||
    lower.startsWith("plan:") ||
    /^tamamlandı:/i.test(stripped) ||
    /^done:/i.test(stripped)
  ) {
    return true;
  }
  if (!taskTitle) return false;
  const body = stripped
    .replace(/^tamamlandı:\s*/i, "")
    .replace(/^done:\s*/i, "")
    .trim();
  const title = taskTitle.trim();
  return body === title || title.startsWith(body) || body.startsWith(title.slice(0, 80));
}

export function sortTasksNewestFirst(tasks: VikunjaTask[]): VikunjaTask[] {
  return [...tasks].sort((a, b) => {
    const aTime = Date.parse(String(a.created ?? ""));
    const bTime = Date.parse(String(b.created ?? ""));
    if (!Number.isNaN(aTime) && !Number.isNaN(bTime) && aTime !== bTime) {
      return bTime - aTime;
    }
    return b.id - a.id;
  });
}

export function latestWorkerResponse(
  comments: VikunjaComment[],
  taskTitle?: string,
): string {
  const worker = comments.filter(
    (item) =>
      isWorkerComment(item.comment) && !isNoiseWorkerComment(item.comment, taskTitle),
  );
  const latest = worker.at(-1);
  if (!latest) return "";
  return stripWorkerPrefix(latest.comment);
}

export class VikunjaClient {
  private baseUrl = config.vikunjaBaseUrl.replace(/\/$/, "");

  isConfigured(): boolean {
    return Boolean(config.vikunjaApiToken);
  }

  private headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.vikunjaApiToken}`,
    };
  }

  private async fetchJson<T>(path: string, options: RequestInit = {}): Promise<T> {
    if (!this.isConfigured()) {
      throw new Error("Vikunja is not configured. Set VIKUNJA_API_TOKEN.");
    }
    const response = await fetch(`${this.baseUrl}/api/v1${path}`, {
      ...options,
      headers: { ...this.headers(), ...(options.headers as Record<string, string>) },
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Vikunja API error ${response.status}: ${detail}`);
    }
    if (response.status === 204) return null as T;
    return (await response.json()) as T;
  }

  async listProjects(): Promise<VikunjaProject[]> {
    const data = await this.fetchJson<VikunjaProject[] | null>(
      "/projects?per_page=100&is_archived=false",
    );
    if (!Array.isArray(data)) return [];
    return data.filter((project) => project.id > 0 && !project.is_archived);
  }

  async createTask(input: CreateTaskInput): Promise<VikunjaTask> {
    const url = `/projects/${input.vikunjaProjectId}/tasks`;
    const body: Record<string, string> = { title: input.title };
    if (input.description) body.description = input.description;
    return this.fetchJson<VikunjaTask>(url, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  }

  private async listTasksForProject(
    projectId: number,
    filter: string,
    perPage: number,
  ): Promise<VikunjaTask[]> {
    const data = await this.fetchJson<VikunjaTask[]>(
      `/projects/${projectId}/tasks?filter=${encodeURIComponent(filter)}&sort_by=id&order_by=desc&per_page=${perPage}`,
    );
    return Array.isArray(data) ? data : [];
  }

  async listOpenTasks(): Promise<VikunjaTask[]> {
    await refreshProjectRegistry(this);
    const merged = new Map<number, VikunjaTask>();
    for (const projectId of uniqueVikunjaProjectIds()) {
      const tasks = await this.listTasksForProject(projectId, "done = false", 100);
      for (const task of tasks) merged.set(task.id, task);
    }
    return sortTasksNewestFirst([...merged.values()]);
  }

  async listAllTasks(): Promise<VikunjaTask[]> {
    const open = await this.listOpenTasks();
    const done = await this.listDoneTasks();
    const merged = new Map<number, VikunjaTask>();
    for (const task of [...open, ...done]) merged.set(task.id, task);
    return sortTasksNewestFirst([...merged.values()]);
  }

  async getTask(taskId: number): Promise<VikunjaTask> {
    return this.fetchJson<VikunjaTask>(`/tasks/${taskId}`);
  }

  async getComments(taskId: number): Promise<VikunjaComment[]> {
    const data = await this.fetchJson<VikunjaComment[]>(`/tasks/${taskId}/comments`);
    return Array.isArray(data) ? data : [];
  }

  async listDoneTasks(): Promise<VikunjaTask[]> {
    await refreshProjectRegistry(this);
    const merged = new Map<number, VikunjaTask>();
    for (const projectId of uniqueVikunjaProjectIds()) {
      const tasks = await this.listTasksForProject(projectId, "done = true", 50);
      for (const task of tasks) merged.set(task.id, task);
    }
    return sortTasksNewestFirst([...merged.values()]);
  }

  isBridgeTask(task: VikunjaTask): boolean {
    if (extractProjectId(task.description)) return true;
    const vikunjaProjectId = Number(task.project_id ?? 0);
    if (vikunjaProjectId > 0 && getProjectByVikunjaId(vikunjaProjectId)) return true;
    return false;
  }

  hasMobileReply(task: VikunjaTask, comments: VikunjaComment[]): boolean {
    return latestWorkerResponse(comments, task.title).length > 0;
  }

  latestWorkerPreview(comments: VikunjaComment[], taskTitle?: string): string {
    return latestWorkerResponse(comments, taskTitle);
  }

  resolveTaskProject(task: VikunjaTask) {
    const projectId = extractProjectId(task.description);
    if (projectId) {
      const byId = getProjectById(projectId);
      if (byId) return byId;
    }
    const vikunjaProjectId = Number(task.project_id ?? 0);
    if (vikunjaProjectId) {
      return getProjectByVikunjaId(vikunjaProjectId);
    }
    return null;
  }

  buildAnswerDetail(task: VikunjaTask, comments: VikunjaComment[]) {
    const answer = latestWorkerResponse(comments, task.title);
    const workerComment = comments
      .filter(
        (item) =>
          isWorkerComment(item.comment) &&
          !isNoiseWorkerComment(item.comment, task.title),
      )
      .at(-1);
    const createdAt = task.created ?? null;
    const answeredAt = workerComment?.created ?? null;
    let durationMs: number | null = null;
    if (createdAt && answeredAt) {
      const start = Date.parse(createdAt);
      const end = Date.parse(answeredAt);
      if (!Number.isNaN(start) && !Number.isNaN(end) && end >= start) {
        durationMs = end - start;
      }
    }
    const project = this.resolveTaskProject(task);
    const request = stripProjectMarker(task.description?.trim() || task.title);
    return {
      taskId: task.id,
      title: task.title,
      request,
      answer: answer || null,
      status: answer ? "ready" : "pending",
      createdAt,
      answeredAt,
      durationMs,
      createdBy: "You",
      answeredBy: answer ? "Cursor AI" : null,
      projectId: project?.id ?? null,
      projectName: project?.name ?? null,
    };
  }
}

export { extractProjectId, stripProjectMarker, withProjectMarker };
