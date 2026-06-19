import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AppError } from "../errors/app-error.js";
import {
  hasAnyUser,
  createUser,
  getUserByEmail,
  verifyPassword,
  getTokenForUser,
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

export async function authRoutes(app: FastifyInstance) {
  // GET /api/auth/status — check if system has any users (for first-run detection)
  app.get("/auth/status", async () => {
    return { hasUsers: hasAnyUser() };
  });

  // POST /api/auth/setup — create first admin (only if no users exist)
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

  // POST /api/auth/login — email + password → token
  app.post("/auth/login", async (request, reply) => {
    const body = loginSchema.parse(request.body);
    const userRow = getUserByEmail(body.email);
    if (!userRow || !verifyPassword(userRow, body.password)) {
      throw new AppError("Invalid email or password", 401);
    }
    const token = getTokenForUser(userRow.id) ?? "";
    if (!token) throw new AppError("Token not found", 500);
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

  // GET /api/auth/me — get current user info (protected)
  app.get("/auth/me", async (request) => {
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
