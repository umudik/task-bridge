import Fastify from "fastify";
import cors from "@fastify/cors";
import { ZodError } from "zod";
import { createLogger } from "./logger.js";
import { config } from "./config.js";
import { healthRoutes } from "./routes/health.js";
import { setupRoutes } from "./routes/setup.js";
import { projectRoutes } from "./routes/projects.js";
import { taskRoutes } from "./routes/tasks.js";
import { VikunjaClient } from "./services/vikunja-client.js";
import { bindProjectRegistry, refreshProjectRegistry } from "./services/project-registry.js";
import { resolveConnectTarget } from "./services/connect-target.js";

const logger = createLogger("backend");

async function logConnectInfo() {
  for (let attempt = 0; attempt < 15; attempt += 1) {
    const target = await resolveConnectTarget();
    if (target) {
      logger.info(`Mobil QR: http://localhost:3001/setup`);
      logger.info(`Ngrok URL: https://${target.host}`);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  logger.info("Mobil QR: http://localhost:3001/setup (ngrok henüz hazır değil)");
}

async function main() {
  const app = Fastify({ logger: false });
  await app.register(cors, { origin: true });

  const vikunja = new VikunjaClient();
  bindProjectRegistry(vikunja);
  if (vikunja.isConfigured()) {
    await refreshProjectRegistry(vikunja);
  }

  await healthRoutes(app);
  await setupRoutes(app);
  await projectRoutes(app, vikunja);
  await taskRoutes(app, vikunja);

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({ error: error.message });
    }
    const statusCode =
      typeof error === "object" &&
      error !== null &&
      "statusCode" in error &&
      typeof error.statusCode === "number"
        ? error.statusCode
        : 500;
    const message = error instanceof Error ? error.message : "Internal error";
    if (statusCode >= 500) {
      logger.error(message);
    }
    return reply.status(statusCode).send({ error: message });
  });

  await app.listen({ port: config.port, host: "0.0.0.0" });
  logger.info(`Server listening on port ${config.port}`);
  void logConnectInfo();
  if (!vikunja.isConfigured()) {
    logger.info("Vikunja credentials missing — set VIKUNJA_API_TOKEN");
  } else {
    logger.info("Projects loaded from Vikunja");
  }
}

main().catch((err) => {
  logger.error("Failed to start", {
    error: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});
