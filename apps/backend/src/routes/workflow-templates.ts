import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { assertBackendAuth } from "../middleware/auth.js";
import {
  getWorkflowTemplate,
  listWorkflowTemplates,
  replaceWorkflowTemplate,
} from "../services/workflow-template-service.js";

const templateIdParamsSchema = z.object({
  templateId: z.string().min(1),
});

const stageSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional().default(""),
  purpose: z.string().optional().default(""),
  rules: z.array(z.string()).optional().default([]),
  position: z.number().int().nonnegative(),
  autoAssign: z.boolean().optional().default(false),
  decisionIds: z.array(z.string()).optional().default([]),
  layoutX: z.number().nullable().optional(),
  layoutY: z.number().nullable().optional(),
  spawnTaskCount: z.number().int().nonnegative().optional().default(0),
});

const replaceTemplateSchema = z.object({
  stages: z.array(stageSchema).min(1),
});

export async function workflowTemplateRoutes(app: FastifyInstance) {
  app.get("/workflow-templates", async (request) => {
    assertBackendAuth(request);
    return { items: listWorkflowTemplates() };
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
        spawnTaskCount: stage.spawnTaskCount ?? 0,
      })),
    );
    return reply.status(200).send(template);
  });
}
