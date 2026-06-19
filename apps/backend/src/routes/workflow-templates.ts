import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AppError } from "../errors/app-error.js";
import { assertAuth } from "../middleware/auth.js";
import {
  createWorkflowTemplate,
  deleteWorkflowTemplate,
  getWorkflowTemplate,
  importWorkflowTemplate,
  listWorkflowTemplates,
  replaceWorkflowTemplate,
} from "../services/workflow-template-service.js";

const templateIdParamsSchema = z.object({
  templateId: z.string().min(1),
});

const taskTemplateSchema: z.ZodTypeAny = z.lazy(() =>
  z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    description: z.string().optional().default(""),
    assigneeRole: z.string().optional().default(""),
    assigneeKind: z.enum(["human", "ai"]).optional(),
    kind: z.enum(["task", "group"]).optional().default("task"),
    execution: z.enum(["parallel", "sequential"]).optional().default("parallel"),
    dependsOn: z.array(z.string()).optional().default([]),
    children: z.array(taskTemplateSchema).optional().default([]),
  }),
);

const stageSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional().default(""),
  position: z.number().int().nonnegative(),
  autoAssignRole: z.string().optional().default(""),
  layoutX: z.number().nullable().optional(),
  layoutY: z.number().nullable().optional(),
  spawnTaskCount: z.number().int().nonnegative().optional().default(0),
  taskTemplates: z.array(taskTemplateSchema).optional().default([]),
});

const replaceTemplateSchema = z.object({
  stages: z.array(stageSchema).min(1),
});

const createTemplateSchema = z.object({
  id: z.string().min(1).optional(),
  title: z.string().min(1),
  description: z.string().optional().default(""),
});

const importSchema = z.object({
  // accept & ignore meta fields written by export (exportedFrom, version)
  id: z.string().min(1).optional(),
  title: z.string().min(1),
  description: z.string().optional().default(""),
  stages: z.array(stageSchema).min(1),
}).passthrough();

export async function workflowTemplateRoutes(app: FastifyInstance) {
  app.get("/workflow-templates", async (request) => {
    assertAuth(request);
    return { items: listWorkflowTemplates() };
  });

  // POST /api/workflow-templates/import — must be before /:templateId routes
  app.post("/workflow-templates/import", async (request, reply) => {
    assertAuth(request);
    const body = importSchema.parse(request.body ?? {});
    const template = importWorkflowTemplate({
      id: body.id,
      title: body.title,
      description: body.description,
      stages: body.stages.map((stage) => ({
        ...stage,
        layoutX: stage.layoutX ?? null,
        layoutY: stage.layoutY ?? null,
        autoAssignRole: stage.autoAssignRole?.trim() || undefined,
      })),
    });
    return reply.status(201).send(template);
  });

  app.post("/workflow-templates", async (request, reply) => {
    assertAuth(request);
    const body = createTemplateSchema.parse(request.body ?? {});
    const template = createWorkflowTemplate(body);
    return reply.status(201).send(template);
  });

  app.get("/workflow-templates/:templateId", async (request, reply) => {
    assertAuth(request);
    const { templateId } = templateIdParamsSchema.parse(request.params);
    const template = getWorkflowTemplate(templateId);
    if (!template) {
      return reply.status(404).send({ error: "Workflow template not found" });
    }
    return template;
  });

  // GET /api/workflow-templates/:templateId/export — download as JSON file
  app.get("/workflow-templates/:templateId/export", async (request, reply) => {
    assertAuth(request);
    const { templateId } = templateIdParamsSchema.parse(request.params);
    const template = getWorkflowTemplate(templateId);
    if (!template) {
      throw new AppError("Workflow template not found", 404);
    }
    const payload = {
      exportedFrom: "task-bridge",
      version: 1,
      id: template.id,
      title: template.title,
      description: template.description,
      stages: template.stages,
    };
    const filename = `${template.id}.json`;
    return reply
      .header("Content-Type", "application/json; charset=utf-8")
      .header("Content-Disposition", `attachment; filename="${filename}"`)
      .send(JSON.stringify(payload, undefined, 2));
  });

  app.put("/workflow-templates/:templateId", async (request, reply) => {
    assertAuth(request);
    const { templateId } = templateIdParamsSchema.parse(request.params);
    const body = replaceTemplateSchema.parse(request.body ?? {});
    const template = replaceWorkflowTemplate(
      templateId,
      body.stages.map((stage) => ({
        ...stage,
        layoutX: stage.layoutX ?? null,
        layoutY: stage.layoutY ?? null,
        autoAssignRole: stage.autoAssignRole?.trim() || undefined,
      })),
    );
    return reply.status(200).send(template);
  });

  app.delete("/workflow-templates/:templateId", async (request, reply) => {
    assertAuth(request);
    const { templateId } = templateIdParamsSchema.parse(request.params);
    deleteWorkflowTemplate(templateId);
    return reply.status(204).send();
  });
}
