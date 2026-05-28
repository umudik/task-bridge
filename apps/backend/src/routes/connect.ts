import type { FastifyInstance } from "fastify";
import { config } from "../config.js";
import { resolveConnectTarget } from "../services/connect-target.js";

export async function connectRoutes(app: FastifyInstance) {
  app.get("/connect.json", async (_request, reply) => {
    const target = await resolveConnectTarget();
    if (!target) {
      return reply.status(503).send({ error: "Ngrok tunnel not available" });
    }
    return {
      host: target.host,
      port: target.port,
      secure: target.secure,
      apiKey: config.backendApiKey,
      source: target.source,
    };
  });

  app.get("/setup", async (_request, reply) => reply.redirect("/app/login"));
}
