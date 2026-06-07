import type { FastifyInstance } from "fastify";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import fastifyStatic from "@fastify/static";

const moduleDir = dirname(fileURLToPath(import.meta.url));

function resolveWebRoot() {
  const candidates = [
    join(moduleDir, "..", "..", "public"),
    join(moduleDir, "..", "..", "web", "dist"),
    join(process.cwd(), "public"),
    join(process.cwd(), "apps", "web", "dist"),
  ];
  for (const candidate of candidates) {
    if (existsSync(join(candidate, "index.html"))) {
      return candidate;
    }
  }
  return null;
}

export async function webRoutes(app: FastifyInstance) {
  const root = resolveWebRoot();
  if (!root) {
    return;
  }

  await app.register(fastifyStatic, {
    root,
    prefix: "/app/",
    wildcard: false,
  });

  const spa = async (_request: unknown, reply: { sendFile: (name: string, dir: string) => unknown }) =>
    reply.sendFile("index.html", root);

  app.get("/", async (_request, reply) => reply.redirect("/app/login"));
  app.get("/app", async (_request, reply) => reply.redirect("/app/login"));
  app.get("/app/login", spa);
  app.get("/app/projects", spa);
  app.get("/app/projects/:projectId/tasks", spa);
  app.get("/app/projects/:projectId/inbox", spa);
  app.get("/app/projects/:projectId/tasks/:taskId", spa);
  app.get("/app/projects/:projectId/mobile", spa);
  app.get("/app/projects/:projectId/workflow", spa);
  app.get("/app/*", async (request, reply) => {
    const path = request.url.split("?")[0] ?? "";
    if (path.startsWith("/app/assets/")) {
      return reply.status(404).send({ error: "Not found" });
    }
    return reply.sendFile("index.html", root);
  });
}
