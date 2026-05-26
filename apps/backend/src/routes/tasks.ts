import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { config } from "../config.js";
import { getProjectById, refreshProjectRegistry } from "../services/project-registry.js";
import {
  claimBridgeTask,
  getBridgeTask,
  listBridgeTasks,
  markBridgeTaskAnswered,
  upsertBridgeTask,
} from "../services/bridge-task-store.js";
import { VikunjaClient, withProjectMarker } from "../services/vikunja-client.js";

const createTaskBodySchema = z.object({
  text: z.string().min(1),
  projectId: z.string().min(1),
  title: z.string().min(1).optional(),
  description: z.string().optional(),
});

const answerIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const claimTaskBodySchema = z.object({
  claimedBy: z.string().min(1).default("worker"),
});

const answeredTaskBodySchema = z.object({
  answeredBy: z.string().min(1).default("Cursor AI"),
});

function assertBackendAuth(request: FastifyRequest) {
  const apiKey = request.headers["x-api-key"];
  if (typeof apiKey !== "string" || apiKey !== config.backendApiKey) {
    throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
  }
}

function sortInboxItems<T extends { taskId: number; createdAt?: string | null; updatedAt?: string | null }>(
  items: T[],
): T[] {
  return [...items].sort((a, b) => {
    const aTime = Date.parse(String(a.createdAt ?? a.updatedAt ?? ""));
    const bTime = Date.parse(String(b.createdAt ?? b.updatedAt ?? ""));
    if (!Number.isNaN(aTime) && !Number.isNaN(bTime) && aTime !== bTime) {
      return aTime - bTime;
    }
    return a.taskId - b.taskId;
  });
}

export async function taskRoutes(app: FastifyInstance, vikunja: VikunjaClient) {
  app.post("/tasks", async (request, reply) => {
    assertBackendAuth(request);
    const body = createTaskBodySchema.parse(request.body);
    await refreshProjectRegistry(vikunja);
    const project = getProjectById(body.projectId);
    if (!project) {
      return reply.status(400).send({ error: "Unknown project" });
    }

    const title = body.title ?? body.text.slice(0, 120);
    const description = withProjectMarker(
      project.id,
      body.description ?? body.text,
    );

    const task = await vikunja.createTask({
      title,
      description,
      vikunjaProjectId: project.vikunjaProjectId,
    });

    await upsertBridgeTask({
      id: task.id,
      projectId: project.id,
      projectName: project.name,
      title: task.title,
      description: body.description ?? body.text,
      createdBy: "mobile",
      createdAt: task.created ?? undefined,
    });

    return reply.status(201).send({
      id: task.id,
      title: task.title,
      createdAt: task.created ?? null,
      projectId: project.id,
      projectName: project.name,
      vikunjaUrl: config.vikunjaBaseUrl.replace(/\/$/, ""),
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
      return reply.status(404).send({ error: "Task not found" });
    }
    return task;
  });

  app.post("/tasks/:id/answered", async (request, reply) => {
    assertBackendAuth(request);
    const { id } = answerIdParamsSchema.parse(request.params);
    const body = answeredTaskBodySchema.parse(request.body ?? {});
    const task = await markBridgeTaskAnswered(id, body.answeredBy);
    if (!task) {
      return reply.status(404).send({ error: "Task not found" });
    }
    return task;
  });

  app.get("/inbox", async (request) => {
    assertBackendAuth(request);
    const [bridgeTasks, vikunjaTasks] = await Promise.all([
      listBridgeTasks(),
      vikunja.listAllTasks(),
    ]);
    const vikunjaById = new Map(vikunjaTasks.map((task) => [task.id, task]));
    const bridgeIds = new Set(bridgeTasks.map((task) => task.id));
    const items: Array<{
      taskId: number;
      title: string;
      preview: string;
      status: string;
      updatedAt: string | null;
      createdAt: string | null;
      answeredAt: string | null;
      done: boolean;
      projectId: string | null;
      projectName: string | null;
      createdBy: string;
      claimedBy: string | null;
      workflowStatus: string;
    }> = [];

    async function pushItem(taskId: number) {
      const task = vikunjaById.get(taskId);
      if (!task || !vikunja.isBridgeTask(task)) return;
      let bridgeTask = await getBridgeTask(task.id);
      if (!bridgeTask) {
        const project = vikunja.resolveTaskProject(task);
        if (project) {
          bridgeTask = await upsertBridgeTask({
            id: task.id,
            projectId: project.id,
            projectName: project.name,
            title: task.title,
            description: task.description ?? task.title,
            createdBy: "mobile",
            createdAt: task.created ?? undefined,
          });
        }
      }
      const comments = await vikunja.getComments(task.id);
      const hasReply = vikunja.hasMobileReply(task, comments);
      const detail = vikunja.buildAnswerDetail(task, comments);
      if (hasReply && bridgeTask && bridgeTask.status !== "done") {
        await markBridgeTaskAnswered(task.id, "Cursor AI");
      }
      items.push({
        taskId: task.id,
        title: task.title,
        preview: hasReply
          ? vikunja.latestWorkerPreview(comments, task.title)
          : "Waiting for answer",
        status: hasReply ? "ready" : "pending",
        updatedAt: task.updated ?? null,
        createdAt: bridgeTask?.createdAt ?? detail.createdAt,
        answeredAt: detail.answeredAt,
        done: task.done ?? false,
        projectId: bridgeTask?.projectId ?? detail.projectId,
        projectName: bridgeTask?.projectName ?? detail.projectName,
        createdBy: bridgeTask?.createdBy ?? "You",
        claimedBy: bridgeTask?.claimedBy ?? null,
        workflowStatus: bridgeTask?.status ?? "open",
      });
    }

    for (const bridgeTask of bridgeTasks.slice(0, 50)) {
      await pushItem(bridgeTask.id);
    }

    for (const task of vikunjaTasks) {
      if (bridgeIds.has(task.id)) continue;
      if (task.done) continue;
      if (!vikunja.isBridgeTask(task)) continue;
      await pushItem(task.id);
    }

    return { items: sortInboxItems(items) };
  });

  app.get("/answers/:id", async (request, reply) => {
    assertBackendAuth(request);
    const { id } = answerIdParamsSchema.parse(request.params);
    try {
      const task = await vikunja.getTask(id);
      const comments = await vikunja.getComments(id);
      const bridgeTask = await getBridgeTask(id);
      const detail = vikunja.buildAnswerDetail(task, comments);
      return {
        ...detail,
        createdBy: bridgeTask?.createdBy ?? detail.createdBy,
        claimedBy: bridgeTask?.claimedBy ?? null,
        workflowStatus: bridgeTask?.status ?? "open",
        events: bridgeTask?.events ?? [],
      };
    } catch {
      return reply.status(404).send({ error: "Task not found" });
    }
  });
}
