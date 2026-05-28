import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";

export type ProjectRow = {
  id: string;
  name: string;
  repo_path: string;
};

const moduleDir = dirname(fileURLToPath(import.meta.url));

function resolveDatabasePath(): string {
  if (config.databasePath) return config.databasePath;
  return join(moduleDir, "..", "..", "..", "..", "data", "bridge.db");
}

let db: Database.Database | null = null;

function migrate(database: Database.Database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      repo_path TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
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
    .prepare("SELECT id, name, repo_path FROM projects ORDER BY name COLLATE NOCASE")
    .all() as ProjectRow[];
}

export function getProjectRow(id: string): ProjectRow | undefined {
  return getProjectsDb()
    .prepare("SELECT id, name, repo_path FROM projects WHERE id = ?")
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

export function updateProjectRepoPathRow(id: string, repoPath: string): boolean {
  const result = getProjectsDb()
    .prepare(
      `UPDATE projects SET repo_path = ?, updated_at = datetime('now') WHERE id = ?`,
    )
    .run(repoPath.trim(), id.trim());
  return result.changes > 0;
}
