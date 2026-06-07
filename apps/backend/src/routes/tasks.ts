import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { isDoneStage } from "../domain/task.js";
import { assertBackendAuth } from "../middleware/auth.js";
import {
  buildInboxItems,
  consumerStatus,
  mapComments,
  mapTaskDetail,
} from "../mappers/task-response.js";
import { getProjectById, refreshProjectRegistry } from "../services/project-registry.js";
import {
  addBridgeTaskUserComment,
  allocateTaskId,
  applyAgentWorkResult,
  claimBridgeTask,
  getBridgeTask,
  listBridgeTasks,
  markBridgeTaskAnswered,
  releaseBridgeTask,
  transitionBridgeTask,
  upsertBridgeTask,
} from "../services/task-service.js";
import {
  applyStageToTask,
  resolveNewTaskPlacement,
  spawnStageSubtasks,
} from "../services/workflow-service.js";
import {
  claimNextTask,
  listPendingTasks,
  turnIdForTask,
} from "../services/task-queue.js";

const createTaskBodySchema = z
  .object({
    text: z.string().optional(),
    projectId: z.string().min(1).optional(),
    parentId: z.coerce.number().int().positive().optional(),
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
    if (!data.parentId && !data.projectId?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "projectId is required",
        path: ["projectId"],
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

const transitionTaskBodySchema = z.object({
  stageId: z.string().min(1),
  by: z.string().min(1).default("web"),
});

const agentResultBodySchema = z.object({
  action: z.enum(["task.start", "task.complete"]).optional(),
  description: z.string().optional(),
  acceptanceCriteria: z.string().optional(),
  aiSummary: z.string().optional(),
  aiContext: z.string().optional(),
  comment: z
    .object({
      tags: z.array(z.string().min(1)).optional(),
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

export async function taskRoutes(app: FastifyInstance) {
  app.post("/tasks", async (request, reply) => {
    assertBackendAuth(request);
    const body = createTaskBodySchema.parse(request.body);
    await refreshProjectRegistry();

    const parent = body.parentId ? await getBridgeTask(body.parentId) : null;
    if (body.parentId && !parent) {
      return reply.status(400).send({ error: "Unknown parent task" });
    }

    const projectId = parent?.projectId ?? body.projectId;
    if (!projectId) {
      return reply.status(400).send({ error: "projectId is required" });
    }

    const project = getProjectById(projectId);
    if (!project) {
      return reply.status(400).send({ error: "Unknown project" });
    }

    const id = await allocateTaskId();
    const { title, description } = resolveCreateTaskFields(body);
    const placement = await resolveNewTaskPlacement(project.id);

    const task = await upsertBridgeTask({
      id,
      projectId: project.id,
      projectName: project.name,
      title,
      description,
      createdBy: parent ? "web" : "mobile",
      stageId: placement.stageId,
      assignee: placement.assignee,
      parentId: parent?.id ?? null,
    });

    return reply.status(201).send({
      id: task.id,
      title: task.title,
      createdAt: task.createdAt,
      projectId: project.id,
      projectName: project.name,
      parentId: task.parentId,
      stageId: task.stageId,
      assignee: task.assignee,
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
        parentId: task.parentId,
        stageId: task.stageId,
        assignee: task.assignee,
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
    return { taskId: task.id, stageId: task.stageId };
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
      stageId: task.stageId,
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
    return await mapTaskDetail(task);
  });

  app.post("/tasks/:id/transition", async (request, reply) => {
    assertBackendAuth(request);
    const { id } = answerIdParamsSchema.parse(request.params);
    const body = transitionTaskBodySchema.parse(request.body ?? {});
    const task = await getBridgeTask(id);
    if (!task) {
      return reply.status(404).send({ error: "Task not found" });
    }
    const next = await applyStageToTask(task, body.stageId);
    const updated = await transitionBridgeTask(id, {
      stageId: body.stageId,
      assignee: next.assignee,
      by: body.by,
      answeredAt: isDoneStage(body.stageId) ? new Date().toISOString() : null,
    });
    if (!updated) {
      return reply.status(404).send({ error: "Task not found" });
    }
    await spawnStageSubtasks(updated, body.stageId);
    return await mapTaskDetail(updated);
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
      stageId: task.stageId,
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
    return buildInboxItems(query);
  });

  app.get("/answers/:id", async (request, reply) => {
    assertBackendAuth(request);
    const { id } = answerIdParamsSchema.parse(request.params);
    const task = await getBridgeTask(id);
    if (!task) {
      return reply.status(404).send({ error: "Task not found" });
    }
    return await mapTaskDetail(task);
  });
}
