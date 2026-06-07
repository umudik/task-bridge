import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { assertBackendAuth } from "../middleware/auth.js";
import {
  createProject,
  listPublicProjects,
  refreshProjectRegistry,
  updateProjectRepoPath,
} from "../services/project-registry.js";

const createProjectSchema = z.object({
  name: z.string().trim().min(1),
  id: z
    .string()
    .trim()
    .min(1)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .optional(),
  repoPath: z.string().trim().min(1),
  workflowTemplateId: z.string().trim().min(1).optional(),
});

const updateRepoPathSchema = z.object({
  repoPath: z.string().min(1),
});

const projectIdParamsSchema = z.object({
  id: z.string().min(1),
});

export async function projectRoutes(app: FastifyInstance) {
  app.get("/projects", async (request) => {
    assertBackendAuth(request);
    await refreshProjectRegistry();
    return { projects: listPublicProjects() };
  });

  app.post("/projects", async (request, reply) => {
    assertBackendAuth(request);
    const body = createProjectSchema.parse(request.body ?? {});
    const created = await createProject(body);
    if (created === "duplicate") {
      return reply.status(409).send({ error: "Project id already exists" });
    }
    if (!created) {
      return reply.status(400).send({ error: "Invalid project" });
    }
    return reply.status(201).send(created);
  });

  app.put("/projects/:id/repo-path", async (request, reply) => {
    assertBackendAuth(request);
    const { id } = projectIdParamsSchema.parse(request.params);
    const body = updateRepoPathSchema.parse(request.body);
    const updated = await updateProjectRepoPath(id, body.repoPath);
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
