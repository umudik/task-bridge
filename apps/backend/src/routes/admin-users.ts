import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AppError } from "../errors/app-error.js";
import { assertAuth } from "../middleware/auth.js";
import {
  getAllUsers,
  createUser,
  updateUser,
  deleteUser,
  getUserById,
  getTokenForUser,
  type UserRow,
} from "../db/users-db.js";

const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(["admin", "read-write", "read"]).default("read-write"),
});

const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.enum(["admin", "read-write", "read"]).optional(),
});

function requireAdmin(request: Parameters<typeof assertAuth>[0]): UserRow {
  const user = assertAuth(request);
  if (user.role !== "admin") {
    throw new AppError("Admin access required", 403);
  }
  return user;
}

export async function adminUserRoutes(app: FastifyInstance) {
  // GET /api/admin/users — list all users (admin only)
  app.get("/admin/users", async (request) => {
    requireAdmin(request);
    return { users: getAllUsers() };
  });

  // POST /api/admin/users — create user (admin only)
  app.post("/admin/users", async (request, reply) => {
    requireAdmin(request);
    const body = createUserSchema.parse(request.body);
    const user = createUser({
      name: body.name,
      email: body.email,
      password: body.password,
      role: body.role,
      isSystemAdmin: false,
    });
    return reply.status(201).send({ user });
  });

  // PATCH /api/admin/users/:userId — update name or role (admin only)
  app.patch("/admin/users/:userId", async (request) => {
    requireAdmin(request);
    const { userId } = request.params as { userId: string };
    const existing = getUserById(userId);
    if (!existing) throw new AppError("User not found", 404);
    if (existing.is_system_admin) {
      const incoming = request.body as { role?: string };
      if (incoming.role && incoming.role !== "admin") {
        throw new AppError("Cannot change system admin role", 400);
      }
    }
    const body = updateUserSchema.parse(request.body);
    const updated = updateUser(userId, body);
    if (!updated) throw new AppError("User not found", 404);
    return { user: updated };
  });

  // DELETE /api/admin/users/:userId — admin only, cannot delete system admin
  app.delete("/admin/users/:userId", async (request, reply) => {
    requireAdmin(request);
    const { userId } = request.params as { userId: string };
    const result = deleteUser(userId);
    if (!result.deleted) {
      throw new AppError(result.reason ?? "Cannot delete user", 400);
    }
    return reply.status(204).send();
  });

  // GET /api/admin/users/:userId/token — get user's token for mobile QR (admin only)
  app.get("/admin/users/:userId/token", async (request) => {
    requireAdmin(request);
    const { userId } = request.params as { userId: string };
    const token = getTokenForUser(userId);
    if (token === undefined) throw new AppError("User not found", 404);
    return { token };
  });
}
