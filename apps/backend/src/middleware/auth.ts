import type { FastifyRequest } from "fastify";
import { AppError } from "../errors/app-error.js";
import { listUserRows, type UserRow } from "../db/users-db.js";

export function resolveAuthUser(request: FastifyRequest): UserRow {
  const authHeader = request.headers["authorization"];
  let token = "";
  if (String(authHeader) === authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.slice(7).trim();
  }

  if (token === "") {
    throw new AppError("Unauthorized", 401);
  }

  const rows = listUserRows({ id: "", email: "", token });
  if (rows.length === 0) {
    throw new AppError("Unauthorized", 401);
  }

  const row = rows[0];
  if (!row) throw new AppError("Unauthorized", 401);
  return row;
}

export function assertAuth(request: FastifyRequest): UserRow {
  const row = resolveAuthUser(request);
  if (row.must_change_password === 1) {
    throw new AppError("Password change required", 403, {
      code: "PASSWORD_CHANGE_REQUIRED",
    });
  }
  return row;
}
