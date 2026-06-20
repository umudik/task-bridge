import { randomUUID } from "node:crypto";
import {
  deleteLibraryDocumentLink,
  deleteLibraryDocumentRow,
  deleteLibraryRow,
  insertLibraryDocumentLink,
  insertLibraryDocumentRow,
  insertLibraryRow,
  listLibraryDocumentLinkRowsForDocument,
  listLibraryDocumentLinkRowsForTask,
  listLibraryDocumentRows,
  listLibraryRows,
  updateLibraryDocumentRow,
  updateLibraryRow,
} from "../db/library-db.js";
import { listTaskRows } from "../db/tasks-db.js";
import { AppError } from "../errors/app-error.js";

export type LibrarySummary = {
  id: string;
  title: string;
  description: string;
  documentCount: number;
};

export type LibraryDocumentSummary = {
  id: string;
  libraryId: string;
  title: string;
  description: string;
};

export type LibraryDocument = LibraryDocumentSummary & {
  libraryTitle: string;
  linkCount: number;
};

export type LibraryDetail = {
  id: string;
  title: string;
  description: string;
  documents: LibraryDocumentSummary[];
};

export type LibraryDocumentLink = {
  documentId: string;
  documentTitle: string;
  libraryId: string;
  libraryTitle: string;
  taskId: number;
  linkedAt: string;
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function resolveLibraryId(inputId: string, title: string) {
  const custom = inputId.trim();
  if (custom !== "") return custom;
  const base = slugify(title) || `library-${randomUUID()}`;
  let candidate = base;
  let suffix = 1;
  while (listLibraryRows({ id: candidate }).length > 0) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function resolveDocumentId(inputId: string, title: string, libraryId: string) {
  const custom = inputId.trim();
  if (custom !== "") return custom;
  const base = slugify(title) || `doc-${randomUUID()}`;
  let candidate = base;
  let suffix = 1;
  while (listLibraryDocumentRows({ libraryId: "", documentId: candidate }).length > 0) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  if (listLibraryDocumentRows({ libraryId: "", documentId: candidate }).length > 0) {
    return `${libraryId}-${candidate}`;
  }
  return candidate;
}

function mapLibraryDetail(row: {
  id: string;
  title: string;
  description: string;
}): LibraryDetail {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    documents: listLibraryDocumentRows({ libraryId: row.id, documentId: "" }).map((doc) => ({
      id: doc.id,
      libraryId: doc.library_id,
      title: doc.title,
      description: doc.description,
    })),
  };
}

function mapLibraryDocument(row: {
  id: string;
  library_id: string;
  title: string;
  description: string;
}): LibraryDocument {
  const libraries = listLibraryRows({ id: row.library_id });
  let libraryTitle: string;
  const libraryRow = libraries[0];
  if (libraryRow) {
    libraryTitle = libraryRow.title;
  } else {
    libraryTitle = row.library_id;
  }
  return {
    id: row.id,
    libraryId: row.library_id,
    libraryTitle,
    title: row.title,
    description: row.description,
    linkCount: listLibraryDocumentLinkRowsForDocument(row.id).length,
  };
}

export function listLibraries(): LibrarySummary[] {
  return listLibraryRows({ id: "" }).map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    documentCount: listLibraryDocumentRows({ libraryId: row.id, documentId: "" }).length,
  }));
}

export function getLibrary(libraryId: string): LibraryDetail | null {
  const rows = listLibraryRows({ id: libraryId });
  if (rows.length === 0) return null;
  const row = rows[0];
  if (!row) return null;
  return mapLibraryDetail(row);
}

export function createLibrary(input: { id: string; title: string; description: string }) {
  const title = input.title.trim();
  if (title === "") throw new AppError("Title is required", 400);
  const id = resolveLibraryId(input.id, title);
  if (listLibraryRows({ id }).length > 0) throw new AppError("Library already exists", 409);
  insertLibraryRow({ id, title, description: input.description.trim() });
  const created = getLibrary(id);
  if (created === null) throw new AppError("Library creation failed", 500);
  return created;
}

