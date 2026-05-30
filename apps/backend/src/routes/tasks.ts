import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  addBridgeTaskUserComment,
  allocateTaskId,
  applyAgentWorkResult,
  canonicalDescription,
  claimBridgeTask,
  getBridgeTask,
  listBridgeTasks,
  markBridgeTaskAnswered,
  releaseBridgeTask,
  upsertBridgeTask,
  type BridgeTask,
  type TaskComment,
} from "../services/bridge-task-store.js";
import {
  claimNextTask,
  listPendingTasks,
  turnIdForTask,
} from "../services/task-queue.js";
import { getProjectById, refreshProjectRegistry } from "../services/project-registry.js";
import { config } from "../config.js";

const createTaskBodySchema = z
  .object({
    text: z.string().optional(),
    projectId: z.string().min(1),
    title: z.string().optional(),
    description: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.title?.trim() && !data.text?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "title or text is required",
        path: ["title"],
      });
    }
  });

function resolveCreateTaskFields(body: z.infer<typeof createTaskBodySchema>) {
  const titleInput = body.title?.trim() ?? "";
  const descriptionInput = body.description?.trim() ?? "";
  const text = body.text?.trim() ?? "";

  if (titleInput) {
    return {
      title: titleInput.slice(0, 200),
      description: descriptionInput || text,
    };
  }

  const newline = text.indexOf("\n");
  if (newline === -1) {
    return {
      title: text.slice(0, 200),
      description: "",
    };
  }

  const firstLine = text.slice(0, newline).trim();
  const rest = text.slice(newline + 1).trim();
  return {
    title: (firstLine || text).slice(0, 200),
    description: rest,
  };
}

const answerIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const claimTaskBodySchema = z.object({
  claimedBy: z.string().min(1).default("worker"),
});

const claimNextBodySchema = z.object({
  claimedBy: z.string().min(1).default("worker"),
  projectId: z.string().min(1).optional(),
});

const answeredTaskBodySchema = z.object({
  answeredBy: z.string().min(1).default("Cursor AI"),
  answer: z.string().optional(),
});

const commentTaskBodySchema = z.object({
  text: z.string().min(1),
  by: z.string().min(1).default("mobile"),
});

const agentResultBodySchema = z.object({
  action: z.enum(["task.start", "task.complete"]).optional(),
  description: z.string().optional(),
  acceptanceCriteria: z.string().optional(),
  aiSummary: z.string().optional(),
  aiContext: z.string().optional(),
  comment: z
    .object({
      type: z
        .enum([
          "note",
          "review",
          "execution_log",
          "decision",
          "question",
          "warning",
          "summary",
        ])
        .optional(),
      body: z.string().min(1),
      metadata: z.record(z.unknown()).optional(),
    })
    .optional(),
});

const inboxQuerySchema = z.object({
  projectId: z.string().min(1).optional(),
  commentsOnly: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
});

function assertBackendAuth(request: FastifyRequest) {
  const apiKey = request.headers["x-api-key"];
  if (typeof apiKey !== "string" || apiKey !== config.backendApiKey) {
    throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
  }
}

function parseActivityTime(item: {
  activityAt?: string | null;
  createdAt?: string | null;
}): number {
  const raw = item.activityAt ?? item.createdAt;
  if (!raw) return NaN;
  return Date.parse(raw);
}

function sortInboxByActivity<
  T extends { taskId: number; activityAt?: string | null; createdAt?: string | null },
>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const aTime = parseActivityTime(a);
    const bTime = parseActivityTime(b);
    if (!Number.isNaN(aTime) && !Number.isNaN(bTime) && aTime !== bTime) {
      return bTime - aTime;
    }
    return b.taskId - a.taskId;
  });
}

function previewForTask(task: Awaited<ReturnType<typeof getBridgeTask>>): string | null {
  if (!task) return null;
  if (task.answer?.trim()) {
    const text = task.answer.trim();
    return text.length > 160 ? `${text.slice(0, 157)}...` : text;
  }
  return null;
}

function latestCommentByAuthor(comments: TaskComment[], authorType: TaskComment["authorType"]) {
  for (let index = comments.length - 1; index >= 0; index -= 1) {
    const entry = comments[index];
    if (entry.authorType === authorType) return entry;
  }
  return null;
}

