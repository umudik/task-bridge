import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { DEFAULT_WORKFLOW_TEMPLATE_ID } from "../domain/workflow-template-id.js";
import { isAppError } from "../errors/app-error.js";
import { assertAuth } from "../middleware/auth.js";
import {
  createProject,
  listPublicProjects,
  refreshProjectRegistry,
  updateProject,
  updateProjectRepoPath,
} from "../services/project-registry.js";

const projectIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const createProjectSchema = z.object({
  name: z.string().trim().min(1),
  id: z
    .string()
    .trim()
    .default("")
    .refine((value) => value === "" || projectIdPattern.test(value)),
  repoPath: z.string().trim().min(1),
  description: z.string().default(""),
  workflowTemplateId: z.string().trim().default(DEFAULT_WORKFLOW_TEMPLATE_ID),
});

const updateProjectSchema = z.object({
  name: z.string().trim().min(1),
  repoPath: z.string().trim().min(1),
  description: z.string(),
  workflowTemplateId: z.string().trim(),
});

const updateRepoPathSchema = z.object({
  repoPath: z.string().min(1),
});

const projectIdParamsSchema = z.object({
  id: z.string().min(1),
});

export function projectRoutes(app: FastifyInstance) {
  app.get("/projects", (request) => {
    assertAuth(request);
    refreshProjectRegistry();
    return { projects: listPublicProjects() };
  });

  app.post("/projects", async (request, reply) => {
    assertAuth(request);
    let postBody = request.body;
    if (postBody === null) {
      postBody = {};
    }
    const body = createProjectSchema.parse(postBody);
    const created = createProject(body);
    if (created === "duplicate") {
      return reply.status(409).send({ error: "Project id already exists" });
    }
    if (!created) {
      return reply.status(400).send({ error: "Invalid project" });
    }
    return reply.status(201).send(created);
  });

  app.patch("/projects/:id", async (request, reply) => {
    assertAuth(request);
    const { id } = projectIdParamsSchema.parse(request.params);
    let patchBody = request.body;
    if (patchBody === null) {
      patchBody = {};
    }
    const body = updateProjectSchema.parse(patchBody);
    try {
      const updated = updateProject(id, body);
      if (!updated) {
        return reply.status(404).send({ error: "Project not found" });
      }
      return {
        id: updated.id,
        name: updated.name,
        repoPath: updated.repoPath,
        description: updated.description,
        workflowTemplateId: updated.workflowTemplateId,
      };
    } catch (error) {
      if (isAppError(error)) {
        return reply.status(error.statusCode).send({ error: error.message });
      }
      throw error;
    }
  });

  app.put("/projects/:id/repo-path", async (request, reply) => {
    assertAuth(request);
    const { id } = projectIdParamsSchema.parse(request.params);
    const body = updateRepoPathSchema.parse(request.body);
    const updated = updateProjectRepoPath(id, body.repoPath);
    if (!updated) {
      return reply.status(404).send({ error: "Project not found" });
    }
    return {
      id: updated.id,
      name: updated.name,
      repoPath: updated.repoPath,
    };
  });
}
