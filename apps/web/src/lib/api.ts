import type { Session } from "./session";

export type Project = {
  id: string;
  name: string;
  repoPath?: string | null;
};

export type InboxItem = {
  taskId: number;
  title: string;
  preview?: string;
  status: string;
  parentId?: number | null;
  activityAt?: string | null;
  updatedAt?: string | null;
  createdAt?: string | null;
  answeredAt?: string | null;
  projectId?: string | null;
  projectName?: string | null;
  assignee?: string | null;
  stageId?: string | null;
  stageTitle?: string | null;
};

export type WorkflowStage = {
  id: string;
  title: string;
  description: string;
  purpose: string;
  rules: string[];
  position: number;
  autoAssign: boolean;
  decisionIds: string[];
  layoutX?: number | null;
  layoutY?: number | null;
  spawnTaskCount?: number;
  decisions?: ProjectDecision[];
};

export type ProjectDecision = {
  id: string;
  projectId: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
};

export type ProjectMember = {
  id: string;
  projectId: string;
  name: string;
  available: boolean;
  openTasks: number;
};

export type ProjectWorkflow = {
  projectId: string;
  stages: WorkflowStage[];
  members: ProjectMember[];
  decisions: ProjectDecision[];
};

export type TaskStageSnapshot = {
  id: string;
  title: string;
  description: string;
  purpose: string;
  rules: string[];
  decisions: ProjectDecision[];
};

export type InboxResult = {
  items: InboxItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export type InboxQuery = {
  projectId?: string;
  commentsOnly?: boolean;
  page?: number;
  limit?: number;
};

export type TaskSubtask = {
  taskId: number;
  title: string;
  stageId?: string | null;
  stageTitle?: string | null;
  assignee?: string | null;
  done: boolean;
};

export type TaskComment = {
  id: string;
  authorType?: "human" | "ai" | "system";
  authorId?: string;
  tags?: string[];
  body?: string;
  at: string;
  metadata?: Record<string, unknown> | null;
  by?: string;
  text?: string;
  role?: "user" | "assistant";
};

export type AnswerDetail = {
  taskId: number;
  title: string;
  request: string;
  description?: string;
  acceptanceCriteria?: string | null;
  aiSummary?: string | null;
  aiContext?: string | null;
  answer?: string | null;
  status: string;
  parentId?: number | null;
  parent?: { taskId: number; title: string; stageId?: string | null } | null;
  subtasks?: TaskSubtask[];
  createdAt?: string | null;
  updatedAt?: string | null;
  answeredAt?: string | null;
  durationMs?: number | null;
  createdBy?: string;
  answeredBy?: string | null;
  projectId?: string | null;
  projectName?: string | null;
  assignee?: string | null;
  stageId?: string | null;
  stage?: TaskStageSnapshot | null;
  comments?: TaskComment[];
};

export type ConnectConfig = {
  host: string;
  port: number;
  secure: boolean;
  apiKey: string;
  connectPath?: string;
  source?: string;
};

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function headers(session: Session) {
  const next: Record<string, string> = {
    Accept: "application/json",
    "X-Api-Key": session.apiKey,
  };
  if (session.useHttps && session.baseUrl.includes("ngrok")) {
    next["ngrok-skip-browser-warning"] = "true";
  }
  return next;
}

async function parseError(response: Response) {
  try {
    const body = (await response.json()) as { error?: string };
    if (body.error) return body.error;
  } catch {
    // ignore
  }
  return response.statusText || "Request failed";
}

async function request<T>(
  session: Session,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const url = `${session.baseUrl.replace(/\/$/, "")}${path}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      ...headers(session),
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    throw new ApiError(await parseError(response), response.status);
  }
  return (await response.json()) as T;
}

export async function fetchConnectConfig(origin?: string) {
  const base = origin ?? (typeof window !== "undefined" ? window.location.origin : "");
  const response = await fetch(`${base.replace(/\/$/, "")}/connect.json`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new ApiError(await parseError(response), response.status);
  }
  return (await response.json()) as ConnectConfig;
}

export async function validateSession(session: Session) {
  await request<{ projects: Project[] }>(session, "/projects");
}

export async function fetchProjects(session: Session) {
  const data = await request<{ projects: Project[] }>(session, "/projects");
  return data.projects ?? [];
}

export type WorkflowTemplateSummary = {
  id: string;
  title: string;
  description: string;
};

export type WorkflowTemplate = WorkflowTemplateSummary & {
  stages: WorkflowStage[];
};

export type CreateProjectInput = {
  name: string;
  id?: string;
  repoPath: string;
  workflowTemplateId?: string;
};

export async function createProject(session: Session, input: CreateProjectInput) {
  return request<Project>(session, "/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: input.name,
      id: input.id?.trim() || undefined,
      repoPath: input.repoPath,
      workflowTemplateId: input.workflowTemplateId?.trim() || undefined,
    }),
  });
}

export async function fetchWorkflowTemplates(session: Session) {
  const data = await request<{ items: WorkflowTemplateSummary[] }>(session, "/workflow-templates");
  return data.items ?? [];
}

export async function fetchWorkflowTemplate(session: Session, templateId: string) {
  return request<WorkflowTemplate>(session, `/workflow-templates/${templateId}`);
}

export async function saveWorkflowTemplate(session: Session, templateId: string, stages: WorkflowStage[]) {
  return request<WorkflowTemplate>(session, `/workflow-templates/${templateId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stages }),
  });
}