function consumerStatus(task: Awaited<ReturnType<typeof getBridgeTask>>) {
  if (!task) return "sent";
  if (task.status === "open" || task.status === "in_progress") return "sent";

  const comments = Array.isArray(task.comments) ? task.comments : [];
  const lastHuman = latestCommentByAuthor(comments, "human");
  const lastAi = latestCommentByAuthor(comments, "ai");
  if (lastHuman && lastAi) {
    const humanAt = Date.parse(lastHuman.at);
    const aiAt = Date.parse(lastAi.at);
    if (!Number.isNaN(humanAt) && !Number.isNaN(aiAt) && humanAt > aiAt) {
      return "sent";
    }
  }

  if (task.aiSummary?.trim() || task.answer?.trim()) return "ready";
  if (task.status === "done" || task.answeredAt) return "ready";
  return "sent";
}

function mapComments(task: BridgeTask) {
  return (Array.isArray(task.comments) ? task.comments : []).map((comment) => ({
    id: comment.id,
    authorType: comment.authorType,
    authorId: comment.authorId,
    type: comment.type,
    body: comment.body,
    at: comment.at,
    metadata: comment.metadata ?? null,
    by: comment.authorId,
    text: comment.body,
    role: comment.authorType === "human" ? "user" : "assistant",
  }));
}

function mapTaskDetail(task: BridgeTask) {
  const createdTime = Date.parse(task.createdAt);
  const answeredTime = task.answeredAt ? Date.parse(task.answeredAt) : NaN;
  const durationMs =
    !Number.isNaN(createdTime) && !Number.isNaN(answeredTime)
      ? Math.max(0, answeredTime - createdTime)
      : null;

  return {
    taskId: task.id,
    title: task.title,
    request: canonicalDescription(task),
    description: canonicalDescription(task),
    acceptanceCriteria: null,
    aiSummary: task.aiSummary,
    aiContext: task.aiContext,
    priority: task.priority,
    labels: task.labels,
    assignee: task.assignee,
    answer: task.aiSummary ?? task.answer,
    status: consumerStatus(task),
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    answeredAt: task.answeredAt,
    durationMs,
    createdBy: task.createdBy,
    answeredBy: task.answeredBy,
    projectId: task.projectId,
    projectName: task.projectName,
    claimedBy: task.claimedBy,
    workflowStatus: task.status,
    events: task.events,
    comments: mapComments(task),
  };
}

