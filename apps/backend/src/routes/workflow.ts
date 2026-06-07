import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AppError } from "../errors/app-error.js";
import { assertBackendAuth } from "../middleware/auth.js";
import { getProjectById } from "../services/project-registry.js";
import {
  createProjectDecision,
  createProjectMember,
  ensureProjectWorkflow,
  applyWorkflowTemplateToProject,
  exportWorkflowReadable,
  getProjectWorkflow,
  removeProjectDecision,
  removeProjectMember,
  replaceProjectWorkflow,
  updateProjectDecision,
  updateProjectMember,
} from "../services/workflow-service.js";

const projectIdParamsSchema = z.object({
  projectId: z.string().min(1),
});

const decisionIdParamsSchema = z.object({
  projectId: z.string().min(1),
  decisionId: z.string().min(1),
});

const memberIdParamsSchema = z.object({
  projectId: z.string().min(1),
  memberId: z.string().min(1),
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

const replaceWorkflowSchema = z.object({
  stages: z.array(stageSchema).min(1),
});

const applyTemplateSchema = z.object({
  templateId: z.string().min(1),
});

const createDecisionSchema = z.object({
  title: z.string().min(1),
  body: z.string().optional().default(""),
});

const updateDecisionSchema = z.object({
  title: z.string().min(1).optional(),
  body: z.string().optional(),
});

const createMemberSchema = z.object({
  name: z.string().min(1),
  available: z.boolean().optional().default(true),
});

const updateMemberSchema = z.object({
  name: z.string().min(1).optional(),
  available: z.boolean().optional(),
});

async function assertProject(projectId: string) {
  const project = getProjectById(projectId);
  if (!project) {
    throw new AppError("Project not found", 404);
  }
  await ensureProjectWorkflow(projectId);
  return project;
}

export async function workflowRoutes(app: FastifyInstance) {
  app.get("/projects/:projectId/workflow", async (request) => {
    assertBackendAuth(request);
    const { projectId } = projectIdParamsSchema.parse(request.params);
    await assertProject(projectId);
    return getProjectWorkflow(projectId);
  });

  app.get("/projects/:projectId/workflow/export", async (request) => {
    assertBackendAuth(request);
    const { projectId } = projectIdParamsSchema.parse(request.params);
    await assertProject(projectId);
    return exportWorkflowReadable(projectId);
  });

  app.post("/projects/:projectId/workflow/apply-template", async (request, reply) => {
    assertBackendAuth(request);
    const { projectId } = projectIdParamsSchema.parse(request.params);
    await assertProject(projectId);
    const body = applyTemplateSchema.parse(request.body ?? {});
    const workflow = await applyWorkflowTemplateToProject(projectId, body.templateId);
    return reply.status(200).send(workflow);
  });

  app.put("/projects/:projectId/workflow", async (request, reply) => {
    assertBackendAuth(request);
    const { projectId } = projectIdParamsSchema.parse(request.params);
    await assertProject(projectId);
    const body = replaceWorkflowSchema.parse(request.body ?? {});
    const workflow = await replaceProjectWorkflow(
      projectId,
      body.stages.map((stage) => ({
        ...stage,
        layoutX: stage.layoutX ?? null,
        layoutY: stage.layoutY ?? null,
      })),
    );
    return reply.status(200).send(workflow);
  });

  app.get("/projects/:projectId/decisions", async (request) => {
    assertBackendAuth(request);
    const { projectId } = projectIdParamsSchema.parse(request.params);
    await assertProject(projectId);
    const workflow = await getProjectWorkflow(projectId);
    return { items: workflow.decisions };
  });

  app.post("/projects/:projectId/decisions", async (request, reply) => {
    assertBackendAuth(request);
    const { projectId } = projectIdParamsSchema.parse(request.params);
    await assertProject(projectId);
    const body = createDecisionSchema.parse(request.body ?? {});
    const decision = await createProjectDecision({
      projectId,
      title: body.title,
      body: body.body,
    });
    return reply.status(201).send(decision);
  });

  app.patch("/projects/:projectId/decisions/:decisionId", async (request, reply) => {
    assertBackendAuth(request);
    const { projectId, decisionId } = decisionIdParamsSchema.parse(request.params);
    await assertProject(projectId);
    const body = updateDecisionSchema.parse(request.body ?? {});
    const decision = await updateProjectDecision(decisionId, body);
    if (!decision || decision.projectId !== projectId) {
      return reply.status(404).send({ error: "Decision not found" });
    }
    return decision;
  });

  app.delete("/projects/:projectId/decisions/:decisionId", async (request, reply) => {
    assertBackendAuth(request);
    const { projectId, decisionId } = decisionIdParamsSchema.parse(request.params);
    await assertProject(projectId);
    const removed = await removeProjectDecision(decisionId);
    if (!removed) {
      return reply.status(404).send({ error: "Decision not found" });
    }
    return reply.status(204).send();
  });

  app.get("/projects/:projectId/members", async (request) => {
    assertBackendAuth(request);
    const { projectId } = projectIdParamsSchema.parse(request.params);
    await assertProject(projectId);
    const workflow = await getProjectWorkflow(projectId);
    return { items: workflow.members };
  });

  app.post("/projects/:projectId/members", async (request, reply) => {
    assertBackendAuth(request);
    const { projectId } = projectIdParamsSchema.parse(request.params);
    await assertProject(projectId);
    const body = createMemberSchema.parse(request.body ?? {});
    const member = await createProjectMember({
      projectId,
      name: body.name,
      available: body.available,
    });
    return reply.status(201).send(member);
  });

  app.patch("/projects/:projectId/members/:memberId", async (request, reply) => {
    assertBackendAuth(request);
    const { projectId, memberId } = memberIdParamsSchema.parse(request.params);
    await assertProject(projectId);
    const body = updateMemberSchema.parse(request.body ?? {});
    const member = await updateProjectMember(memberId, body);
    if (!member || member.projectId !== projectId) {
      return reply.status(404).send({ error: "Member not found" });
    }
    return member;
  });

  app.delete("/projects/:projectId/members/:memberId", async (request, reply) => {
    assertBackendAuth(request);
    const { projectId, memberId } = memberIdParamsSchema.parse(request.params);
    await assertProject(projectId);
    const removed = await removeProjectMember(memberId);
    if (!removed) {
      return reply.status(404).send({ error: "Member not found" });
    }
    return reply.status(204).send();
  });
}
