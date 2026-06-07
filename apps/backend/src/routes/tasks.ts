import type { FastifyInstance } from "fastify";
import { z } from "zod";
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
  upsertBridgeTask,
} from "../services/task-service.js";
import {
  listEpicSubtasks,
  spawnEpicWorkflow,
  syncEpicStage,
  updateTaskWorkStatus,
} from "../services/epic-service.js";
import { resolveWorkStatus, workStatusLabel } from "../domain/work-status.js";
import { getStageTitleLookup, resolveNewTaskPlacement } from "../services/workflow-service.js";
import { isWorkStatus } from "../domain/work-status.js";
import {
  claimNextTask,
  listPendingTasks,
  turnIdForTask,
} from "../services/task-queue.js";

const createEpicBodySchema = z
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

const createTaskBodySchema = z
  .object({
    parentId: z.coerce.number().int().positive(),
    title: z.string().min(1),
    description: z.string().optional(),
    stageId: z.string().min(1).optional(),
  });

function resolveEpicFields(body: z.infer<typeof createEpicBodySchema>) {
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

function createdItemResponse(task: {
  id: number;
  title: string;
  createdAt: string;
  projectId: string;
  projectName: string;
  parentId: number | null;
  stageId: string | null;
  assignee: string | null;
}) {
  return {
    id: task.id,
    title: task.title,
    createdAt: task.createdAt,
    projectId: task.projectId,
    projectName: task.projectName,
    parentId: task.parentId,
    stageId: task.stageId,
    assignee: task.assignee,
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

const workStatusBodySchema = z.object({
  workStatus: z.enum(["todo", "in_progress", "done"]),
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
  app.post("/epics", async (request, reply) => {
    assertBackendAuth(request);
    const body = createEpicBodySchema.parse(request.body);
    await refreshProjectRegistry();

    const project = getProjectById(body.projectId.trim());
    if (!project) {
      return reply.status(400).send({ error: "Unknown project" });
    }

    const id = await allocateTaskId();
    const { title, description } = resolveEpicFields(body);
    const placement = await resolveNewTaskPlacement(project.id);

    const epic = await upsertBridgeTask({
      id,
      projectId: project.id,
      projectName: project.name,
      title,
      description,
      createdBy: body.text?.trim() && !body.title?.trim() ? "mobile" : "web",
      stageId: placement.stageId,
      assignee: placement.assignee,
      parentId: null,
      workStatus: null,
    });

    await spawnEpicWorkflow(epic);
    await syncEpicStage(epic.id);

    return reply.status(201).send(createdItemResponse(epic));
  });

  app.post("/tasks", async (request, reply) => {
    assertBackendAuth(request);
    const body = createTaskBodySchema.parse(request.body);
    await refreshProjectRegistry();

    const epic = await getBridgeTask(body.parentId);
    if (!epic) {
      return reply.status(400).send({ error: "Unknown epic" });
    }
    if (epic.parentId !== null) {
      return reply.status(400).send({ error: "Tasks must belong to an epic" });
    }

    const project = getProjectById(epic.projectId);
    if (!project) {
      return reply.status(400).send({ error: "Unknown project" });
    }

    const placement = await resolveNewTaskPlacement(project.id);
    const stageId = body.stageId?.trim() || epic.stageId || placement.stageId;

    const task = await upsertBridgeTask({
      id: await allocateTaskId(),
      projectId: project.id,
      projectName: project.name,
      title: body.title.trim().slice(0, 200),
      description: body.description?.trim() ?? "",
      createdBy: "web",
      stageId,
      assignee: null,
      parentId: epic.id,
      workStatus: "todo",
    });

    await syncEpicStage(epic.id);

    return reply.status(201).send(createdItemResponse(task));
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

  app.patch("/tasks/:id/work-status", async (request, reply) => {
    assertBackendAuth(request);
    const { id } = answerIdParamsSchema.parse(request.params);
    const body = workStatusBodySchema.parse(request.body ?? {});
    if (!isWorkStatus(body.workStatus)) {
      return reply.status(400).send({ error: "Invalid work status" });
    }
    const updated = await updateTaskWorkStatus(id, body.workStatus, body.by);
    if (!updated) {
      const existing = await getBridgeTask(id);
      if (!existing) {
        return reply.status(404).send({ error: "Task not found" });
      }
      return reply.status(400).send({ error: "Only subtasks support work status" });
    }
    return await mapTaskDetail(updated);
  });

  app.get("/projects/:projectId/epics/:epicId/tasks", async (request, reply) => {
    assertBackendAuth(request);
    const params = z
      .object({
        projectId: z.string().min(1),
        epicId: z.coerce.number().int().positive(),
      })
      .parse(request.params);
    const epic = await getBridgeTask(params.epicId);
    if (!epic || epic.projectId !== params.projectId || epic.parentId !== null) {
      return reply.status(404).send({ error: "Epic not found" });
    }
    await syncEpicStage(epic.id);
    const refreshed = (await getBridgeTask(params.epicId)) ?? epic;
    const subtasks = await listEpicSubtasks(epic.id);
    const stageTitles = getStageTitleLookup(params.projectId);
    return {
      epicId: refreshed.id,
      epicTitle: refreshed.title,
      stageId: refreshed.stageId,
      stageTitle: refreshed.stageId ? (stageTitles.get(refreshed.stageId) ?? refreshed.stageId) : null,
      tasks: subtasks.map((task) => ({
        id: task.id,
        title: task.title,
        stageId: task.stageId,
        stageTitle: task.stageId ? (stageTitles.get(task.stageId) ?? task.stageId) : null,
        workStatus: resolveWorkStatus(task),
        workStatusLabel: workStatusLabel(resolveWorkStatus(task)),
        assignee: task.assignee,
      })),
    };
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
