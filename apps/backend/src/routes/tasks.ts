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
import { createEpicRecords } from "../services/workflow-state-service.js";
import { AppError } from "../errors/app-error.js";

const createEpicBodySchema = z
  .object({
    text: z.string().trim().optional(),
    projectId: z.string().trim().min(1),
    title: z.string().trim().optional(),
    description: z.string().trim().optional(),
  })
  .superRefine((data, ctx) => {
    let titleTrimmed = "";
    if (data.title) {
      titleTrimmed = data.title;
    }
    let textTrimmed = "";
    if (data.text) {
      textTrimmed = data.text;
    }
    if (!titleTrimmed && !textTrimmed) {
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
    title: z.string().trim().min(1),
    description: z.string().trim().optional(),
    stageId: z.string().trim().min(1).optional(),
  });

function resolveEpicFields(body: z.infer<typeof createEpicBodySchema>) {
  let titleInput = "";
  if (body.title) {
    titleInput = body.title;
  }
  let descriptionInput = "";
  if (body.description) {
    descriptionInput = body.description;
  }
  let text = "";
  if (body.text) {
    text = body.text;
  }

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

  const firstLine = text.slice(0, newline);
  const rest = text.slice(newline + 1);
  return {
    title: (firstLine || text).slice(0, 200),
    description: rest,
  };
}

function createdItemResponse(task: {
  id: number;
  title: string;
  createdAt: string | null;
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
  claimedBy: z.string().trim().min(1),
});

const claimNextBodySchema = z.object({
  claimedBy: z.string().trim().min(1),
  projectId: z.string().trim().min(1).optional(),
});

const patchTaskBodySchema = z
  .object({
    comment: z
      .object({
        text: z.string().trim().min(1),
        by: z.string().trim().min(1).default("web"),
      })
      .optional(),
    description: z.string().trim().optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.comment && !data.description) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "comment or description is required",
      });
    }
  });

const workStatusBodySchema = z.object({
  workStatus: z.enum(["todo", "in_progress", "done"]),
  claimedBy: z.string().trim().optional().default(""),
});

const inboxQuerySchema = z.object({
  projectId: z.string().trim().min(1).nullable().default(null),
  commentsOnly: z
    .enum(["true", "false"])
    .nullable()
    .default(null)
    .transform((value): boolean | null => {
      if (value === null) {
        return null;
      }
      return value === "true";
    }),
  epicsOnly: z
    .enum(["true", "false"])
    .nullable()
    .default(null)
    .transform((value): boolean | null => {
      if (value === null) {
        return null;
      }
      return value === "true";
    }),
  cursor: z.string().trim().min(1).nullable().default(null),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
});

