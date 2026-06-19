import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { assertAuth } from "../middleware/auth.js";
import {
  buildInboxItems,
  mapComments,
  mapTaskDetail,
} from "../mappers/task-response.js";
import { getProjectById, refreshProjectRegistry } from "../services/project-registry.js";
import {
  addBridgeTaskUserComment,
  allocateTaskId,
  claimBridgeTask,
  getBridgeTask,
  listBridgeTasks,
  releaseBridgeTask,
  updateBridgeTaskSpec,
  upsertBridgeTask,
} from "../services/task-service.js";
import {
  applyTodoCascadeFromTask,
  listEpicSubtasks,
  spawnEpicWorkflow,
  syncEpicStage,
  updateTaskWorkStatus,
} from "../services/epic-service.js";
import { resolveEpicId } from "../domain/task.js";
import { resolveWorkStatus, workStatusLabel } from "../domain/work-status.js";
import { getStageTitleLookup, resolveNewTaskPlacement } from "../services/workflow-service.js";
import { isWorkStatus } from "../domain/work-status.js";
import {
  claimNextTask,
  listPendingTasks,
  validateTaskClaim,
} from "../services/task-queue.js";
import { resolveClaimActor, type ClaimActor } from "../services/task-claim-policy.js";
import { AppError } from "../errors/app-error.js";

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

const taskIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const claimTaskBodySchema = z.object({
  claimedBy: z.string().min(1),
});

const claimNextBodySchema = z.object({
  claimedBy: z.string().min(1),
  projectId: z.string().min(1).optional(),
});

const patchTaskBodySchema = z
  .object({
    comment: z
      .object({
        text: z.string().min(1),
        by: z.string().min(1).default("web"),
      })
      .optional(),
    description: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.comment && data.description === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "comment or description is required",
      });
    }
  });

const workStatusBodySchema = z.object({
  workStatus: z.enum(["todo", "in_progress", "done"]),
  claimedBy: z.string().min(1),
});

const inboxQuerySchema = z.object({
  projectId: z.string().min(1).optional(),
  commentsOnly: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
  epicsOnly: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
});

