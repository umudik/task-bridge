import Database from "better-sqlite3";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";
import {
  DONE_STAGE_ID,
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

function columnExists(database: Database.Database, table: string, column: string): boolean {
  const rows = database.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return rows.some((row) => row.name === column);
}

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
  if (!columnExists(database, "tasks", "work_status")) {
    database.exec(`ALTER TABLE tasks ADD COLUMN work_status TEXT`);
    database.exec(`UPDATE tasks SET work_status = 'done' WHERE parent_id IS NOT NULL AND stage_id = 'done'`);
    database.exec(`UPDATE tasks SET work_status = 'todo' WHERE parent_id IS NOT NULL AND (work_status IS NULL OR work_status = '')`);
  }
  if (!columnExists(database, "tasks", "template_id")) {
    database.exec(`ALTER TABLE tasks ADD COLUMN template_id TEXT`);
  }
  if (!columnExists(database, "tasks", "assignee_role")) {
    database.exec(`ALTER TABLE tasks ADD COLUMN assignee_role TEXT`);
  }
  if (!columnExists(database, "tasks", "epic_id")) {
    database.exec(`ALTER TABLE tasks ADD COLUMN epic_id INTEGER`);
    database.exec(`
      UPDATE tasks
      SET epic_id = parent_id
      WHERE parent_id IS NOT NULL
        AND parent_id IN (SELECT id FROM tasks WHERE parent_id IS NULL)
    `);
    database.exec(`
      UPDATE tasks
      SET epic_id = (
        SELECT parent.parent_id
        FROM tasks parent
        WHERE parent.id = tasks.parent_id
          AND parent.parent_id IN (SELECT id FROM tasks WHERE parent_id IS NULL)
      )
      WHERE epic_id IS NULL AND parent_id IS NOT NULL
    `);
  }
}

function rowToTask(row: Record<string, unknown>): BridgeTask {
  return normalizeTask({
    id: Number(row.id),
    projectId: String(row.project_id),
    projectName: String(row.project_name),
    parentId: row.parent_id === null || row.parent_id === undefined ? null : Number(row.parent_id),
    epicId: row.epic_id === null || row.epic_id === undefined ? null : Number(row.epic_id),
    templateId:
      row.template_id === null || row.template_id === undefined ? null : String(row.template_id),
    title: String(row.title),
    description: String(row.description),
    acceptanceCriteria: null,
    priority: row.priority === null || row.priority === undefined ? null : String(row.priority),
    labels: JSON.parse(String(row.labels_json)) as string[],
    assignee: row.assignee === null || row.assignee === undefined ? null : String(row.assignee),
    assigneeRole:
      row.assignee_role === null || row.assignee_role === undefined
        ? null
        : String(row.assignee_role),
    createdBy: String(row.created_by),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    claimedBy: row.claimed_by === null || row.claimed_by === undefined ? null : String(row.claimed_by),
    claimedAt: row.claimed_at === null || row.claimed_at === undefined ? null : String(row.claimed_at),
    answeredBy: row.answered_by === null || row.answered_by === undefined ? null : String(row.answered_by),
    answeredAt: row.answered_at === null || row.answered_at === undefined ? null : String(row.answered_at),
    answer: row.answer === null || row.answer === undefined ? null : String(row.answer),
    stageId: row.stage_id === null || row.stage_id === undefined ? null : String(row.stage_id),
    workStatus:
      row.work_status === null || row.work_status === undefined || row.work_status === ""
        ? null
        : (String(row.work_status) as BridgeTask["workStatus"]),
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
    epic_id: task.epicId,
    template_id: task.templateId,
    title: task.title,
    description: task.description,
    priority: task.priority,
    labels_json: JSON.stringify(task.labels),
    assignee: task.assignee,
    assignee_role: task.assigneeRole,
    ai_context: null,
    ai_summary: null,
    created_by: task.createdBy,
    created_at: task.createdAt,
    updated_at: task.updatedAt,
    claimed_by: task.claimedBy,
    claimed_at: task.claimedAt,
    answered_by: task.answeredBy,
    answered_at: task.answeredAt,
    answer: task.answer,
    stage_id: task.stageId,
    work_status: task.workStatus ?? null,
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
      id, project_id, project_name, parent_id, epic_id, template_id, title, description, priority, labels_json,
      assignee, ai_context, ai_summary, created_by, created_at, updated_at, claimed_by,
      claimed_at, answered_by, answered_at, answer, stage_id, work_status, comments_json, events_json
    ) VALUES (
      @id, @project_id, @project_name, @parent_id, @epic_id, @template_id, @title, @description, @priority, @labels_json,
      @assignee, @ai_context, @ai_summary, @created_by, @created_at, @updated_at, @claimed_by,
      @claimed_at, @answered_by, @answered_at, @answer, @stage_id, @work_status, @comments_json, @events_json
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

export function countActiveTasksOnStage(projectId: string, stageId: string): number {
  const database = getTasksDb();
  const row = database
    .prepare(
      `SELECT COUNT(*) AS count FROM tasks
       WHERE project_id = ? AND stage_id = ? AND stage_id != ?`,
    )
    .get(projectId.trim(), stageId.trim(), DONE_STAGE_ID) as { count: number };
  return row.count;
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
        id, project_id, project_name, parent_id, epic_id, template_id, title, description, priority, labels_json,
        assignee, assignee_role, ai_context, ai_summary, created_by, created_at, updated_at, claimed_by,
        claimed_at, answered_by, answered_at, answer, stage_id, work_status, comments_json, events_json
      ) VALUES (
        @id, @project_id, @project_name, @parent_id, @epic_id, @template_id, @title, @description, @priority, @labels_json,
        @assignee, @assignee_role, @ai_context, @ai_summary, @created_by, @created_at, @updated_at, @claimed_by,
        @claimed_at, @answered_by, @answered_at, @answer, @stage_id, @work_status, @comments_json, @events_json
      )
      ON CONFLICT(id) DO UPDATE SET
        project_id = excluded.project_id,
        project_name = excluded.project_name,
        parent_id = excluded.parent_id,
        epic_id = excluded.epic_id,
        template_id = excluded.template_id,
        title = excluded.title,
        description = excluded.description,
        priority = excluded.priority,
        labels_json = excluded.labels_json,
        assignee = excluded.assignee,
        assignee_role = excluded.assignee_role,
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
        work_status = excluded.work_status,
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