export function taskRoutes(app: FastifyInstance) {
  app.post("/epics", async (request, reply) => {
    const user = await assertAuth(request);
    const body = createEpicBodySchema.parse(request.body);
    refreshProjectRegistry();

    const project = getProjectById(body.projectId, user.id);
    if (!project) {
      return reply.status(400).send({ error: "Unknown project" });
    }

    const id = allocateTaskId();
    const { title, description } = resolveEpicFields(body);
    const placement = resolveNewTaskPlacement(project.id);

    let hasText = false;
    if (body.text) {
      hasText = body.text.length > 0;
    }
    let hasTitle = false;
    if (body.title) {
      hasTitle = body.title.length > 0;
    }

    let createdBy = user.id;
    if (hasText && !hasTitle) {
      createdBy = user.id;
    }

    createEpicRecords({
      id,
      projectId: project.id,
      title,
      description,
      stageId: placement.stageId,
      createdBy,
    });

    const epic = upsertBridgeTask({
      id,
      projectId: project.id,
      projectName: project.name,
      title,
      description,
      createdBy,
      createdAt: null,
      stageId: placement.stageId,
      assignee: placement.assignee,
      assigneeRole: null,
      assigneeKind: null,
      parentId: null,
      epicId: null,
      templateId: null,
      workStatus: null,
    });

    spawnEpicWorkflow(epic);
    syncEpicStage(epic.id);

    return reply.status(201).send(createdItemResponse(epic));
  });

  app.post("/tasks", async (request, reply) => {
    const user = await assertAuth(request);
    const body = createTaskBodySchema.parse(request.body);
    refreshProjectRegistry();

    const parent = getBridgeTask(body.parentId);
    if (!parent) {
      return reply.status(400).send({ error: "Unknown parent task" });
    }

    const allTasks = listBridgeTasks();
    const epicId = resolveEpicId(allTasks, parent);
    if (!epicId) {
      return reply.status(400).send({ error: "Task must belong to an epic" });
    }

    const epic = getBridgeTask(epicId);
    if (!epic || epic.parentId !== null) {
      return reply.status(400).send({ error: "Unknown epic" });
    }

    const project = getProjectById(epic.projectId, user.id);
    if (!project) {
      return reply.status(400).send({ error: "Unknown project" });
    }

    const placement = resolveNewTaskPlacement(project.id);
    let bodyStageId: string | null = null;
    if (body.stageId) {
      bodyStageId = body.stageId;
    }
    let stageId = bodyStageId;
    if (stageId === null) {
      stageId = parent.stageId;
    }
    if (stageId === null) {
      stageId = epic.stageId;
    }
    if (stageId === null) {
      stageId = placement.stageId;
    }

    let descriptionValue = "";
    if (body.description) {
      descriptionValue = body.description;
    }

    const task = upsertBridgeTask({
      id: allocateTaskId(),
      projectId: project.id,
      projectName: project.name,
      title: body.title.slice(0, 200),
      description: descriptionValue,
      createdBy: "web",
      createdAt: null,
      stageId,
      assignee: null,
      assigneeRole: null,
      assigneeKind: null,
      parentId: parent.id,
      epicId: epic.id,
      templateId: null,
      workStatus: "todo",
    });

    applyTodoCascadeFromTask(task, "web", { laterStages: null, descendants: false });
    syncEpicStage(epic.id);

    return reply.status(201).send(createdItemResponse(task));
  });

  app.get("/tasks", async (request) => {
    await assertAuth(request);
    const bridgeTasks = listBridgeTasks();
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
    await assertAuth(request);
    const { id } = taskIdParamsSchema.parse(request.params);
    const claimBody = request.body || {};
    const body = claimTaskBodySchema.parse(claimBody);
    const existing = getBridgeTask(id);
    if (!existing) {
      return reply.status(404).send({ error: "Task not found" });
    }
    const claimedBy = body.claimedBy;
    const actor = resolveClaimActor(existing.projectId, claimedBy);
    if (!actor) {
      return reply.status(404).send({ error: "Project member not found" });
    }
    const blockReason = validateTaskClaim(id, actor);
    if (blockReason) {
      const existingAgain = getBridgeTask(id);
      if (!existingAgain) {
        return reply.status(404).send({ error: "Task not found" });
      }
      return reply.status(409).send({ error: blockReason });
    }
    const task = claimBridgeTask(id, body.claimedBy);
    if (!task) {
      return reply.status(409).send({ error: "Task is not available to claim" });
    }
    return task;
  });

  app.post("/tasks/:id/unclaim", async (request, reply) => {
    await assertAuth(request);
    const { id } = taskIdParamsSchema.parse(request.params);
    const task = releaseBridgeTask(id);
    if (!task) {
      return reply.status(404).send({ error: "Task not found" });
    }
    return { taskId: task.id, stageId: task.stageId };
  });

  app.post("/worker/claim-next", async (request, reply) => {
    await assertAuth(request);
    const claimNextBody = request.body || {};
    const body = claimNextBodySchema.parse(claimNextBody);
    if (!body.projectId) {
      return reply.status(400).send({ error: "projectId is required" });
    }
    const actor = resolveClaimActor(body.projectId, body.claimedBy);
    if (!actor) {
      return reply.status(404).send({ error: "Project member not found" });
    }
    const claimed = claimNextTask(actor, { projectId: body.projectId });
    if (!claimed) {
      return reply.status(404).send({ error: "No tasks available" });
    }
    const { task, item } = claimed;
    return Object.assign({}, item, {
      stageId: task.stageId,
      claimedBy: task.claimedBy,
      claimedAt: task.claimedAt,
      comments: mapComments(task),
    });
  });

  app.patch("/tasks/:id/work-status", async (request, reply) => {
    const user = await assertAuth(request);
    const { id } = taskIdParamsSchema.parse(request.params);
    const workStatusBody = request.body || {};
    const body = workStatusBodySchema.parse(workStatusBody);
    if (!isWorkStatus(body.workStatus)) {
      return reply.status(400).send({ error: "Invalid work status" });
    }
    const existing = getBridgeTask(id);
    if (!existing) {
      return reply.status(404).send({ error: "Task not found" });
    }
    let by = user.name;
    if (body.claimedBy !== "") {
      by = body.claimedBy;
    }
    try {
      const updated = updateTaskWorkStatus(id, body.workStatus, by);
      if (!updated) {
        if (existing.parentId === null) {
          return reply.status(400).send({ error: "Only subtasks support work status" });
        }
        return reply.status(404).send({ error: "Task not found" });
      }
      return mapTaskDetail(updated);
    } catch (error) {
      if (error instanceof AppError) {
        return reply.status(error.statusCode).send({ error: error.message });
      }
      throw error;
    }
  });

  app.get("/projects/:projectId/epics/:epicId/tasks", async (request, reply) => {
    await assertAuth(request);
    const params = z
      .object({
        projectId: z.string().trim().min(1),
        epicId: z.coerce.number().int().positive(),
      })
      .parse(request.params);
    const epic = getBridgeTask(params.epicId);
    if (!epic || epic.projectId !== params.projectId || epic.parentId !== null) {
      return reply.status(404).send({ error: "Epic not found" });
    }
    syncEpicStage(epic.id);
    const refreshedRaw = getBridgeTask(params.epicId);
    let refreshed = epic;
    if (refreshedRaw) {
      refreshed = refreshedRaw;
    }
    const subtasks = listEpicSubtasks(epic.id);
    const stageTitles = getStageTitleLookup(params.projectId);

    let epicStageTitle: string | null = null;
    if (refreshed.stageId) {
      const t = stageTitles.get(refreshed.stageId);
      if (t) {
        epicStageTitle = t;
      } else {
        epicStageTitle = refreshed.stageId;
      }
    }

    return {
      epicId: refreshed.id,
      epicTitle: refreshed.title,
      stageId: refreshed.stageId,
      stageTitle: epicStageTitle,
      tasks: subtasks.map((task) => {
        let taskStageTitle: string | null = null;
        if (task.stageId) {
          const t = stageTitles.get(task.stageId);
          if (t) {
            taskStageTitle = t;
          } else {
            taskStageTitle = task.stageId;
          }
        }
        return {
          id: task.id,
          title: task.title,
          stageId: task.stageId,
          stageTitle: taskStageTitle,
          templateId: task.templateId,
          workStatus: resolveWorkStatus(task),
          workStatusLabel: workStatusLabel(resolveWorkStatus(task)),
          assignee: task.assignee,
        };
      }),
    };
  });

  app.get("/tasks/:id", async (request, reply) => {
    await assertAuth(request);
    const { id } = taskIdParamsSchema.parse(request.params);
    const task = getBridgeTask(id);
    if (!task) {
      return reply.status(404).send({ error: "Task not found" });
    }
    return mapTaskDetail(task);
  });

  app.patch("/tasks/:id", async (request, reply) => {
    const user = await assertAuth(request);
    const { id } = taskIdParamsSchema.parse(request.params);
    const patchBody = request.body || {};
    const body = patchTaskBodySchema.parse(patchBody);
    const existing = getBridgeTask(id);
    if (!existing) {
      return reply.status(404).send({ error: "Task not found" });
    }
    if (existing.parentId === null) {
      if (!body.comment && !body.description) {
        return reply.status(400).send({ error: "Epics support description or comment updates" });
      }
      let task = existing;
      if (body.description) {
        const updated = updateBridgeTaskSpec(id, {
          description: body.description,
          title: null,
          by: user.name,
        });
        if (!updated) {
          return reply.status(404).send({ error: "Task not found" });
        }
        task = updated;
      }
      if (body.comment) {
        const updated = addBridgeTaskUserComment(id, user.name, body.comment.text);
        if (!updated) {
          return reply.status(404).send({ error: "Task not found" });
        }
        task = updated;
      }
      return mapTaskDetail(task);
    }
    if (!body.comment) {
      return reply.status(400).send({ error: "comment is required" });
    }
    const task = addBridgeTaskUserComment(id, user.name, body.comment.text);
    if (!task) {
      return reply.status(404).send({ error: "Task not found" });
    }
    return mapTaskDetail(task);
  });

  app.get("/worker/pending", async (request, reply) => {
    await assertAuth(request);
    const query = z
      .object({
        projectId: z.string().trim().min(1).optional(),
        claimedBy: z.string().trim().min(1).optional(),
      })
      .parse(request.query);
    let actor: ClaimActor | null = null;
    if (query.claimedBy) {
      if (!query.projectId) {
        return reply.status(400).send({ error: "projectId is required when filtering by claimedBy" });
      }
      actor = resolveClaimActor(query.projectId, query.claimedBy);
      if (!actor) {
        return reply.status(404).send({ error: "Project member not found" });
      }
    }
    const items = listPendingTasks(query.projectId, actor);
    return { items };
  });

  app.get("/inbox", async (request) => {
    await assertAuth(request);
    const query = inboxQuerySchema.parse(request.query);
    return buildInboxItems({
      projectId: query.projectId,
      commentsOnly: query.commentsOnly,
      epicsOnly: query.epicsOnly,
      cursor: query.cursor,
      limit: query.limit,
    });
  });

}
