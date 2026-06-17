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
  projectId?: string | null;
  projectName?: string | null;
  assignee?: string | null;
  stageId?: string | null;
  stageTitle?: string | null;
};

export type TemplateExecution = "parallel" | "sequential";

export type StageTaskTemplate = {
  id: string;
  title: string;
  description: string;
  assigneeRole?: string;
  kind?: "task" | "group";
  execution?: TemplateExecution;
  dependsOn?: string[];
  children?: StageTaskTemplate[];
};

export type WorkflowStage = {
  id: string;
  title: string;
  description: string;
  position: number;
  autoAssignRole?: string;
  layoutX?: number | null;
  layoutY?: number | null;
  spawnTaskCount?: number;
  taskTemplates?: StageTaskTemplate[];
  activeTaskCount?: number;
};

export type ProjectMember = {
  id: string;
  projectId: string;
  name: string;
  role?: string;
  openTasks: number;
};

export type ProjectWorkflow = {
  projectId: string;
  roles: string[];
  stages: WorkflowStage[];
  members: ProjectMember[];
};

export type TaskStageSnapshot = {
  id: string;
  title: string;
  description: string;
  taskTemplates?: StageTaskTemplate[];
};

export type InboxResult = {
  items: InboxItem[];
  limit: number;
  nextCursor: string | null;
  hasMore: boolean;
};

export type InboxQuery = {
  projectId?: string;
  commentsOnly?: boolean;
  epicsOnly?: boolean;
  cursor?: string;
  limit?: number;
};

export type WorkStatus = "todo" | "in_progress" | "done";

export type TaskSubtask = {
  taskId: number;
  parentId?: number | null;
  title: string;
  stageId?: string | null;
  stageTitle?: string | null;
  templateId?: string | null;
  assignee?: string | null;
  workStatus?: WorkStatus;
  workStatusLabel?: string;
  done: boolean;
};

export type TaskComment = {
  id: string;
  authorType?: "human" | "system";
  authorId?: string;
  tags?: string[];
  body?: string;
  at: string;
  metadata?: Record<string, unknown> | null;
  by?: string;
  text?: string;
  role?: "user" | "system";
};

export type TaskDetail = {
  taskId: number;
  title: string;
  request: string;
  description?: string;
  acceptanceCriteria?: string | null;
  status: string;
  parentId?: number | null;
  parent?: { taskId: number; title: string; stageId?: string | null } | null;
  subtasks?: TaskSubtask[];
  createdAt?: string | null;
  updatedAt?: string | null;
  createdBy?: string;
  projectId?: string | null;
  projectName?: string | null;
  assignee?: string | null;
  stageId?: string | null;
  stage?: TaskStageSnapshot | null;
  isEpic?: boolean;
  workStatus?: WorkStatus | null;
  workStatusLabel?: string | null;
  comments?: TaskComment[];
  libraryLinks?: LibraryDocumentLink[];
};

export type LibrarySummary = {
  id: string;
  title: string;
  description: string;
  documentCount: number;
};

export type LibraryDocumentSummary = {
  id: string;
  libraryId: string;
  title: string;
  description: string;
};

export type LibraryDetail = {
  id: string;
  title: string;
  description: string;
  documents: LibraryDocumentSummary[];
};

export type LibraryDocument = LibraryDocumentSummary & {
  libraryTitle: string;
  linkCount: number;
};

export type LibraryDocumentLink = {
  documentId: string;
  documentTitle: string;
  libraryId: string;
  libraryTitle: string;
  taskId: number;
  linkedAt: string;
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
  if (response.status === 204) {
    return undefined as T;
  }
  const text = await response.text();
  if (!text) {
    return undefined as T;
  }
  return JSON.parse(text) as T;
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

export async function createWorkflowTemplate(
  session: Session,
  input: { title: string; id?: string; description?: string },
) {
  return request<WorkflowTemplate>(session, "/workflow-templates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
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

export type CreateEpicInput = {
  projectId: string;
  title: string;
  description?: string;
};

export type CreateTaskInput = {
  parentId: number;
  title: string;
  description?: string;
  stageId?: string;
};

export async function createEpic(session: Session, input: CreateEpicInput) {
  return request<{ id: string | number; title?: string; projectName?: string; parentId?: number | null }>(
    session,
    "/epics",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: input.projectId,
        title: input.title,
        description: input.description ?? "",
      }),
    },
  );
}

export async function createTask(session: Session, input: CreateTaskInput) {
  return request<{ id: string | number; title?: string; projectName?: string; parentId?: number | null }>(
    session,
    "/tasks",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        parentId: input.parentId,
        title: input.title,
        description: input.description ?? "",
        stageId: input.stageId,
      }),
    },
  );
}