export async function applyWorkflowTemplate(session: Session, projectId: string, templateId: string) {
  return request<ProjectWorkflow>(session, `/projects/${projectId}/workflow/apply-template`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ templateId }),
  });
}

export type CreateTaskInput = {
  projectId?: string;
  parentId?: number;
  title: string;
  description?: string;
};

export async function createTask(session: Session, input: CreateTaskInput) {
  return request<{ id: string | number; title?: string; projectName?: string; parentId?: number | null }>(
    session,
    "/tasks",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: input.projectId,
        parentId: input.parentId,
        title: input.title,
        description: input.description ?? "",
      }),
    },
  );
}

export async function fetchInbox(session: Session, query: InboxQuery = {}) {
  const params = new URLSearchParams();
  if (query.projectId) params.set("projectId", query.projectId);
  if (query.commentsOnly) params.set("commentsOnly", "true");
  if (query.page) params.set("page", String(query.page));
  if (query.limit) params.set("limit", String(query.limit));
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return request<InboxResult>(session, `/inbox${suffix}`);
}

export async function fetchAnswer(session: Session, taskId: number) {
  return request<AnswerDetail>(session, `/answers/${taskId}`);
}

export async function postTaskComment(session: Session, taskId: number, text: string) {
  return request<{ taskId: number; status: string; turnId: string }>(session, `/tasks/${taskId}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, by: "web" }),
  });
}

export async function fetchProjectWorkflow(session: Session, projectId: string) {
  return request<ProjectWorkflow>(session, `/projects/${projectId}/workflow`);
}

export async function saveProjectWorkflow(session: Session, projectId: string, stages: WorkflowStage[]) {
  return request<ProjectWorkflow>(session, `/projects/${projectId}/workflow`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stages }),
  });
}

export async function exportProjectWorkflow(session: Session, projectId: string) {
  return request<Record<string, unknown>>(session, `/projects/${projectId}/workflow/export`);
}

export async function createDecision(
  session: Session,
  projectId: string,
  input: { title: string; body?: string },
) {
  return request<ProjectDecision>(session, `/projects/${projectId}/decisions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function updateDecision(
  session: Session,
  projectId: string,
  decisionId: string,
  input: { title?: string; body?: string },
) {
  return request<ProjectDecision>(session, `/projects/${projectId}/decisions/${decisionId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function deleteDecision(session: Session, projectId: string, decisionId: string) {
  await request<void>(session, `/projects/${projectId}/decisions/${decisionId}`, { method: "DELETE" });
}

export async function createMember(
  session: Session,
  projectId: string,
  input: { name: string; available?: boolean },
) {
  return request<ProjectMember>(session, `/projects/${projectId}/members`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function updateMember(
  session: Session,
  projectId: string,
  memberId: string,
  input: { name?: string; available?: boolean },
) {
  return request<ProjectMember>(session, `/projects/${projectId}/members/${memberId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function deleteMember(session: Session, projectId: string, memberId: string) {
  await request<void>(session, `/projects/${projectId}/members/${memberId}`, { method: "DELETE" });
}

export async function transitionTask(
  session: Session,
  taskId: number,
  stageId: string,
  by = "web",
) {
  return request<AnswerDetail>(session, `/tasks/${taskId}/transition`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stageId, by }),
  });
}

export function buildMobileConnectUri(config: ConnectConfig, publicOrigin?: string) {
  const origin =
    publicOrigin?.replace(/\/$/, "") ||
    `${config.secure ? "https" : "http"}://${config.host}${
      config.port && config.port !== 443 && config.port !== 80 ? `:${config.port}` : ""
    }`;
  const fetchUrl = `${origin}/connect.json`;
  return `taskbridge://connect?fetch=${encodeURIComponent(fetchUrl)}`;
}
