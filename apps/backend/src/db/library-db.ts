import { getProjectsDb } from "./projects-db.js";

export type LibraryRow = {
  id: string;
  title: string;
  description: string;
  updated_at: string;
};

export type LibraryDocumentRow = {
  id: string;
  library_id: string;
  title: string;
  description: string;
  updated_at: string;
};

export type LibraryDocumentLinkRow = {
  document_id: string;
  task_id: number;
  created_at: string;
};

function migrateLibraryTables() {
  const db = getProjectsDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS libraries (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS library_documents (
      id TEXT PRIMARY KEY,
      library_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (library_id) REFERENCES libraries(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_library_documents_library_id ON library_documents(library_id);
    CREATE TABLE IF NOT EXISTS library_document_links (
      document_id TEXT NOT NULL,
      task_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (document_id, task_id),
      FOREIGN KEY (document_id) REFERENCES library_documents(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_library_document_links_task_id ON library_document_links(task_id);
  `);
}

function ensureMigrated() {
  migrateLibraryTables();
}

export function listLibraryRows(filter: { id: string }): LibraryRow[] {
  ensureMigrated();
  const id = filter.id.trim();
  if (id !== "") {
    return getProjectsDb()
      .prepare(
        `SELECT id, title, description, updated_at FROM libraries WHERE id = ?`,
      )
      .all(id) as LibraryRow[];
  }
  return getProjectsDb()
    .prepare(
      `SELECT id, title, description, updated_at FROM libraries ORDER BY title COLLATE NOCASE ASC`,
    )
    .all() as LibraryRow[];
}

export function insertLibraryRow(row: {
  id: string;
  title: string;
  description: string;
}) {
  ensureMigrated();
  getProjectsDb()
    .prepare(
      `INSERT INTO libraries (id, title, description, updated_at) VALUES (?, ?, ?, datetime('now'))`,
    )
    .run(row.id, row.title, row.description);
}

export function updateLibraryRow(
  id: string,
  patch: { title: string; description: string },
) {
  ensureMigrated();
  getProjectsDb()
    .prepare(
      `UPDATE libraries SET title = ?, description = ?, updated_at = datetime('now') WHERE id = ?`,
    )
    .run(patch.title, patch.description, id);
}

export function deleteLibraryRow(id: string) {
  ensureMigrated();
  const db = getProjectsDb();
  db.prepare(
    `DELETE FROM library_document_links WHERE document_id IN (SELECT id FROM library_documents WHERE library_id = ?)`,
  ).run(id);
  db.prepare(`DELETE FROM library_documents WHERE library_id = ?`).run(id);
  db.prepare(`DELETE FROM libraries WHERE id = ?`).run(id);
}

export function listLibraryDocumentRows(filter: {
  libraryId: string;
  documentId: string;
}): LibraryDocumentRow[] {
  ensureMigrated();
  const documentId = filter.documentId.trim();
  const libraryId = filter.libraryId.trim();
  if (documentId !== "") {
    return getProjectsDb()
      .prepare(
        `SELECT id, library_id, title, description, updated_at FROM library_documents WHERE id = ?`,
      )
      .all(documentId) as LibraryDocumentRow[];
  }
  if (libraryId !== "") {
    return getProjectsDb()
      .prepare(
        `SELECT id, library_id, title, description, updated_at FROM library_documents WHERE library_id = ? ORDER BY title COLLATE NOCASE ASC`,
      )
      .all(libraryId) as LibraryDocumentRow[];
  }
  return getProjectsDb()
    .prepare(
      `SELECT id, library_id, title, description, updated_at FROM library_documents ORDER BY title COLLATE NOCASE ASC`,
    )
    .all() as LibraryDocumentRow[];
}

export function insertLibraryDocumentRow(row: {
  id: string;
  libraryId: string;
  title: string;
  description: string;
}) {
  ensureMigrated();
  getProjectsDb()
    .prepare(
      `INSERT INTO library_documents (id, library_id, title, description, updated_at) VALUES (?, ?, ?, ?, datetime('now'))`,
    )
    .run(row.id, row.libraryId, row.title, row.description);
}

export function updateLibraryDocumentRow(
  id: string,
  patch: { title: string; description: string },
) {
  ensureMigrated();
  getProjectsDb()
    .prepare(
      `UPDATE library_documents SET title = ?, description = ?, updated_at = datetime('now') WHERE id = ?`,
    )
    .run(patch.title, patch.description, id);
}

export function deleteLibraryDocumentRow(id: string) {
  ensureMigrated();
  const db = getProjectsDb();
  db.prepare(`DELETE FROM library_document_links WHERE document_id = ?`).run(
    id,
  );
  db.prepare(`DELETE FROM library_documents WHERE id = ?`).run(id);
}

export function insertLibraryDocumentLink(documentId: string, taskId: number) {
  ensureMigrated();
  getProjectsDb()
    .prepare(
      `INSERT OR IGNORE INTO library_document_links (document_id, task_id, created_at) VALUES (?, ?, datetime('now'))`,
    )
    .run(documentId, taskId);
}

export function deleteLibraryDocumentLink(documentId: string, taskId: number) {
  ensureMigrated();
  getProjectsDb()
    .prepare(
      `DELETE FROM library_document_links WHERE document_id = ? AND task_id = ?`,
    )
    .run(documentId, taskId);
}

export function listLibraryDocumentLinkRowsForTask(
  taskId: number,
): LibraryDocumentLinkRow[] {
  ensureMigrated();
  return getProjectsDb()
    .prepare(
      `SELECT document_id, task_id, created_at FROM library_document_links WHERE task_id = ? ORDER BY created_at ASC`,
    )
    .all(taskId) as LibraryDocumentLinkRow[];
}

export function listLibraryDocumentLinkRowsForDocument(
  documentId: string,
): LibraryDocumentLinkRow[] {
  ensureMigrated();
  return getProjectsDb()
    .prepare(
      `SELECT document_id, task_id, created_at FROM library_document_links WHERE document_id = ? ORDER BY created_at ASC`,
    )
    .all(documentId) as LibraryDocumentLinkRow[];
}