export async function taskRoutes(app: FastifyInstance) {
  app.post("/epics", async (request, reply) => {
    assertAuth(request);
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
    assertAuth(request);
    const body = createTaskBodySchema.parse(request.body);
    await refreshProjectRegistry();

    const parent = await getBridgeTask(body.parentId);
    if (!parent) {
      return reply.status(400).send({ error: "Unknown parent task" });
    }

    const allTasks = await listBridgeTasks();
    const epicId = resolveEpicId(allTasks, parent);
    if (!epicId) {
      return reply.status(400).send({ error: "Task must belong to an epic" });
    }

    const epic = await getBridgeTask(epicId);
    if (!epic || epic.parentId !== null) {
      return reply.status(400).send({ error: "Unknown epic" });
    }

    const project = getProjectById(epic.projectId);
    if (!project) {
      return reply.status(400).send({ error: "Unknown project" });
    }

    const placement = await resolveNewTaskPlacement(project.id);
    const stageId = body.stageId?.trim() || parent.stageId || epic.stageId || placement.stageId;

    const task = await upsertBridgeTask({
      id: await allocateTaskId(),
      projectId: project.id,
      projectName: project.name,
      title: body.title.trim().slice(0, 200),
      description: body.description?.trim() ?? "",
      createdBy: "web",
      stageId,
      assignee: null,
      parentId: parent.id,
      epicId: epic.id,
      workStatus: "todo",
    });

    await applyTodoCascadeFromTask(task, "web", { descendants: false });
    await syncEpicStage(epic.id);

    return reply.status(201).send(createdItemResponse(task));
  });

  app.get("/tasks", async (request) => {
    assertAuth(request);
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
        events: task.events,
      })),
    };
  });

  app.post("/tasks/:id/claim", async (request, reply) => {
    assertAuth(request);
    const { id } = taskIdParamsSchema.parse(request.params);
    const body = claimTaskBodySchema.parse(request.body ?? {});
    const existing = await getBridgeTask(id);
    if (!existing) {
      return reply.status(404).send({ error: "Task not found" });
    }
    const claimedBy = body.claimedBy;
    const actor = resolveClaimActor(existing.projectId, claimedBy);
    if (!actor) {
      return reply.status(404).send({ error: "Project member not found" });
    }
    const blockReason = await validateTaskClaim(id, actor);
    if (blockReason) {
      const existing = await getBridgeTask(id);
      if (!existing) {
        return reply.status(404).send({ error: "Task not found" });
      }
      return reply.status(409).send({ error: blockReason });
    }
    const task = await claimBridgeTask(id, body.claimedBy);
    if (!task) {
      return reply.status(409).send({ error: "Task is not available to claim" });
    }
    return task;
  });

  app.post("/tasks/:id/unclaim", async (request, reply) => {
    assertAuth(request);
    const { id } = taskIdParamsSchema.parse(request.params);
    const task = await releaseBridgeTask(id);
    if (!task) {
      return reply.status(404).send({ error: "Task not found" });
    }
    return { taskId: task.id, stageId: task.stageId };
  });

  app.post("/worker/claim-next", async (request, reply) => {
    assertAuth(request);
    const body = claimNextBodySchema.parse(request.body ?? {});
    if (!body.projectId) {
      return reply.status(400).send({ error: "projectId is required" });
    }
    const actor = resolveClaimActor(body.projectId, body.claimedBy);
    if (!actor) {
      return reply.status(404).send({ error: "Project member not found" });
    }
    const claimed = await claimNextTask(actor, { projectId: body.projectId });
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

  app.patch("/tasks/:id/work-status", async (request, reply) => {
    assertAuth(request);
    const { id } = taskIdParamsSchema.parse(request.params);
    const body = workStatusBodySchema.parse(request.body ?? {});
    if (!isWorkStatus(body.workStatus)) {
      return reply.status(400).send({ error: "Invalid work status" });
    }
    const existing = await getBridgeTask(id);
    if (!existing) {
      return reply.status(404).send({ error: "Task not found" });
    }
    const actor = resolveClaimActor(existing.projectId, body.claimedBy);
    if (!actor) {
      return reply.status(404).send({ error: "Project member not found" });
    }
    try {
      const updated = await updateTaskWorkStatus(id, body.workStatus, actor.claimedBy, actor);
      if (!updated) {
        if (existing.parentId === null) {
          return reply.status(400).send({ error: "Only subtasks support work status" });
        }
        return reply.status(404).send({ error: "Task not found" });
      }
      return await mapTaskDetail(updated);
    } catch (error) {
      if (error instanceof AppError) {
        return reply.status(error.statusCode).send({ error: error.message });
      }
      throw error;
    }
  });

  app.get("/projects/:projectId/epics/:epicId/tasks", async (request, reply) => {
    assertAuth(request);
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
        templateId: task.templateId,
        workStatus: resolveWorkStatus(task),
        workStatusLabel: workStatusLabel(resolveWorkStatus(task)),
        assignee: task.assignee,
      })),
    };
  });

  app.get("/tasks/:id", async (request, reply) => {
    assertAuth(request);
    const { id } = taskIdParamsSchema.parse(request.params);
    const task = await getBridgeTask(id);
    if (!task) {
      return reply.status(404).send({ error: "Task not found" });
    }
    return await mapTaskDetail(task);
  });

  app.patch("/tasks/:id", async (request, reply) => {
    assertAuth(request);
    const { id } = taskIdParamsSchema.parse(request.params);
    const body = patchTaskBodySchema.parse(request.body ?? {});
    const existing = await getBridgeTask(id);
    if (!existing) {
      return reply.status(404).send({ error: "Task not found" });
    }
    if (existing.parentId === null) {
      if (!body.comment && body.description === undefined) {
        return reply.status(400).send({ error: "Epics support description or comment updates" });
      }
      let task = existing;
      if (body.description !== undefined) {
        const updated = await updateBridgeTaskSpec(id, {
          description: body.description,
          by: body.comment?.by ?? "web",
        });
        if (!updated) {
          return reply.status(404).send({ error: "Task not found" });
        }
        task = updated;
      }
      if (body.comment) {
        const updated = await addBridgeTaskUserComment(id, body.comment.by, body.comment.text);
        if (!updated) {
          return reply.status(404).send({ error: "Task not found" });
        }
        task = updated;
      }
      return await mapTaskDetail(task);
    }
    if (!body.comment) {
      return reply.status(400).send({ error: "comment is required" });
    }
    const task = await addBridgeTaskUserComment(id, body.comment.by, body.comment.text);
    if (!task) {
      return reply.status(404).send({ error: "Task not found" });
    }
    return await mapTaskDetail(task);
  });

  app.get("/worker/pending", async (request, reply) => {
    assertAuth(request);
    const query = z
      .object({
        projectId: z.string().min(1).optional(),
        claimedBy: z.string().min(1).optional(),
      })
      .parse(request.query);
    let actor: ClaimActor | undefined;
    if (query.claimedBy) {
      if (!query.projectId) {
        return reply.status(400).send({ error: "projectId is required when filtering by claimedBy" });
      }
      actor = resolveClaimActor(query.projectId, query.claimedBy) ?? undefined;
      if (!actor) {
        return reply.status(404).send({ error: "Project member not found" });
      }
    }
    const items = await listPendingTasks(query.projectId, actor);
    return { items };
  });

  app.get("/inbox", async (request) => {
    assertAuth(request);
    const query = inboxQuerySchema.parse(request.query);
    return buildInboxItems(query);
  });

}