export function updateLibrary(
  libraryId: string,
  input: { title: string; description: string },
) {
  const rows = listLibraryRows({ id: libraryId });
  if (rows.length === 0) throw new AppError("Library not found", 404);
  const title = input.title.trim();
  if (title === "") throw new AppError("Title is required", 400);
  updateLibraryRow(libraryId, { title, description: input.description.trim() });
  const updated = getLibrary(libraryId);
  if (updated === null) throw new AppError("Library not found after update", 500);
  return updated;
}

export function removeLibrary(libraryId: string) {
  if (listLibraryRows({ id: libraryId }).length === 0) {
    throw new AppError("Library not found", 404);
  }
  deleteLibraryRow(libraryId);
}

export function getLibraryDocument(documentId: string): LibraryDocument | null {
  const rows = listLibraryDocumentRows({ libraryId: "", documentId });
  if (rows.length === 0) return null;
  const row = rows[0];
  if (!row) return null;
  return mapLibraryDocument(row);
}

export function createLibraryDocument(
  libraryId: string,
  input: { id: string; title: string; description: string },
) {
  if (listLibraryRows({ id: libraryId }).length === 0) {
    throw new AppError("Library not found", 404);
  }
  const title = input.title.trim();
  if (title === "") throw new AppError("Title is required", 400);
  const id = resolveDocumentId(input.id, title, libraryId);
  if (listLibraryDocumentRows({ libraryId: "", documentId: id }).length > 0) {
    throw new AppError("Document already exists", 409);
  }
  insertLibraryDocumentRow({
    id,
    libraryId,
    title,
    description: input.description.trim(),
  });
  const created = getLibraryDocument(id);
  if (created === null) throw new AppError("Document creation failed", 500);
  return created;
}

export function updateLibraryDocument(
  documentId: string,
  input: { title: string; description: string },
) {
  if (listLibraryDocumentRows({ libraryId: "", documentId }).length === 0) {
    throw new AppError("Document not found", 404);
  }
  const title = input.title.trim();
  if (title === "") throw new AppError("Title is required", 400);
  updateLibraryDocumentRow(documentId, { title, description: input.description.trim() });
  const updated = getLibraryDocument(documentId);
  if (updated === null) throw new AppError("Document not found after update", 500);
  return updated;
}

export function removeLibraryDocument(documentId: string) {
  if (listLibraryDocumentRows({ libraryId: "", documentId }).length === 0) {
    throw new AppError("Document not found", 404);
  }
  deleteLibraryDocumentRow(documentId);
}

export function linkDocumentToTask(documentId: string, taskId: number) {
  if (listLibraryDocumentRows({ libraryId: "", documentId }).length === 0) {
    throw new AppError("Document not found", 404);
  }
  const tasks = listTaskRows({ id: taskId });
  if (tasks.length === 0) throw new AppError("Task not found", 404);
  const task = tasks[0];
  if (!task) throw new AppError("Task not found", 404);
  if (task.parentId !== null) {
    throw new AppError("Documents can only be linked to epics", 400);
  }
  insertLibraryDocumentLink(documentId, taskId);
  return listTaskLibraryLinks(taskId);
}

export function unlinkDocumentFromTask(documentId: string, taskId: number) {
  if (listLibraryDocumentRows({ libraryId: "", documentId }).length === 0) {
    throw new AppError("Document not found", 404);
  }
  deleteLibraryDocumentLink(documentId, taskId);
}

export function listTaskLibraryLinks(taskId: number): LibraryDocumentLink[] {
  if (listTaskRows({ id: taskId }).length === 0) return [];
  return listLibraryDocumentLinkRowsForTask(taskId).flatMap((link) => {
    const docs = listLibraryDocumentRows({ libraryId: "", documentId: link.document_id });
    if (docs.length === 0) return [];
    const document = docs[0];
    if (!document) return [];
    const libraries = listLibraryRows({ id: document.library_id });
    let libraryTitle: string;
    const libraryRow = libraries[0];
    if (libraryRow) {
      libraryTitle = libraryRow.title;
    } else {
      libraryTitle = document.library_id;
    }
    return [
      {
        documentId: document.id,
        documentTitle: document.title,
        libraryId: document.library_id,
        libraryTitle,
        taskId: link.task_id,
        linkedAt: link.created_at,
      },
    ];
  });
}
