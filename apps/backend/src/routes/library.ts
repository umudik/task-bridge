import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { assertAuth } from "../middleware/auth.js";
import {
  createLibrary,
  createLibraryDocument,
  getLibrary,
  getLibraryDocument,
  linkDocumentToTask,
  listLibraries,
  listTaskLibraryLinks,
  removeLibrary,
  removeLibraryDocument,
  unlinkDocumentFromTask,
  updateLibrary,
  updateLibraryDocument,
} from "../services/library-service.js";

const libraryIdParamsSchema = z.object({
  libraryId: z.string().min(1),
});

const documentIdParamsSchema = z.object({
  documentId: z.string().min(1),
});

const libraryDocumentParamsSchema = z.object({
  libraryId: z.string().min(1),
  documentId: z.string().min(1),
});

const taskIdParamsSchema = z.object({
  taskId: z.coerce.number().int().positive(),
});

const createLibrarySchema = z.object({
  id: z.string().default(""),
  title: z.string().min(1),
  description: z.string().default(""),
});

const updateLibrarySchema = z.object({
  title: z.string().min(1),
  description: z.string().default(""),
});

const createDocumentSchema = z.object({
  id: z.string().default(""),
  title: z.string().min(1),
  description: z.string().default(""),
});

const linkDocumentSchema = z.object({
  taskId: z.coerce.number().int().positive(),
});

export function libraryRoutes(app: FastifyInstance) {
  app.get("/libraries", (request) => {
    assertAuth(request);
    return { items: listLibraries() };
  });

  app.post("/libraries", async (request, reply) => {
    assertAuth(request);
    let rawBody: unknown = request.body;
    if (rawBody == null) { rawBody = {}; }
    const body = createLibrarySchema.parse(rawBody);
    const library = createLibrary(body);
    return reply.status(201).send(library);
  });

  app.get("/libraries/:libraryId", async (request, reply) => {
    assertAuth(request);
    const { libraryId } = libraryIdParamsSchema.parse(request.params);
    const library = getLibrary(libraryId);
    if (!library) return reply.status(404).send({ error: "Library not found" });
    return library;
  });

  app.put("/libraries/:libraryId", (request) => {
    assertAuth(request);
    const { libraryId } = libraryIdParamsSchema.parse(request.params);
    let rawBody: unknown = request.body;
    if (rawBody == null) { rawBody = {}; }
    const body = updateLibrarySchema.parse(rawBody);
    return updateLibrary(libraryId, body);
  });

  app.delete("/libraries/:libraryId", async (request, reply) => {
    assertAuth(request);
    const { libraryId } = libraryIdParamsSchema.parse(request.params);
    removeLibrary(libraryId);
    return reply.status(204).send();
  });

  app.post("/libraries/:libraryId/documents", async (request, reply) => {
    assertAuth(request);
    const { libraryId } = libraryIdParamsSchema.parse(request.params);
    let rawBody: unknown = request.body;
    if (rawBody == null) { rawBody = {}; }
    const body = createDocumentSchema.parse(rawBody);
    const document = createLibraryDocument(libraryId, body);
    return reply.status(201).send(document);
  });

  app.get("/library-documents/:documentId", async (request, reply) => {
    assertAuth(request);
    const { documentId } = documentIdParamsSchema.parse(request.params);
    const document = getLibraryDocument(documentId);
    if (!document) return reply.status(404).send({ error: "Document not found" });
    return document;
  });

  app.put("/libraries/:libraryId/documents/:documentId", async (request, reply) => {
    assertAuth(request);
    const { libraryId, documentId } = libraryDocumentParamsSchema.parse(request.params);
    let rawBody: unknown = request.body;
    if (rawBody == null) { rawBody = {}; }
    const body = updateLibrarySchema.parse(rawBody);
    const existing = getLibraryDocument(documentId);
    if (!existing || existing.libraryId !== libraryId) {
      return reply.status(404).send({ error: "Document not found" });
    }
    return updateLibraryDocument(documentId, body);
  });

  app.delete("/libraries/:libraryId/documents/:documentId", async (request, reply) => {
    assertAuth(request);
    const { libraryId, documentId } = libraryDocumentParamsSchema.parse(request.params);
    const existing = getLibraryDocument(documentId);
    if (!existing || existing.libraryId !== libraryId) {
      return reply.status(404).send({ error: "Document not found" });
    }
    removeLibraryDocument(documentId);
    return reply.status(204).send();
  });

  app.post("/library-documents/:documentId/links", async (request, reply) => {
    assertAuth(request);
    const { documentId } = documentIdParamsSchema.parse(request.params);
    let rawBody: unknown = request.body;
    if (rawBody == null) { rawBody = {}; }
    const body = linkDocumentSchema.parse(rawBody);
    const links = linkDocumentToTask(documentId, body.taskId);
    return reply.status(201).send({ items: links });
  });

  app.delete("/library-documents/:documentId/links/:taskId", async (request, reply) => {
    assertAuth(request);
    const { documentId } = documentIdParamsSchema.parse(request.params);
    const { taskId } = taskIdParamsSchema.parse(request.params);
    unlinkDocumentFromTask(documentId, taskId);
    return reply.status(204).send();
  });

  app.get("/tasks/:taskId/library-links", (request) => {
    assertAuth(request);
    const { taskId } = taskIdParamsSchema.parse(request.params);
    return { items: listTaskLibraryLinks(taskId) };
  });
}
