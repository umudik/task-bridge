import Fastify from "fastify";
import cors from "@fastify/cors";
import { ZodError } from "zod";
import { isAppError, statusCodeFromError } from "./errors/app-error.js";
import { createLogger } from "./logger.js";
import { config } from "./config.js";
import { healthRoutes } from "./routes/health.js";
import { connectRoutes } from "./routes/connect.js";
import { projectRoutes } from "./routes/projects.js";
import { taskRoutes } from "./routes/tasks.js";
import { workflowRoutes } from "./routes/workflow.js";
import { workflowTemplateRoutes } from "./routes/workflow-templates.js";
import { libraryRoutes } from "./routes/library.js";
import { webRoutes } from "./routes/web.js";
import { refreshProjectRegistry, initProjectRegistry } from "./services/project-registry.js";
import { resolveConnectTarget } from "./services/connect-target.js";

const logger = createLogger("backend");

async function logConnectInfo() {
  for (let attempt = 0; attempt < 15; attempt += 1) {
    const target = await resolveConnectTarget();
    if (target) {
      logger.info(`Web UI: http://localhost:3001/app/login`);
      logger.info(`Ngrok URL: https://${target.host}`);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  logger.info("Web UI: http://localhost:3001/app/login");
}

async function main() {
  const app = Fastify({ logger: false });
  await app.register(cors, { origin: true });

  await initProjectRegistry();
  await refreshProjectRegistry();

  await healthRoutes(app);
  await connectRoutes(app);
  await projectRoutes(app);
  await taskRoutes(app);
  await workflowRoutes(app);
  await workflowTemplateRoutes(app);
  await libraryRoutes(app);
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
  void logConnectInfo();
  logger.info("Projects loaded from database");
}

main().catch((err) => {
  logger.error("Failed to start", {
    error: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});
