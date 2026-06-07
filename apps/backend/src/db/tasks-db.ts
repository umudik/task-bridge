import Database from "better-sqlite3";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";
import {
  normalizeTask,
  sortTasks,
  type BridgeTask,
  type RawTask,
} from "../domain/task.js";

const moduleDir = dirname(fileURLToPath(import.meta.url));

function resolveDatabasePath(): string {
  if (config.databasePath) return config.databasePath;
  return join(moduleDir, "..", "..", "..", "..", "data", "bridge.db");
}

function resolveLegacyJsonPath(): string {
  if (process.env.BRIDGE_TASKS_PATH?.trim()) {
    return process.env.BRIDGE_TASKS_PATH.trim();
  }
  return join(moduleDir, "..", "..", "..", "..", "data", "bridge-tasks.json");
}

let db: Database.Database | null = null;

function migrate(database: Database.Database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY,
      project_id TEXT NOT NULL,
      project_name TEXT NOT NULL,
      parent_id INTEGER,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      priority TEXT,
      labels_json TEXT NOT NULL DEFAULT '[]',
      assignee TEXT,
      ai_context TEXT,
      ai_summary TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      claimed_by TEXT,
      claimed_at TEXT,
      answered_by TEXT,
      answered_at TEXT,
      answer TEXT,
      stage_id TEXT,
      comments_json TEXT NOT NULL DEFAULT '[]',
      events_json TEXT NOT NULL DEFAULT '[]'
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_parent_id ON tasks(parent_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_stage_id ON tasks(stage_id);
  `);
}

function rowToTask(row: Record<string, unknown>): BridgeTask {
  return normalizeTask({
    id: Number(row.id),
    projectId: String(row.project_id),
    projectName: String(row.project_name),
    parentId: row.parent_id === null || row.parent_id === undefined ? null : Number(row.parent_id),
    title: String(row.title),
    description: String(row.description),
    acceptanceCriteria: null,
    priority: row.priority === null || row.priority === undefined ? null : String(row.priority),
    labels: JSON.parse(String(row.labels_json)) as string[],
    assignee: row.assignee === null || row.assignee === undefined ? null : String(row.assignee),
    aiContext: row.ai_context === null || row.ai_context === undefined ? null : String(row.ai_context),
    aiSummary: row.ai_summary === null || row.ai_summary === undefined ? null : String(row.ai_summary),
    createdBy: String(row.created_by),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    claimedBy: row.claimed_by === null || row.claimed_by === undefined ? null : String(row.claimed_by),
    claimedAt: row.claimed_at === null || row.claimed_at === undefined ? null : String(row.claimed_at),
    answeredBy: row.answered_by === null || row.answered_by === undefined ? null : String(row.answered_by),
    answeredAt: row.answered_at === null || row.answered_at === undefined ? null : String(row.answered_at),
    answer: row.answer === null || row.answer === undefined ? null : String(row.answer),
    stageId: row.stage_id === null || row.stage_id === undefined ? null : String(row.stage_id),
    comments: JSON.parse(String(row.comments_json)),
    events: JSON.parse(String(row.events_json)),
  } as RawTask);
}

function taskToRow(task: BridgeTask): Record<string, unknown> {
  return {
    id: task.id,
    project_id: task.projectId,
    project_name: task.projectName,
    parent_id: task.parentId,
    title: task.title,
    description: task.description,
    priority: task.priority,
    labels_json: JSON.stringify(task.labels),
    assignee: task.assignee,
    ai_context: task.aiContext,
    ai_summary: task.aiSummary,
    created_by: task.createdBy,
    created_at: task.createdAt,
    updated_at: task.updatedAt,
    claimed_by: task.claimedBy,
    claimed_at: task.claimedAt,
    answered_by: task.answeredBy,
    answered_at: task.answeredAt,
    answer: task.answer,
    stage_id: task.stageId,
    comments_json: JSON.stringify(task.comments),
    events_json: JSON.stringify(task.events),
  };
}

function importLegacyJson(database: Database.Database) {
  const count = database.prepare("SELECT COUNT(*) AS total FROM tasks").get() as { total: number };
  if (count.total > 0) return;

  const legacyPath = resolveLegacyJsonPath();
  if (!existsSync(legacyPath)) return;

  let parsed: { tasks?: unknown[] };
  try {
    parsed = JSON.parse(readFileSync(legacyPath, "utf8")) as { tasks?: unknown[] };
  } catch {
    return;
  }
  if (!Array.isArray(parsed.tasks) || parsed.tasks.length === 0) return;

  const insert = database.prepare(`
    INSERT INTO tasks (
      id, project_id, project_name, parent_id, title, description, priority, labels_json,
      assignee, ai_context, ai_summary, created_by, created_at, updated_at, claimed_by,
      claimed_at, answered_by, answered_at, answer, stage_id, comments_json, events_json
    ) VALUES (
      @id, @project_id, @project_name, @parent_id, @title, @description, @priority, @labels_json,
      @assignee, @ai_context, @ai_summary, @created_by, @created_at, @updated_at, @claimed_by,
      @claimed_at, @answered_by, @answered_at, @answer, @stage_id, @comments_json, @events_json
    )
  `);

  const importMany = database.transaction((tasks: BridgeTask[]) => {
    for (const task of tasks) {
      insert.run(taskToRow(task));
    }
  });

  const tasks = parsed.tasks.map((entry) => normalizeTask(entry as RawTask));
  importMany(tasks);
}

export function getTasksDb(): Database.Database {
  if (db) return db;
  const path = resolveDatabasePath();
  mkdirSync(dirname(path), { recursive: true });
  db = new Database(path);
  db.pragma("journal_mode = WAL");
  migrate(db);
  importLegacyJson(db);
  return db;
}

export function listTaskRows(): BridgeTask[] {
  const database = getTasksDb();
  const rows = database.prepare("SELECT * FROM tasks ORDER BY updated_at DESC, id DESC").all();
  return sortTasks(rows.map((row) => rowToTask(row as Record<string, unknown>)));
}

export function getTaskRow(id: number): BridgeTask | null {
  const database = getTasksDb();
  const row = database.prepare("SELECT * FROM tasks WHERE id = ?").get(id);
  if (!row) return null;
  return rowToTask(row as Record<string, unknown>);
}

export function allocateTaskRowId(): number {
  const database = getTasksDb();
  const row = database.prepare("SELECT MAX(id) AS maxId FROM tasks").get() as { maxId: number | null };
  return (row.maxId ?? 0) + 1;
}

export function upsertTaskRow(task: BridgeTask): void {
  const database = getTasksDb();
  const row = taskToRow(task);
  database
    .prepare(
      `
      INSERT INTO tasks (
        id, project_id, project_name, parent_id, title, description, priority, labels_json,
        assignee, ai_context, ai_summary, created_by, created_at, updated_at, claimed_by,
        claimed_at, answered_by, answered_at, answer, stage_id, comments_json, events_json
      ) VALUES (
        @id, @project_id, @project_name, @parent_id, @title, @description, @priority, @labels_json,
        @assignee, @ai_context, @ai_summary, @created_by, @created_at, @updated_at, @claimed_by,
        @claimed_at, @answered_by, @answered_at, @answer, @stage_id, @comments_json, @events_json
      )
      ON CONFLICT(id) DO UPDATE SET
        project_id = excluded.project_id,
        project_name = excluded.project_name,
        parent_id = excluded.parent_id,
        title = excluded.title,
        description = excluded.description,
        priority = excluded.priority,
        labels_json = excluded.labels_json,
        assignee = excluded.assignee,
        ai_context = excluded.ai_context,
        ai_summary = excluded.ai_summary,
        created_by = excluded.created_by,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        claimed_by = excluded.claimed_by,
        claimed_at = excluded.claimed_at,
        answered_by = excluded.answered_by,
        answered_at = excluded.answered_at,
        answer = excluded.answer,
        stage_id = excluded.stage_id,
        comments_json = excluded.comments_json,
        events_json = excluded.events_json
    `,
    )
    .run(row);
}

export function mutateTaskRow(
  id: number,
  mutator: (task: BridgeTask) => void,
): BridgeTask | null {
  const database = getTasksDb();
  return database.transaction(() => {
    const task = getTaskRow(id);
    if (!task) return null;
    mutator(task);
    upsertTaskRow(task);
    return task;
  })();
}
