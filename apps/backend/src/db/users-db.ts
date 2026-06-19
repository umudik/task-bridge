import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { getProjectsDb } from "./projects-db.js";

export type UserRole = "admin" | "read-write" | "read";

export type UserRow = {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: UserRole;
  is_system_admin: number; // 0 or 1
  token: string;
  created_at: string;
  updated_at: string;
};

export type PublicUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isSystemAdmin: boolean;
  createdAt: string;
};

export function hasAnyUser(): boolean {
  const db = getProjectsDb();
  const row = db.prepare("SELECT COUNT(*) as count FROM users").get() as { count: number };
  return row.count > 0;
}

function generateToken(): string {
  return randomBytes(32).toString("hex");
}

export function createUser(params: {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  isSystemAdmin?: boolean;
}): PublicUser {
  const db = getProjectsDb();
  const id = randomBytes(8).toString("hex");
  const token = generateToken();
  const passwordHash = bcrypt.hashSync(params.password, 10);
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO users (id, name, email, password_hash, role, is_system_admin, token, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    params.name.trim(),
    params.email.trim().toLowerCase(),
    passwordHash,
    params.role,
    params.isSystemAdmin ? 1 : 0,
    token,
    now,
    now,
  );

  return rowToPublic(getUserById(id)!);
}

export function getUserByEmail(email: string): UserRow | undefined {
  const db = getProjectsDb();
  return db
    .prepare("SELECT * FROM users WHERE email = ?")
    .get(email.trim().toLowerCase()) as UserRow | undefined;
}

export function getUserByToken(token: string): UserRow | undefined {
  const db = getProjectsDb();
  return db
    .prepare("SELECT * FROM users WHERE token = ?")
    .get(token) as UserRow | undefined;
}

export function getUserById(id: string): UserRow | undefined {
  const db = getProjectsDb();
  return db
    .prepare("SELECT * FROM users WHERE id = ?")
    .get(id) as UserRow | undefined;
}

export function getAllUsers(): PublicUser[] {
  const db = getProjectsDb();
  const rows = db
    .prepare("SELECT * FROM users ORDER BY is_system_admin DESC, created_at ASC")
    .all() as UserRow[];
  return rows.map(rowToPublic);
}

export function deleteUser(id: string): { deleted: boolean; reason?: string } {
  const db = getProjectsDb();
  const user = getUserById(id);
  if (!user) return { deleted: false, reason: "User not found" };
  if (user.is_system_admin) return { deleted: false, reason: "Cannot delete the system admin" };
  db.prepare("DELETE FROM users WHERE id = ?").run(id);
  return { deleted: true };
}

export function updateUser(
  id: string,
  params: { name?: string; role?: UserRole },
): PublicUser | undefined {
  const db = getProjectsDb();
  const user = getUserById(id);
  if (!user) return undefined;
  const name = params.name?.trim() ?? user.name;
  const role = params.role ?? user.role;
  db.prepare(`
    UPDATE users SET name = ?, role = ?, updated_at = datetime('now') WHERE id = ?
  `).run(name, role, id);
  return rowToPublic(getUserById(id)!);
}

export function verifyPassword(user: UserRow, password: string): boolean {
  return bcrypt.compareSync(password, user.password_hash);
}

export function getTokenForUser(id: string): string | undefined {
  const db = getProjectsDb();
  const row = db.prepare("SELECT token FROM users WHERE id = ?").get(id) as
    | { token: string }
    | undefined;
  return row?.token;
}

function rowToPublic(row: UserRow): PublicUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    isSystemAdmin: row.is_system_admin === 1,
    createdAt: row.created_at,
  };
}
