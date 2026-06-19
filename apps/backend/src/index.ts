import Fastify from "fastify";
import cors from "@fastify/cors";
import { ZodError } from "zod";
import { isAppError, statusCodeFromError } from "./errors/app-error.js";
import { createLogger } from "./logger.js";
import { config } from "./config.js";
import { healthRoutes } from "./routes/health.js";
import { projectRoutes } from "./routes/projects.js";
import { taskRoutes } from "./routes/tasks.js";
import { workflowRoutes } from "./routes/workflow.js";
import { workflowTemplateRoutes } from "./routes/workflow-templates.js";
import { libraryRoutes } from "./routes/library.js";
import { webRoutes } from "./routes/web.js";
import { authRoutes } from "./routes/auth.js";
import { adminUserRoutes } from "./routes/admin-users.js";
import { docsRoutes } from "./routes/docs.js";
import { refreshProjectRegistry, initProjectRegistry } from "./services/project-registry.js";

const logger = createLogger("backend");

async function main() {
  const app = Fastify({ logger: false });
  await app.register(cors, { origin: true });

  await initProjectRegistry();
  await refreshProjectRegistry();

  // Health (no prefix)
  await healthRoutes(app);

  // All API routes under /api prefix
  await app.register(
    async (apiApp) => {
      await docsRoutes(apiApp);
      await authRoutes(apiApp);
      await adminUserRoutes(apiApp);
      await projectRoutes(apiApp);
      await taskRoutes(apiApp);
      await workflowRoutes(apiApp);
      await workflowTemplateRoutes(apiApp);
      await libraryRoutes(apiApp);
    },
    { prefix: "/api" },
  );

  // Web UI — serves static files + SPA fallback
  await webRoutes(app);

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({ error: error.message });
    }
    const statusCode = statusCodeFromError(error);
    const message = error instanceof Error ? error.message : "Internal error";
    if (statusCode >= 500) {
      logger.error(message);
    }
    const body: { error: string; details?: unknown } = { error: message };
    if (isAppError(error) && error.details !== undefined) {
      body.details = error.details;
    }
    return reply.status(statusCode).send(body);
  });

  await app.listen({ port: config.port, host: "0.0.0.0" });
  logger.info(`Server listening on port ${config.port}`);
  logger.info(`Web UI: http://localhost:${config.port}/app/login`);
  logger.info("Projects loaded from database");
}

main().catch((err) => {
  logger.error("Failed to start", {
    error: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});
