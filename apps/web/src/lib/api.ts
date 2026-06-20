import type { Session } from "./session";
import { clearSession, loadSession, saveSession } from "./session";

export const DEFAULT_WORKFLOW_TEMPLATE_ID = "empty";

export type Project = {
  id: string;
  name: string;
  repoPath: string;
  description: string;
  workflowTemplateId: string;
};

export type UpdateProjectInput = {
  name: string;
  repoPath: string;
  description: string;
  workflowTemplateId: string;
};

export type CreateProjectInput = {
  name: string;
  id: string;
  repoPath: string;
  description: string;
  workflowTemplateId: string;
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

export type AssigneeKind = "human" | "ai";

export type StageTaskTemplate = {
  id: string;
  title: string;
  description: string;
  assigneeRole?: string | null;
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
  role: string;
  actorKind: AssigneeKind;
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
  templateId: string | null;
  assignee?: string | null;
  assigneeKind?: AssigneeKind | null;
  claimedBy?: string | null;
  workStatus?: WorkStatus;
  workStatusLabel?: string;
  done: boolean;
};

export type TaskComment = {
  id: string;
  role: "user" | "system";
  authorId: string;
  tags: string[];
  body: string;
  at: string;
  metadata: Record<string, unknown> | null;
  by: string;
  text: string;
};

export type WorkflowStateNode = {
  templateId: string;
  stageId: string;
  parentTemplateId: string | null;
  title: string;
  taskId: number | null;
  workStatus: WorkStatus;
  workStatusLabel: string;
  commentCount: number;
};

export type TaskDetail = {
  taskId: number;
  title: string;
  request: string;
  description: string;
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
  workflowState?: WorkflowStateNode[];
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

export type PublicUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  isSystemAdmin: boolean;
  createdAt: string;
};

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function authHeaders(session: Session): Record<string, string> {
  return {
    Accept: "application/json",
    Authorization: `Bearer ${session.token}`,
  };
}

async function parseError(response: Response) {
  try {
    const body = (await response.json()) as {
      error?: string;
      details?: { code?: string };
    };
    if (body.details?.code === "PASSWORD_CHANGE_REQUIRED") {
      return "PASSWORD_CHANGE_REQUIRED";
    }
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
  const response = await fetch(path, {
    ...init,
    headers: {
      ...authHeaders(session),
      ...(init?.headers ?? {}),
    },
  });

  if (response.status === 401) {
    clearSession();
    window.location.href = "/app/login";
    throw new ApiError("Session expired", 401);
  }

  if (!response.ok) {
    const message = await parseError(response);
    if (message === "PASSWORD_CHANGE_REQUIRED") {
      const current = loadSession();
      if (current) {
        saveSession({ ...current, mustChangePassword: true });
      }
      window.location.href = "/app/change-password";
      throw new ApiError("Password change required", 403);
    }
    throw new ApiError(message, response.status);
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

// ─── Auth (no session required) ───────────────────────────────────────────────

export async function checkAuthStatus(): Promise<{ hasUsers: boolean }> {
  const response = await fetch("/api/auth/status");
  if (!response.ok) throw new ApiError("Failed to check status", response.status);
  return response.json() as Promise<{ hasUsers: boolean }>;
}

export async function setupAdmin(params: { name: string; email: string; password: string }) {
  const response = await fetch("/api/auth/setup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(body.error ?? "Setup failed", response.status);
  }
  return response.json();
}

export async function loginUser(params: {
  email: string;
  password: string;
}): Promise<{
  token: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    isSystemAdmin: boolean;
    mustChangePassword: boolean;
  };
}> {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(body.error ?? "Login failed", response.status);
  }
  return response.json() as Promise<{
    token: string;
    user: {
      id: string;
      name: string;
      email: string;
      role: string;
      isSystemAdmin: boolean;
      mustChangePassword: boolean;
    };
  }>;
}

export async function changePassword(
  session: Session,
  params: { currentPassword: string; newPassword: string },
): Promise<{ user: { mustChangePassword: boolean } }> {
  const response = await fetch("/api/auth/change-password", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.token}`,
    },
    body: JSON.stringify(params),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(body.error ?? "Password change failed", response.status);
  }
  return response.json() as Promise<{ user: { mustChangePassword: boolean } }>;
}

// ─── Mobile QR ────────────────────────────────────────────────────────────────

export function buildMobileQrData(session: Session): string {
  const server = typeof window !== "undefined" ? window.location.origin : "";
  return `taskbridge://auth?server=${encodeURIComponent(server)}&token=${encodeURIComponent(session.token)}`;
}

// ─── Admin user management ────────────────────────────────────────────────────

export async function fetchUsers(session: Session): Promise<PublicUser[]> {
  const data = await request<{ users: PublicUser[] }>(session, "/api/admin/users");
  return data.users ?? [];
}

export async function createAppUser(
  session: Session,
  params: { name: string; email: string; password: string; role: string },
): Promise<PublicUser> {
  const data = await request<{ user: PublicUser }>(session, "/api/admin/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  return data.user;
}

export async function updateAppUser(
  session: Session,
  userId: string,
  params: { name?: string; role?: string },
): Promise<PublicUser> {
  const data = await request<{ user: PublicUser }>(session, `/api/admin/users/${userId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  return data.user;
}

export async function deleteAppUser(session: Session, userId: string): Promise<void> {
  await request<void>(session, `/api/admin/users/${userId}`, { method: "DELETE" });
}

// ─── Projects ─────────────────────────────────────────────────────────────────

export async function fetchProjects(session: Session) {
  const data = await request<{ projects: Project[] }>(session, "/api/projects");
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

export async function createProject(session: Session, input: CreateProjectInput) {
  return request<Project>(session, "/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: input.name,
      id: input.id.trim(),
      repoPath: input.repoPath,
      description: input.description.trim(),
      workflowTemplateId: input.workflowTemplateId.trim() || DEFAULT_WORKFLOW_TEMPLATE_ID,
    }),
  });
}

export async function updateProject(session: Session, projectId: string, input: UpdateProjectInput) {
  return request<Project>(session, `/api/projects/${projectId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function fetchWorkflowTemplates(session: Session) {
  const data = await request<{ items: WorkflowTemplateSummary[] }>(
    session,
    "/api/workflow-templates",
  );
  return data.items ?? [];
}

export async function fetchWorkflowTemplate(session: Session, templateId: string) {
  return request<WorkflowTemplate>(session, `/api/workflow-templates/${templateId}`);
}

export async function createWorkflowTemplate(
  session: Session,
  input: { title: string; id?: string; description?: string },
) {
  return request<WorkflowTemplate>(session, "/api/workflow-templates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function saveWorkflowTemplate(
  session: Session,
  templateId: string,
  stages: WorkflowStage[],
) {
  return request<WorkflowTemplate>(session, `/api/workflow-templates/${templateId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stages }),
  });
}

export async function deleteWorkflowTemplate(session: Session, templateId: string) {
  await request<void>(session, `/api/workflow-templates/${templateId}`, {
    method: "DELETE",
  });
}

export const PROTECTED_WORKFLOW_TEMPLATE_IDS = new Set(["ai-sdlc"]);

export async function exportWorkflowTemplate(session: Session, templateId: string): Promise<void> {
  const res = await fetch(`/api/workflow-templates/${templateId}/export`, {
    headers: { Authorization: `Bearer ${session.token}` },
  });
  if (!res.ok) throw new ApiError("Export failed", res.status);
  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const match = /filename="([^"]+)"/.exec(disposition);
  const filename = match?.[1] ?? `${templateId}.json`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importWorkflowTemplate(session: Session, data: unknown): Promise<WorkflowTemplate> {
  return request<WorkflowTemplate>(session, "/api/workflow-templates/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function applyWorkflowTemplate(
  session: Session,
  projectId: string,
  templateId: string,
) {
  return request<ProjectWorkflow>(
    session,
    `/api/projects/${projectId}/workflow/apply-template`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ templateId }),
    },
  );
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
    "/api/epics",
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
    "/api/tasks",
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
  return request<InboxResult>(session, `/api/inbox${suffix}`);
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
  return request<TaskDetail>(session, `/api/tasks/${taskId}`);
}

export async function addTaskComment(session: Session, taskId: number, text: string) {
  return request<TaskDetail>(session, `/api/tasks/${taskId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ comment: { text, by: "web" } }),
  });
}

export async function updateTaskDescription(session: Session, taskId: number, description: string) {
  return request<TaskDetail>(session, `/api/tasks/${taskId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ description }),
  });
}

export async function fetchProjectWorkflow(session: Session, projectId: string) {
  return request<ProjectWorkflow>(session, `/api/projects/${projectId}/workflow`);
}

export async function saveProjectWorkflow(
  session: Session,
  projectId: string,
  input: { stages: WorkflowStage[]; roles: string[] },
) {
  return request<ProjectWorkflow>(session, `/api/projects/${projectId}/workflow`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function exportProjectWorkflow(session: Session, projectId: string) {
  return request<Record<string, unknown>>(session, `/api/projects/${projectId}/workflow/export`);
}

export async function createMember(
  session: Session,
  projectId: string,
  input: { name: string; role: string; actorKind: AssigneeKind },
) {
  return request<ProjectMember>(session, `/api/projects/${projectId}/members`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function updateMember(
  session: Session,
  projectId: string,
  memberId: string,
  input: { name?: string; role?: string; actorKind?: AssigneeKind },
) {
  return request<ProjectMember>(session, `/api/projects/${projectId}/members/${memberId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function deleteMember(session: Session, projectId: string, memberId: string) {
  await request<void>(session, `/api/projects/${projectId}/members/${memberId}`, {
    method: "DELETE",
  });
}

export async function fetchLibraries(session: Session) {
  const data = await request<{ items: LibrarySummary[] }>(session, "/api/libraries");
  return data.items ?? [];
}

export async function fetchLibrary(session: Session, libraryId: string) {
  return request<LibraryDetail>(session, `/api/libraries/${libraryId}`);
}

export async function createLibrary(
  session: Session,
  input: { title: string; id?: string; description?: string },
) {
  return request<LibraryDetail>(session, "/api/libraries", {
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
  return request<LibraryDetail>(session, `/api/libraries/${libraryId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function deleteLibrary(session: Session, libraryId: string) {
  await request<void>(session, `/api/libraries/${libraryId}`, { method: "DELETE" });
}

export async function createLibraryDocument(
  session: Session,
  libraryId: string,
  input: { title: string; id?: string; description?: string },
) {
  return request<LibraryDocument>(session, `/api/libraries/${libraryId}/documents`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function fetchLibraryDocument(session: Session, documentId: string) {
  return request<LibraryDocument>(session, `/api/library-documents/${documentId}`);
}

export async function saveLibraryDocument(
  session: Session,
  libraryId: string,
  documentId: string,
  input: { title: string; description?: string },
) {
  return request<LibraryDocument>(
    session,
    `/api/libraries/${libraryId}/documents/${documentId}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

export async function deleteLibraryDocument(
  session: Session,
  libraryId: string,
  documentId: string,
) {
  await request<void>(session, `/api/libraries/${libraryId}/documents/${documentId}`, {
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
    `/api/library-documents/${documentId}/links`,
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
  await request<void>(session, `/api/library-documents/${documentId}/links/${taskId}`, {
    method: "DELETE",
  });
}

export async function fetchTaskLibraryLinks(session: Session, taskId: number) {
  const data = await request<{ items: LibraryDocumentLink[] }>(
    session,
    `/api/tasks/${taskId}/library-links`,
  );
  return data.items ?? [];
}

export async function claimTask(session: Session, taskId: number, claimedBy: string) {
  return request<{ id: number; claimedBy: string | null }>(session, `/api/tasks/${taskId}/claim`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ claimedBy }),
  });
}

export async function updateTaskWorkStatus(
  session: Session,
  taskId: number,
  workStatus: WorkStatus,
  claimedBy: string,
) {
  return request<TaskDetail>(session, `/api/tasks/${taskId}/work-status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workStatus, claimedBy }),
  });
}
