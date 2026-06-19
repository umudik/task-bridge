import type { FastifyRequest } from "fastify";
import { AppError } from "../errors/app-error.js";
import { getUserByToken } from "../db/users-db.js";
import type { UserRow } from "../db/users-db.js";

export function assertAuth(request: FastifyRequest): UserRow {
  const authHeader = request.headers["authorization"];
  const token =
    typeof authHeader === "string" && authHeader.startsWith("Bearer ")
      ? authHeader.slice(7).trim()
      : null;

  if (!token) {
    throw new AppError("Unauthorized", 401);
  }

  const user = getUserByToken(token);
  if (!user) {
    throw new AppError("Unauthorized", 401);
  }

  return user;
}