export async function fetchInbox(session: Session, query: InboxQuery = {}) {
  const params = new URLSearchParams();
  if (query.projectId) params.set("projectId", query.projectId);
  if (query.commentsOnly) params.set("commentsOnly", "true");
  if (query.epicsOnly) params.set("epicsOnly", "true");
  if (query.cursor) params.set("cursor", query.cursor);
  if (query.limit) params.set("limit", String(query.limit));
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return request<InboxResult>(session, `/inbox${suffix}`);
}

export async function fetchAllInbox(session: Session, query: Omit<InboxQuery, "cursor"> = {}) {
  const items: InboxItem[] = [];
  let cursor: string | undefined;
  do {
    const page = await fetchInbox(session, { ...query, cursor, limit: query.limit ?? 100 });
    items.push(...page.items);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return items;
}

export async function fetchTask(session: Session, taskId: number) {
  return request<TaskDetail>(session, `/tasks/${taskId}`);
}

export async function addTaskComment(session: Session, taskId: number, text: string) {
  return request<TaskDetail>(session, `/tasks/${taskId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ comment: { text, by: "web" } }),
  });
}

export async function updateTaskDescription(session: Session, taskId: number, description: string) {
  return request<TaskDetail>(session, `/tasks/${taskId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ description }),
  });
}

export async function fetchProjectWorkflow(session: Session, projectId: string) {
  return request<ProjectWorkflow>(session, `/projects/${projectId}/workflow`);
}

export async function saveProjectWorkflow(
  session: Session,
  projectId: string,
  input: { stages: WorkflowStage[]; roles: string[] },
) {
  return request<ProjectWorkflow>(session, `/projects/${projectId}/workflow`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function exportProjectWorkflow(session: Session, projectId: string) {
  return request<Record<string, unknown>>(session, `/projects/${projectId}/workflow/export`);
}

export async function createMember(
  session: Session,
  projectId: string,
  input: { name: string; role?: string },
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
  input: { name?: string; role?: string },
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

export async function fetchLibraries(session: Session) {
  const data = await request<{ items: LibrarySummary[] }>(session, "/libraries");
  return data.items ?? [];
}

export async function fetchLibrary(session: Session, libraryId: string) {
  return request<LibraryDetail>(session, `/libraries/${libraryId}`);
}

export async function createLibrary(
  session: Session,
  input: { title: string; id?: string; description?: string },
) {
  return request<LibraryDetail>(session, "/libraries", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function saveLibrary(
  session: Session,
  libraryId: string,
  input: { title: string; description?: string },
) {
  return request<LibraryDetail>(session, `/libraries/${libraryId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function deleteLibrary(session: Session, libraryId: string) {
  await request<void>(session, `/libraries/${libraryId}`, { method: "DELETE" });
}

export async function createLibraryDocument(
  session: Session,
  libraryId: string,
  input: { title: string; id?: string; description?: string },
) {
  return request<LibraryDocument>(session, `/libraries/${libraryId}/documents`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function fetchLibraryDocument(session: Session, documentId: string) {
  return request<LibraryDocument>(session, `/library-documents/${documentId}`);
}

export async function saveLibraryDocument(
  session: Session,
  libraryId: string,
  documentId: string,
  input: { title: string; description?: string },
) {
  return request<LibraryDocument>(session, `/libraries/${libraryId}/documents/${documentId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function deleteLibraryDocument(
  session: Session,
  libraryId: string,
  documentId: string,
) {
  await request<void>(session, `/libraries/${libraryId}/documents/${documentId}`, {
    method: "DELETE",
  });
}

export async function linkLibraryDocument(
  session: Session,
  documentId: string,
  taskId: number,
) {
  const data = await request<{ items: LibraryDocumentLink[] }>(
    session,
    `/library-documents/${documentId}/links`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId }),
    },
  );
  return data.items ?? [];
}

export async function unlinkLibraryDocument(
  session: Session,
  documentId: string,
  taskId: number,
) {
  await request<void>(session, `/library-documents/${documentId}/links/${taskId}`, {
    method: "DELETE",
  });
}

export async function fetchTaskLibraryLinks(session: Session, taskId: number) {
  const data = await request<{ items: LibraryDocumentLink[] }>(
    session,
    `/tasks/${taskId}/library-links`,
  );
  return data.items ?? [];
}

export async function updateTaskWorkStatus(
  session: Session,
  taskId: number,
  workStatus: WorkStatus,
  by = "web",
) {
  return request<TaskDetail>(session, `/tasks/${taskId}/work-status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workStatus, by }),
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
