import { getProjectsDb } from "./projects-db.js";

export type WorkflowTemplateRow = {
  id: string;
  title: string;
  description: string;
  updated_at: string;
};

export type WorkflowTemplateStageRow = {
  template_id: string;
  id: string;
  title: string;
  description: string;
  purpose: string;
  rules_json: string;
  position: number;
  auto_assign: number;
  layout_x: number | null;
  layout_y: number | null;
  spawn_task_count: number;
};

type TemplateStageSeed = {
  id: string;
  title: string;
  description: string;
  purpose: string;
  rules: string[];
  position: number;
  autoAssign: boolean;
  spawnTaskCount: number;
};

type TemplateSeed = {
  id: string;
  title: string;
  description: string;
  stages: TemplateStageSeed[];
};

const DEFAULT_TEMPLATE_SEEDS: TemplateSeed[] = [
  {
    id: "empty",
    title: "Empty",
    description: "Minimal kanban: To Do, In Progress, Done",
    stages: [
      {
        id: "todo",
        title: "To Do",
        description: "Planned work",
        purpose: "Queue",
        rules: [],
        position: 0,
        autoAssign: false,
        spawnTaskCount: 0,
      },
      {
        id: "in-progress",
        title: "In Progress",
        description: "Active work",
        purpose: "Execution",
        rules: [],
        position: 1,
        autoAssign: false,
        spawnTaskCount: 0,
      },
      {
        id: "done",
        title: "Done",
        description: "Completed",
        purpose: "Closed",
        rules: [],
        position: 2,
        autoAssign: false,
        spawnTaskCount: 0,
      },
    ],
  },
  {
    id: "go",
    title: "Go",
    description: "Go backend workflow with tests and deployment",
    stages: [
      {
        id: "backlog",
        title: "Backlog",
        description: "Incoming work",
        purpose: "Triage",
        rules: ["Issue scoped"],
        position: 0,
        autoAssign: false,
        spawnTaskCount: 0,
      },
      {
        id: "development",
        title: "Development",
        description: "Implementation",
        purpose: "Code changes",
        rules: ["Branch opened", "go test ./..."],
        position: 1,
        autoAssign: true,
        spawnTaskCount: 0,
      },
      {
        id: "test",
        title: "Tests",
        description: "Unit and integration tests",
        purpose: "Quality gate",
        rules: ["go test passes", "Race detector clean"],
        position: 2,
        autoAssign: true,
        spawnTaskCount: 0,
      },
      {
        id: "review",
        title: "Code Review",
        description: "Peer review",
        purpose: "Review gate",
        rules: ["PR approved"],
        position: 3,
        autoAssign: true,
        spawnTaskCount: 0,
      },
      {
        id: "deployment",
        title: "Deployment",
        description: "Release",
        purpose: "Ship",
        rules: ["Staging verified"],
        position: 4,
        autoAssign: true,
        spawnTaskCount: 0,
      },
      {
        id: "done",
        title: "Done",
        description: "Completed",
        purpose: "Closed",
        rules: [],
        position: 5,
        autoAssign: false,
        spawnTaskCount: 0,
      },
    ],
  },
  {
    id: "nodejs",
    title: "Node.js",
    description: "Node.js app workflow with staging and production",
    stages: [
      {
        id: "backlog",
        title: "Backlog",
        description: "Incoming work",
        purpose: "Triage",
        rules: ["Ticket described"],
        position: 0,
        autoAssign: false,
        spawnTaskCount: 0,
      },
      {
        id: "development",
        title: "Development",
        description: "Implementation",
        purpose: "Code changes",
        rules: ["npm test", "Lint clean"],
        position: 1,
        autoAssign: true,
        spawnTaskCount: 0,
      },
      {
        id: "review",
        title: "Code Review",
        description: "Peer review",
        purpose: "Review gate",
        rules: ["PR approved"],
        position: 2,
        autoAssign: true,
        spawnTaskCount: 0,
      },
      {
        id: "staging",
        title: "Staging",
        description: "Pre-production validation",
        purpose: "Staging deploy",
        rules: ["Smoke tests pass"],
        position: 3,
        autoAssign: true,
        spawnTaskCount: 0,
      },
      {
        id: "production",
        title: "Production",
        description: "Live release",
        purpose: "Production deploy",
        rules: ["Rollback plan ready"],
        position: 4,
        autoAssign: true,
        spawnTaskCount: 0,
      },
      {
        id: "done",
        title: "Done",
        description: "Completed",
        purpose: "Closed",
        rules: [],
        position: 5,
        autoAssign: false,
        spawnTaskCount: 0,
      },
    ],
  },
];

