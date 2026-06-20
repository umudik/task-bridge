import Fastify from "fastify";
import cors from "@fastify/cors";
import { ZodError } from "zod";
import type { AppErrorDetails } from "./errors/app-error.js";
import { isAppError, statusCodeFromError, type HandledError } from "./errors/app-error.js";
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

  initProjectRegistry();
  refreshProjectRegistry();

  healthRoutes(app);

  await app.register(
    (apiApp) => {
      docsRoutes(apiApp);
      authRoutes(apiApp);
      adminUserRoutes(apiApp);
      projectRoutes(apiApp);
      taskRoutes(apiApp);
      workflowRoutes(apiApp);
      workflowTemplateRoutes(apiApp);
      libraryRoutes(apiApp);
    },
    { prefix: "/api" },
  );

  await webRoutes(app);

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({ error: error.message });
    }
    const handled = error as HandledError;
    const statusCode = statusCodeFromError(handled);
    let message = "Internal error";
    if (error instanceof Error) {
      message = error.message;
    }
    if (statusCode >= 500) {
      logger.error(message);
    }
    const body: { error: string; details: AppErrorDetails } = { error: message, details: null };
    if (isAppError(handled) && handled.details !== null) {
      body.details = handled.details;
    }
    return reply.status(statusCode).send(body);
  });

  await app.listen({ port: config.port, host: "0.0.0.0" });
  logger.info(`Server listening on port ${config.port}`);
  logger.info(`Web UI: http://localhost:${config.port}/app/login`);
  logger.info("Projects loaded from database");
}

main().catch((err) => {
  let errMessage = String(err);
  if (err instanceof Error) {
    errMessage = err.message;
  }
  logger.error("Failed to start", { error: errMessage });
  process.exit(1);
});
