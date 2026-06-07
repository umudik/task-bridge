import { getProjectsDb } from "./projects-db.js";

export type WorkflowStageRow = {
  id: string;
  project_id: string;
  title: string;
  description: string;
  purpose: string;
  rules_json: string;
  position: number;
  auto_assign: number;
  decision_ids_json: string;
  layout_x: number | null;
  layout_y: number | null;
  spawn_task_count: number;
};

export type ProjectDecisionRow = {
  id: string;
  project_id: string;
  title: string;
  body: string;
  created_at: string;
  updated_at: string;
};

export type ProjectMemberRow = {
  id: string;
  project_id: string;
  name: string;
  available: number;
};

export function migrateWorkflowTables() {
  const db = getProjectsDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS workflow_stages (
      id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      purpose TEXT NOT NULL DEFAULT '',
      rules_json TEXT NOT NULL DEFAULT '[]',
      position INTEGER NOT NULL DEFAULT 0,
      auto_assign INTEGER NOT NULL DEFAULT 0,
      decision_ids_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (project_id, id)
    );

    CREATE TABLE IF NOT EXISTS project_decisions (
      id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (id)
    );

    CREATE INDEX IF NOT EXISTS idx_project_decisions_project
      ON project_decisions(project_id);

    CREATE TABLE IF NOT EXISTS project_members (
      id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      available INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (id)
    );

    CREATE INDEX IF NOT EXISTS idx_project_members_project
      ON project_members(project_id);
  `);

  const columns = db.prepare("PRAGMA table_info(workflow_stages)").all() as { name: string }[];
  const names = new Set(columns.map((column) => column.name));
  if (!names.has("layout_x")) {
    db.exec("ALTER TABLE workflow_stages ADD COLUMN layout_x REAL");
  }
  if (!names.has("layout_y")) {
    db.exec("ALTER TABLE workflow_stages ADD COLUMN layout_y REAL");
  }
  if (!names.has("spawn_task_count")) {
    db.exec("ALTER TABLE workflow_stages ADD COLUMN spawn_task_count INTEGER NOT NULL DEFAULT 0");
  }
}

export function countWorkflowStages(projectId: string): number {
  migrateWorkflowTables();
  const row = getProjectsDb()
    .prepare("SELECT COUNT(*) AS count FROM workflow_stages WHERE project_id = ?")
    .get(projectId.trim()) as { count: number };
  return row.count;
}

export function listWorkflowStageRows(projectId: string): WorkflowStageRow[] {
  migrateWorkflowTables();
  return getProjectsDb()
    .prepare(
      `SELECT id, project_id, title, description, purpose, rules_json, position, auto_assign, decision_ids_json, layout_x, layout_y, spawn_task_count
       FROM workflow_stages WHERE project_id = ? ORDER BY position ASC, title COLLATE NOCASE ASC`,
    )
    .all(projectId.trim()) as WorkflowStageRow[];
}

export function getWorkflowStageRow(projectId: string, stageId: string): WorkflowStageRow | undefined {
  migrateWorkflowTables();
  return getProjectsDb()
    .prepare(
      `SELECT id, project_id, title, description, purpose, rules_json, position, auto_assign, decision_ids_json, layout_x, layout_y, spawn_task_count
       FROM workflow_stages WHERE project_id = ? AND id = ?`,
    )
    .get(projectId.trim(), stageId.trim()) as WorkflowStageRow | undefined;
}

export function deleteWorkflowStagesForProject(projectId: string) {
  migrateWorkflowTables();
  getProjectsDb()
    .prepare("DELETE FROM workflow_stages WHERE project_id = ?")
    .run(projectId.trim());
}

export function insertWorkflowStageRow(row: {
  id: string;
  projectId: string;
  title: string;
  description: string;
  purpose: string;
  rulesJson: string;
  position: number;
  autoAssign: boolean;
  decisionIdsJson: string;
  layoutX?: number | null;
  layoutY?: number | null;
  spawnTaskCount?: number;
}) {
  migrateWorkflowTables();
  getProjectsDb()
    .prepare(
      `INSERT INTO workflow_stages
        (id, project_id, title, description, purpose, rules_json, position, auto_assign, decision_ids_json, layout_x, layout_y, spawn_task_count, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    )
    .run(
      row.id.trim(),
      row.projectId.trim(),
      row.title.trim(),
      row.description.trim(),
      row.purpose.trim(),
      row.rulesJson,
      row.position,
      row.autoAssign ? 1 : 0,
      row.decisionIdsJson,
      row.layoutX ?? null,
      row.layoutY ?? null,
      row.spawnTaskCount ?? 0,
    );
}

