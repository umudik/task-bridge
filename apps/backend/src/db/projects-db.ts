import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";

export type ProjectRow = {
  id: string;
  name: string;
  repo_path: string;
  description: string;
  workflow_template_id: string;
};

const moduleDir = dirname(fileURLToPath(import.meta.url));

function resolveDatabasePath(): string {
  if (config.databasePath) return config.databasePath;
  return join(moduleDir, "..", "..", "..", "..", "data", "bridge.db");
}

let db: Database.Database | null = null;

function columnExists(database: Database.Database, table: string, column: string): boolean {
  const rows = database.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return rows.some((row) => row.name === column);
}

function migrate(database: Database.Database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      repo_path TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'read-write',
      is_system_admin INTEGER NOT NULL DEFAULT 0,
      token TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  if (!columnExists(database, "projects", "description")) {
    database.exec("ALTER TABLE projects ADD COLUMN description TEXT NOT NULL DEFAULT ''");
  }
  if (!columnExists(database, "projects", "workflow_template_id")) {
    database.exec("ALTER TABLE projects ADD COLUMN workflow_template_id TEXT NOT NULL DEFAULT ''");
  }
}

export function getProjectsDb(): Database.Database {
  if (db) return db;
  const path = resolveDatabasePath();
  mkdirSync(dirname(path), { recursive: true });
  db = new Database(path);
  db.pragma("journal_mode = WAL");
  migrate(db);
  return db;
}

export function countProjects(): number {
  const row = getProjectsDb()
    .prepare("SELECT COUNT(*) AS count FROM projects")
    .get() as { count: number };
  return row.count;
}

export function listProjectRows(): ProjectRow[] {
  return getProjectsDb()
    .prepare("SELECT id, name, repo_path, description, workflow_template_id FROM projects ORDER BY name COLLATE NOCASE")
    .all() as ProjectRow[];
}

export function getProjectRow(id: string): ProjectRow | undefined {
  return getProjectsDb()
    .prepare("SELECT id, name, repo_path, description, workflow_template_id FROM projects WHERE id = ?")
    .get(id.trim()) as ProjectRow | undefined;
}

export function upsertProjectRow(id: string, name: string, repoPath: string) {
  getProjectsDb()
    .prepare(
      `INSERT INTO projects (id, name, repo_path, updated_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         repo_path = excluded.repo_path,
         updated_at = datetime('now')`,
    )
    .run(id.trim(), name.trim() || id.trim(), repoPath.trim());
}

export function insertProjectRow(
  id: string,
  name: string,
  repoPath: string,
  description = "",
  workflowTemplateId = "",
): boolean {
  try {
    getProjectsDb()
      .prepare(
        `INSERT INTO projects (id, name, repo_path, description, workflow_template_id, updated_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))`,
      )
      .run(id.trim(), name.trim() || id.trim(), repoPath.trim(), description.trim(), workflowTemplateId.trim());
    return true;
  } catch {
    return false;
  }
}

export function updateProjectRow(
  id: string,
  patch: { name?: string; repoPath?: string; description?: string; workflowTemplateId?: string },
): boolean {
  const existing = getProjectRow(id);
  if (!existing) return false;
  const name = patch.name !== undefined ? patch.name.trim() : existing.name;
  const repoPath = patch.repoPath !== undefined ? patch.repoPath.trim() : existing.repo_path;
  const description =
    patch.description !== undefined ? patch.description.trim() : existing.description;
  const workflowTemplateId =
    patch.workflowTemplateId !== undefined
      ? patch.workflowTemplateId.trim()
      : existing.workflow_template_id;
  const result = getProjectsDb()
    .prepare(
      `UPDATE projects SET name = ?, repo_path = ?, description = ?, workflow_template_id = ?, updated_at = datetime('now') WHERE id = ?`,
    )
    .run(name, repoPath, description, workflowTemplateId, id.trim());
  return result.changes > 0;
}

export function updateProjectRepoPathRow(id: string, repoPath: string): boolean {
  return updateProjectRow(id, { repoPath });
}
