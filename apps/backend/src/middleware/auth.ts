import type { FastifyRequest } from "fastify";
import { config } from "../config.js";
import { AppError } from "../errors/app-error.js";

export function assertBackendAuth(request: FastifyRequest): void {
  const apiKey = request.headers["x-api-key"];
  if (typeof apiKey !== "string" || apiKey !== config.backendApiKey) {
    throw new AppError("Unauthorized", 401);
  }
}