export async function taskRoutes(app: FastifyInstance) {
  app.post("/tasks", async (request, reply) => {
    assertBackendAuth(request);
    const body = createTaskBodySchema.parse(request.body);
    await refreshProjectRegistry();
    const project = getProjectById(body.projectId);
    if (!project) {
      return reply.status(400).send({ error: "Unknown project" });
    }

    const id = await allocateTaskId();
    const { title, description } = resolveCreateTaskFields(body);

    const task = await upsertBridgeTask({
      id,
      projectId: project.id,
      projectName: project.name,
      title,
      description,
      createdBy: "mobile",
    });

    return reply.status(201).send({
      id: task.id,
      title: task.title,
      createdAt: task.createdAt,
      projectId: project.id,
      projectName: project.name,
    });
  });

  app.get("/tasks", async (request) => {
    assertBackendAuth(request);
    const bridgeTasks = await listBridgeTasks();
    return {
      items: bridgeTasks.map((task) => ({
        id: task.id,
        title: task.title,
        projectId: task.projectId,
        projectName: task.projectName,
        status: task.status,
        createdBy: task.createdBy,
        createdAt: task.createdAt,
        claimedBy: task.claimedBy,
        claimedAt: task.claimedAt,
        answeredAt: task.answeredAt,
        events: task.events,
      })),
    };
  });

  app.post("/tasks/:id/claim", async (request, reply) => {
    assertBackendAuth(request);
    const { id } = answerIdParamsSchema.parse(request.params);
    const body = claimTaskBodySchema.parse(request.body ?? {});
    const task = await claimBridgeTask(id, body.claimedBy);
    if (!task) {
      const existing = await getBridgeTask(id);
      if (!existing) {
        return reply.status(404).send({ error: "Task not found" });
      }
      return reply.status(409).send({ error: "Task is not available to claim" });
    }
    return task;
  });

  app.post("/tasks/:id/unclaim", async (request, reply) => {
    assertBackendAuth(request);
    const { id } = answerIdParamsSchema.parse(request.params);
    const task = await releaseBridgeTask(id);
    if (!task) {
      return reply.status(404).send({ error: "Task not found" });
    }
    return { taskId: task.id, workflowStatus: task.status };
  });

  app.post("/worker/claim-next", async (request, reply) => {
    assertBackendAuth(request);
    const body = claimNextBodySchema.parse(request.body ?? {});
    const claimed = await claimNextTask(body.claimedBy, {
      projectId: body.projectId,
    });
    if (!claimed) {
      return reply.status(404).send({ error: "No tasks available" });
    }
    const { task, item } = claimed;
    return {
      ...item,
      workflowStatus: task.status,
      claimedBy: task.claimedBy,
      claimedAt: task.claimedAt,
      comments: mapComments(task),
    };
  });

  app.post("/tasks/:id/answered", async (request, reply) => {
    assertBackendAuth(request);
    const { id } = answerIdParamsSchema.parse(request.params);
    const body = answeredTaskBodySchema.parse(request.body ?? {});
    const task = await markBridgeTaskAnswered(id, body.answeredBy, body.answer);
    if (!task) {
      return reply.status(404).send({ error: "Task not found" });
    }
    return task;
  });

  app.post("/tasks/:id/agent-result", async (request, reply) => {
    assertBackendAuth(request);
    const { id } = answerIdParamsSchema.parse(request.params);
    const body = agentResultBodySchema.parse(request.body ?? {});
    const task = await applyAgentWorkResult(id, body);
    if (!task) {
      return reply.status(404).send({ error: "Task not found" });
    }
    return mapTaskDetail(task);
  });

  app.post("/tasks/:id/comments", async (request, reply) => {
    assertBackendAuth(request);
    const { id } = answerIdParamsSchema.parse(request.params);
    const body = commentTaskBodySchema.parse(request.body ?? {});
    const task = await addBridgeTaskUserComment(id, body.by, body.text);
    if (!task) {
      return reply.status(404).send({ error: "Task not found" });
    }
    const turnId = turnIdForTask(task);
    return reply.status(201).send({
      taskId: task.id,
      status: consumerStatus(task),
      workflowStatus: task.status,
      comments: mapComments(task),
      turnId,
    });
  });

  app.get("/worker/pending", async (request) => {
    assertBackendAuth(request);
    const items = await listPendingTasks();
    return { items };
  });

  app.get("/inbox", async (request) => {
    assertBackendAuth(request);
    const query = inboxQuerySchema.parse(request.query);
    const bridgeTasks = await listBridgeTasks();

    let items = bridgeTasks.map((task) => {
      const activityAt = task.answeredAt ?? task.claimedAt ?? task.createdAt;
      return {
        taskId: task.id,
        title: task.title,
        preview: previewForTask(task),
        status: consumerStatus(task),
        activityAt,
        updatedAt: task.answeredAt ?? task.claimedAt ?? task.createdAt,
        createdAt: task.createdAt,
        answeredAt: task.answeredAt,
        done: task.status === "done",
        projectId: task.projectId,
        projectName: task.projectName,
        createdBy: task.createdBy,
        claimedBy: task.claimedBy,
        workflowStatus: task.status,
      };
    });

    if (query.projectId) {
      items = items.filter((item) => item.projectId === query.projectId);
    }
    if (query.commentsOnly) {
      items = items.filter((item) => item.status === "ready");
    }

    items = sortInboxByActivity(items);
    const total = items.length;
    const offset = (query.page - 1) * query.limit;
    const pageItems = items.slice(offset, offset + query.limit);

    return {
      items: pageItems,
      total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    };
  });

  app.get("/answers/:id", async (request, reply) => {
    assertBackendAuth(request);
    const { id } = answerIdParamsSchema.parse(request.params);
    const task = await getBridgeTask(id);
    if (!task) {
      return reply.status(404).send({ error: "Task not found" });
    }
    return mapTaskDetail(task);
  });
}
