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
  workflowStatus?: string | null;
  activityAt?: string | null;
  updatedAt?: string | null;
  createdAt?: string | null;
  answeredAt?: string | null;
  projectId?: string | null;
  projectName?: string | null;
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

export type TaskComment = {
  id: string;
  authorType?: "human" | "ai" | "system";
  authorId?: string;
  type?: string;
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
  workflowStatus?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  answeredAt?: string | null;
  durationMs?: number | null;
  createdBy?: string;
  answeredBy?: string | null;
  projectId?: string | null;
  projectName?: string | null;
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

export type CreateTaskInput = {
  projectId: string;
  title: string;
  description?: string;
};

export async function createTask(session: Session, input: CreateTaskInput) {
  return request<{ id: string | number; title?: string; projectName?: string }>(
    session,
    "/tasks",
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

export function buildMobileConnectUri(config: ConnectConfig, publicOrigin?: string) {
  const origin =
    publicOrigin?.replace(/\/$/, "") ||
    `${config.secure ? "https" : "http"}://${config.host}${
      config.port && config.port !== 443 && config.port !== 80 ? `:${config.port}` : ""
    }`;
  const fetchUrl = `${origin}/connect.json`;
  return `taskbridge://connect?fetch=${encodeURIComponent(fetchUrl)}`;
}