export function migrateWorkflowTemplateTables() {
  const db = getProjectsDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS workflow_templates (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS workflow_template_stages (
      template_id TEXT NOT NULL,
      id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      purpose TEXT NOT NULL DEFAULT '',
      rules_json TEXT NOT NULL DEFAULT '[]',
      position INTEGER NOT NULL DEFAULT 0,
      auto_assign INTEGER NOT NULL DEFAULT 0,
      layout_x REAL,
      layout_y REAL,
      spawn_task_count INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (template_id, id)
    );

    CREATE INDEX IF NOT EXISTS idx_workflow_template_stages_template
      ON workflow_template_stages(template_id);
  `);
}

export function countWorkflowTemplates(): number {
  migrateWorkflowTemplateTables();
  const row = getProjectsDb()
    .prepare("SELECT COUNT(*) AS count FROM workflow_templates")
    .get() as { count: number };
  return row.count;
}

export function listWorkflowTemplateRows(): WorkflowTemplateRow[] {
  migrateWorkflowTemplateTables();
  return getProjectsDb()
    .prepare(
      "SELECT id, title, description, updated_at FROM workflow_templates ORDER BY title COLLATE NOCASE ASC",
    )
    .all() as WorkflowTemplateRow[];
}

export function getWorkflowTemplateRow(id: string): WorkflowTemplateRow | undefined {
  migrateWorkflowTemplateTables();
  return getProjectsDb()
    .prepare("SELECT id, title, description, updated_at FROM workflow_templates WHERE id = ?")
    .get(id.trim()) as WorkflowTemplateRow | undefined;
}

export function listWorkflowTemplateStageRows(templateId: string): WorkflowTemplateStageRow[] {
  migrateWorkflowTemplateTables();
  return getProjectsDb()
    .prepare(
      `SELECT template_id, id, title, description, purpose, rules_json, position, auto_assign, layout_x, layout_y, spawn_task_count
       FROM workflow_template_stages WHERE template_id = ? ORDER BY position ASC, title COLLATE NOCASE ASC`,
    )
    .all(templateId.trim()) as WorkflowTemplateStageRow[];
}

export function deleteWorkflowTemplateStages(templateId: string) {
  migrateWorkflowTemplateTables();
  getProjectsDb()
    .prepare("DELETE FROM workflow_template_stages WHERE template_id = ?")
    .run(templateId.trim());
}

export function insertWorkflowTemplateRow(row: {
  id: string;
  title: string;
  description: string;
}) {
  migrateWorkflowTemplateTables();
  getProjectsDb()
    .prepare(
      `INSERT INTO workflow_templates (id, title, description, updated_at)
       VALUES (?, ?, ?, datetime('now'))`,
    )
    .run(row.id.trim(), row.title.trim(), row.description.trim());
}

export function insertWorkflowTemplateStageRow(row: {
  templateId: string;
  id: string;
  title: string;
  description: string;
  purpose: string;
  rulesJson: string;
  position: number;
  autoAssign: boolean;
  layoutX?: number | null;
  layoutY?: number | null;
  spawnTaskCount?: number;
}) {
  migrateWorkflowTemplateTables();
  getProjectsDb()
    .prepare(
      `INSERT INTO workflow_template_stages
        (template_id, id, title, description, purpose, rules_json, position, auto_assign, layout_x, layout_y, spawn_task_count, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    )
    .run(
      row.templateId.trim(),
      row.id.trim(),
      row.title.trim(),
      row.description.trim(),
      row.purpose.trim(),
      row.rulesJson,
      row.position,
      row.autoAssign ? 1 : 0,
      row.layoutX ?? null,
      row.layoutY ?? null,
      row.spawnTaskCount ?? 0,
    );
}

export function seedDefaultWorkflowTemplates() {
  migrateWorkflowTemplateTables();
  if (countWorkflowTemplates() > 0) return;
  for (const template of DEFAULT_TEMPLATE_SEEDS) {
    insertWorkflowTemplateRow({
      id: template.id,
      title: template.title,
      description: template.description,
    });
    for (const stage of template.stages) {
      insertWorkflowTemplateStageRow({
        templateId: template.id,
        id: stage.id,
        title: stage.title,
        description: stage.description,
        purpose: stage.purpose,
        rulesJson: JSON.stringify(stage.rules),
        position: stage.position,
        autoAssign: stage.autoAssign,
        spawnTaskCount: stage.spawnTaskCount,
      });
    }
  }
}
