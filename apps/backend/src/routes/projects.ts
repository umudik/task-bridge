import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { config } from "../config.js";
import {
  listPublicProjects,
  refreshProjectRegistry,
  updateProjectRepoPath,
} from "../services/project-registry.js";
import type { VikunjaClient } from "../services/vikunja-client.js";

function assertBackendAuth(request: FastifyRequest) {
  const apiKey = request.headers["x-api-key"];
  if (typeof apiKey !== "string" || apiKey !== config.backendApiKey) {
    throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
  }
}

const updateRepoPathSchema = z.object({
  repoPath: z.string().min(1),
});

const projectIdParamsSchema = z.object({
  id: z.string().min(1),
});

export async function projectRoutes(app: FastifyInstance, vikunja: VikunjaClient) {
  app.get("/projects", async (request) => {
    assertBackendAuth(request);
    await refreshProjectRegistry(vikunja);
    return { projects: listPublicProjects() };
  });

  app.put("/projects/:id/repo-path", async (request, reply) => {
    assertBackendAuth(request);
    const { id } = projectIdParamsSchema.parse(request.params);
    const body = updateRepoPathSchema.parse(request.body);
    const updated = await updateProjectRepoPath(id, body.repoPath, vikunja);
    if (!updated) {
      return reply.status(404).send({ error: "Project not found" });
    }
    return {
      id: updated.id,
      name: updated.name,
      vikunjaProjectId: updated.vikunjaProjectId,
      repoPath: updated.repoPath,
    };
  });
}
