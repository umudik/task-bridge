import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { assertBackendAuth } from "../middleware/auth.js";
import {
  createWorkflowTemplate,
  getWorkflowTemplate,
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

export async function workflowTemplateRoutes(app: FastifyInstance) {
  app.get("/workflow-templates", async (request) => {
    assertBackendAuth(request);
    return { items: listWorkflowTemplates() };
  });

  app.post("/workflow-templates", async (request, reply) => {
    assertBackendAuth(request);
    const body = createTemplateSchema.parse(request.body ?? {});
    const template = createWorkflowTemplate(body);
    return reply.status(201).send(template);
  });

  app.get("/workflow-templates/:templateId", async (request, reply) => {
    assertBackendAuth(request);
    const { templateId } = templateIdParamsSchema.parse(request.params);
    const template = getWorkflowTemplate(templateId);
    if (!template) {
      return reply.status(404).send({ error: "Workflow template not found" });
    }
    return template;
  });

  app.put("/workflow-templates/:templateId", async (request, reply) => {
    assertBackendAuth(request);
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
}
