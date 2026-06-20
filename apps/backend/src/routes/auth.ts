import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AppError } from "../errors/app-error.js";
import {
  hasAnyUser,
  createUser,
  listUserRows,
  verifyPassword,
  readUserToken,
} from "../db/users-db.js";
import { assertAuth } from "../middleware/auth.js";

const setupSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export function authRoutes(app: FastifyInstance) {
  app.get("/auth/status", () => {
    return { hasUsers: hasAnyUser() };
  });

  app.post("/auth/setup", async (request, reply) => {
    if (hasAnyUser()) {
      throw new AppError("Setup already completed", 409);
    }
    const body = setupSchema.parse(request.body);
    const user = createUser({
      name: body.name,
      email: body.email,
      password: body.password,
      role: "admin",
      isSystemAdmin: true,
    });
    return reply.status(201).send({ user, message: "Admin account created" });
  });

  app.post("/auth/login", async (request, reply) => {
    const body = loginSchema.parse(request.body);
    const userRows = listUserRows({ id: "", email: body.email, token: "" });
    const firstRow = userRows[0];
    if (userRows.length === 0 || !firstRow || !verifyPassword(firstRow, body.password)) {
      throw new AppError("Invalid email or password", 401);
    }
    const userRow = firstRow;
    const token = readUserToken(userRow.id);
    if (token === "") throw new AppError("Token not found", 500);
    return reply.send({
      token,
      user: {
        id: userRow.id,
        name: userRow.name,
        email: userRow.email,
        role: userRow.role,
        isSystemAdmin: userRow.is_system_admin === 1,
      },
    });
  });

  app.get("/auth/me", (request) => {
    const userRow = assertAuth(request);
    return {
      id: userRow.id,
      name: userRow.name,
      email: userRow.email,
      role: userRow.role,
      isSystemAdmin: userRow.is_system_admin === 1,
    };
  });
}
