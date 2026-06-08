import { randomUUID } from "node:crypto";
import {
  deleteLibraryDocumentLink,
  deleteLibraryDocumentRow,
  deleteLibraryRow,
  getLibraryDocumentRow,
  getLibraryRow,
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
import { getTaskRow } from "../db/tasks-db.js";
import { AppError } from "../errors/app-error.js";
import { emptyToNull } from "../lib/strings.js";

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

function resolveLibraryId(inputId: string | undefined, title: string) {
  const custom = emptyToNull(inputId);
  if (custom) return custom;
  const base = slugify(title) || `library-${randomUUID()}`;
  let candidate = base;
  let suffix = 1;
  while (getLibraryRow(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function resolveDocumentId(inputId: string | undefined, title: string, libraryId: string) {
  const custom = emptyToNull(inputId);
  if (custom) return custom;
  const base = slugify(title) || `doc-${randomUUID()}`;
  let candidate = base;
  let suffix = 1;
  while (getLibraryDocumentRow(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  if (getLibraryDocumentRow(candidate)) {
    return `${libraryId}-${candidate}`;
  }
  return candidate;
}

export function listLibraries(): LibrarySummary[] {
  return listLibraryRows().map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    documentCount: listLibraryDocumentRows(row.id).length,
  }));
}

export function getLibrary(libraryId: string): LibraryDetail | null {
  const row = getLibraryRow(libraryId);
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    documents: listLibraryDocumentRows(row.id).map((doc) => ({
      id: doc.id,
      libraryId: doc.library_id,
      title: doc.title,
      description: doc.description,
    })),
  };
}

export function createLibrary(input: { id?: string; title: string; description?: string }) {
  const title = emptyToNull(input.title);
  if (!title) throw new AppError("Title is required", 400);
  const id = resolveLibraryId(input.id, title);
  if (getLibraryRow(id)) throw new AppError("Library already exists", 409);
  insertLibraryRow({ id, title, description: input.description ?? "" });
  return getLibrary(id)!;
}

export function updateLibrary(
  libraryId: string,
  input: { title: string; description?: string },
) {
  const row = getLibraryRow(libraryId);
  if (!row) throw new AppError("Library not found", 404);
  const title = emptyToNull(input.title);
  if (!title) throw new AppError("Title is required", 400);
  updateLibraryRow(libraryId, { title, description: input.description ?? "" });
  return getLibrary(libraryId)!;
}

export function removeLibrary(libraryId: string) {
  const row = getLibraryRow(libraryId);
  if (!row) throw new AppError("Library not found", 404);
  deleteLibraryRow(libraryId);
}

export function getLibraryDocument(documentId: string): LibraryDocument | null {
  const row = getLibraryDocumentRow(documentId);
  if (!row) return null;
  const library = getLibraryRow(row.library_id);
  return {
    id: row.id,
    libraryId: row.library_id,
    libraryTitle: library?.title ?? row.library_id,
    title: row.title,
    description: row.description,
    linkCount: listLibraryDocumentLinkRowsForDocument(row.id).length,
  };
}

export function createLibraryDocument(
  libraryId: string,
  input: { id?: string; title: string; description?: string },
) {
  const library = getLibraryRow(libraryId);
  if (!library) throw new AppError("Library not found", 404);
  const title = emptyToNull(input.title);
  if (!title) throw new AppError("Title is required", 400);
  const id = resolveDocumentId(input.id, title, libraryId);
  if (getLibraryDocumentRow(id)) throw new AppError("Document already exists", 409);
  insertLibraryDocumentRow({
    id,
    libraryId,
    title,
    description: input.description ?? "",
  });
  return getLibraryDocument(id)!;
}

export function updateLibraryDocument(
  documentId: string,
  input: { title: string; description?: string },
) {
  const row = getLibraryDocumentRow(documentId);
  if (!row) throw new AppError("Document not found", 404);
  const title = emptyToNull(input.title);
  if (!title) throw new AppError("Title is required", 400);
  updateLibraryDocumentRow(documentId, { title, description: input.description ?? "" });
  return getLibraryDocument(documentId)!;
}

export function removeLibraryDocument(documentId: string) {
  const row = getLibraryDocumentRow(documentId);
  if (!row) throw new AppError("Document not found", 404);
  deleteLibraryDocumentRow(documentId);
}

export function linkDocumentToTask(documentId: string, taskId: number) {
  const document = getLibraryDocumentRow(documentId);
  if (!document) throw new AppError("Document not found", 404);
  const task = getTaskRow(taskId);
  if (!task) throw new AppError("Task not found", 404);
  if (task.parentId !== null) {
    throw new AppError("Documents can only be linked to epics", 400);
  }
  insertLibraryDocumentLink(documentId, taskId);
  return listTaskLibraryLinks(taskId);
}

export function unlinkDocumentFromTask(documentId: string, taskId: number) {
  const document = getLibraryDocumentRow(documentId);
  if (!document) throw new AppError("Document not found", 404);
  deleteLibraryDocumentLink(documentId, taskId);
}

export function listTaskLibraryLinks(taskId: number): LibraryDocumentLink[] {
  const task = getTaskRow(taskId);
  if (!task) return [];
  return listLibraryDocumentLinkRowsForTask(taskId)
    .map((link) => {
      const document = getLibraryDocumentRow(link.document_id);
      if (!document) return null;
      const library = getLibraryRow(document.library_id);
      return {
        documentId: document.id,
        documentTitle: document.title,
        libraryId: document.library_id,
        libraryTitle: library?.title ?? document.library_id,
        taskId: link.task_id,
        linkedAt: link.created_at,
      };
    })
    .filter((entry): entry is LibraryDocumentLink => entry !== null);
}
