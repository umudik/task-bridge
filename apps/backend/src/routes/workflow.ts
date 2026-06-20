import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AppError } from "../errors/app-error.js";
import { assertAuth } from "../middleware/auth.js";
import { getProjectById } from "../services/project-registry.js";
import {
  createProjectMember,
  ensureProjectWorkflow,
  applyWorkflowTemplateToProject,
  exportWorkflowReadable,
  getProjectWorkflow,
  removeProjectMember,
  replaceProjectWorkflow,
  updateProjectMember,
} from "../services/workflow-service.js";

const projectIdParamsSchema = z.object({
  projectId: z.string().min(1),
});

const memberIdParamsSchema = z.object({
  projectId: z.string().min(1),
  memberId: z.string().min(1),
});

const taskTemplateSchema: z.ZodTypeAny = z.lazy(() =>
  z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    description: z.string().optional().default(""),
    assigneeRole: z.string().optional().default(""),
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

const replaceWorkflowSchema = z.object({
  stages: z.array(stageSchema).min(1),
  roles: z.array(z.string()).optional().default([]),
});

const applyTemplateSchema = z.object({
  templateId: z.string().min(1),
});

const createMemberSchema = z.object({
  name: z.string().min(1),
  role: z.string().optional().default(""),
  actorKind: z.enum(["human", "ai"]),
});

const updateMemberSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.string().optional(),
  actorKind: z.enum(["human", "ai"]).optional(),
});

async function assertProject(projectId: string) {
  const project = getProjectById(projectId);
  if (!project) {
    throw new AppError("Project not found", 404);
  }
  ensureProjectWorkflow(projectId);
  return project;
}

export function workflowRoutes(app: FastifyInstance) {
  app.get("/projects/:projectId/workflow", async (request) => {
    assertAuth(request);
    const { projectId } = projectIdParamsSchema.parse(request.params);
    await assertProject(projectId);
    return getProjectWorkflow(projectId);
  });

  app.get("/projects/:projectId/workflow/export", async (request) => {
    assertAuth(request);
    const { projectId } = projectIdParamsSchema.parse(request.params);
    await assertProject(projectId);
    return exportWorkflowReadable(projectId);
  });

  app.post("/projects/:projectId/workflow/apply-template", async (request, reply) => {
    assertAuth(request);
    const { projectId } = projectIdParamsSchema.parse(request.params);
    await assertProject(projectId);
    let applyTemplateBody = request.body;
    if (applyTemplateBody === null) { applyTemplateBody = {}; }
    const body = applyTemplateSchema.parse(applyTemplateBody);
    const workflow = await applyWorkflowTemplateToProject(projectId, body.templateId);
    return reply.status(200).send(workflow);
  });

  app.put("/projects/:projectId/workflow", async (request, reply) => {
    assertAuth(request);
    const { projectId } = projectIdParamsSchema.parse(request.params);
    await assertProject(projectId);
    let replaceWorkflowBody = request.body;
    if (replaceWorkflowBody === null) { replaceWorkflowBody = {}; }
    const body = replaceWorkflowSchema.parse(replaceWorkflowBody);
    const workflow = await replaceProjectWorkflow(
      projectId,
      body.stages.map((stage) => {
        let layoutX: number | null = null;
        if (Number(stage.layoutX) === stage.layoutX) {
          layoutX = stage.layoutX as number;
        }
        let layoutY: number | null = null;
        if (Number(stage.layoutY) === stage.layoutY) {
          layoutY = stage.layoutY as number;
        }
        let autoAssignRole: string | null = null;
        const trimmedRole = stage.autoAssignRole.trim();
        if (trimmedRole) {
          autoAssignRole = trimmedRole;
        }
        return { ...stage, layoutX, layoutY, autoAssignRole };
      }),
      body.roles,
    );
    return reply.status(200).send(workflow);
  });

  app.get("/projects/:projectId/members", async (request) => {
    assertAuth(request);
    const { projectId } = projectIdParamsSchema.parse(request.params);
    await assertProject(projectId);
    const workflow = await getProjectWorkflow(projectId);
    return { items: workflow.members };
  });

  app.post("/projects/:projectId/members", async (request, reply) => {
    assertAuth(request);
    const { projectId } = projectIdParamsSchema.parse(request.params);
    await assertProject(projectId);
    let createMemberBody = request.body;
    if (createMemberBody === null) { createMemberBody = {}; }
    const body = createMemberSchema.parse(createMemberBody);
    const member = await createProjectMember({
      projectId,
      name: body.name,
      role: body.role,
      actorKind: body.actorKind,
    });
    return reply.status(201).send(member);
  });

  app.patch("/projects/:projectId/members/:memberId", async (request, reply) => {
    assertAuth(request);
    const { projectId, memberId } = memberIdParamsSchema.parse(request.params);
    await assertProject(projectId);
    let updateMemberBody = request.body;
    if (updateMemberBody === null) { updateMemberBody = {}; }
    const body = updateMemberSchema.parse(updateMemberBody);
    const member = await updateProjectMember(memberId, body);
    if (!member || member.projectId !== projectId) {
      return reply.status(404).send({ error: "Member not found" });
    }
    return member;
  });

  app.delete("/projects/:projectId/members/:memberId", async (request, reply) => {
    assertAuth(request);
    const { projectId, memberId } = memberIdParamsSchema.parse(request.params);
    await assertProject(projectId);
    const removed = await removeProjectMember(memberId);
    if (!removed) {
      return reply.status(404).send({ error: "Member not found" });
    }
    return reply.status(204).send();
  });
}