export function listProjectDecisionRows(projectId: string): ProjectDecisionRow[] {
  migrateWorkflowTables();
  return getProjectsDb()
    .prepare(
      `SELECT id, project_id, title, body, created_at, updated_at
       FROM project_decisions WHERE project_id = ? ORDER BY updated_at DESC`,
    )
    .all(projectId.trim()) as ProjectDecisionRow[];
}

export function getProjectDecisionRow(id: string): ProjectDecisionRow | undefined {
  migrateWorkflowTables();
  return getProjectsDb()
    .prepare(
      `SELECT id, project_id, title, body, created_at, updated_at FROM project_decisions WHERE id = ?`,
    )
    .get(id.trim()) as ProjectDecisionRow | undefined;
}

export function insertProjectDecisionRow(row: {
  id: string;
  projectId: string;
  title: string;
  body: string;
}) {
  migrateWorkflowTables();
  getProjectsDb()
    .prepare(
      `INSERT INTO project_decisions (id, project_id, title, body, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'))`,
    )
    .run(row.id.trim(), row.projectId.trim(), row.title.trim(), row.body.trim());
}

export function updateProjectDecisionRow(
  id: string,
  patch: { title?: string; body?: string },
): boolean {
  migrateWorkflowTables();
  const existing = getProjectDecisionRow(id);
  if (!existing) return false;
  const title = patch.title !== undefined ? patch.title.trim() : existing.title;
  const body = patch.body !== undefined ? patch.body.trim() : existing.body;
  const result = getProjectsDb()
    .prepare(
      `UPDATE project_decisions SET title = ?, body = ?, updated_at = datetime('now') WHERE id = ?`,
    )
    .run(title, body, id.trim());
  return result.changes > 0;
}

export function deleteProjectDecisionRow(id: string): boolean {
  migrateWorkflowTables();
  const result = getProjectsDb()
    .prepare("DELETE FROM project_decisions WHERE id = ?")
    .run(id.trim());
  return result.changes > 0;
}

export function listProjectMemberRows(projectId: string): ProjectMemberRow[] {
  migrateWorkflowTables();
  return getProjectsDb()
    .prepare(
      `SELECT id, project_id, name, available FROM project_members WHERE project_id = ? ORDER BY name COLLATE NOCASE ASC`,
    )
    .all(projectId.trim()) as ProjectMemberRow[];
}

export function getProjectMemberRow(id: string): ProjectMemberRow | undefined {
  migrateWorkflowTables();
  return getProjectsDb()
    .prepare(`SELECT id, project_id, name, available FROM project_members WHERE id = ?`)
    .get(id.trim()) as ProjectMemberRow | undefined;
}

export function insertProjectMemberRow(row: {
  id: string;
  projectId: string;
  name: string;
  available: boolean;
}) {
  migrateWorkflowTables();
  getProjectsDb()
    .prepare(
      `INSERT INTO project_members (id, project_id, name, available, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'))`,
    )
    .run(row.id.trim(), row.projectId.trim(), row.name.trim(), row.available ? 1 : 0);
}

export function updateProjectMemberRow(
  id: string,
  patch: { name?: string; available?: boolean },
): boolean {
  migrateWorkflowTables();
  const existing = getProjectMemberRow(id);
  if (!existing) return false;
  const name = patch.name !== undefined ? patch.name.trim() : existing.name;
  const available =
    patch.available !== undefined ? (patch.available ? 1 : 0) : existing.available;
  const result = getProjectsDb()
    .prepare(
      `UPDATE project_members SET name = ?, available = ?, updated_at = datetime('now') WHERE id = ?`,
    )
    .run(name, available, id.trim());
  return result.changes > 0;
}

export function deleteProjectMemberRow(id: string): boolean {
  migrateWorkflowTables();
  const result = getProjectsDb()
    .prepare("DELETE FROM project_members WHERE id = ?")
    .run(id.trim());
  return result.changes > 0;
}
