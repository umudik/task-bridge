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
});

const updateMemberSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.string().optional(),
});

function assertProject(projectId: string) {
  const project = getProjectById(projectId);
  if (!project) {
    throw new AppError("Project not found", 404);
  }
  ensureProjectWorkflow(projectId);
  return project;
}

export function workflowRoutes(app: FastifyInstance) {
  app.get("/projects/:projectId/workflow", (request) => {
    assertAuth(request);
    const { projectId } = projectIdParamsSchema.parse(request.params);
    assertProject(projectId);
    return getProjectWorkflow(projectId);
  });

  app.get("/projects/:projectId/workflow/export", (request) => {
    assertAuth(request);
    const { projectId } = projectIdParamsSchema.parse(request.params);
    assertProject(projectId);
    return exportWorkflowReadable(projectId);
  });

  app.post("/projects/:projectId/workflow/apply-template", async (request, reply) => {
    assertAuth(request);
    const { projectId } = projectIdParamsSchema.parse(request.params);
    assertProject(projectId);
    let applyTemplateBody = request.body;
    if (applyTemplateBody === null) { applyTemplateBody = {}; }
    const body = applyTemplateSchema.parse(applyTemplateBody);
    const workflow = applyWorkflowTemplateToProject(projectId, body.templateId);
    return reply.status(200).send(workflow);
  });

  app.put("/projects/:projectId/workflow", async (request, reply) => {
    assertAuth(request);
    const { projectId } = projectIdParamsSchema.parse(request.params);
    assertProject(projectId);
    let replaceWorkflowBody = request.body;
    if (replaceWorkflowBody === null) { replaceWorkflowBody = {}; }
    const body = replaceWorkflowSchema.parse(replaceWorkflowBody);
    const workflow = replaceProjectWorkflow(
      projectId,
      body.stages.map((stage) => {
        let layoutX: number | null = null;
        if (Number(stage.layoutX) === stage.layoutX) {
          layoutX = stage.layoutX;
        }
        let layoutY: number | null = null;
        if (Number(stage.layoutY) === stage.layoutY) {
          layoutY = stage.layoutY;
        }
        let autoAssignRole: string | null = null;
        const trimmedRole = stage.autoAssignRole.trim();
        if (trimmedRole) {
          autoAssignRole = trimmedRole;
        }
        return Object.assign({}, stage, { layoutX, layoutY, autoAssignRole, activeTaskCount: null });
      }),
      body.roles,
    );
    return reply.status(200).send(workflow);
  });

  app.get("/projects/:projectId/members", (request) => {
    assertAuth(request);
    const { projectId } = projectIdParamsSchema.parse(request.params);
    assertProject(projectId);
    const workflow = getProjectWorkflow(projectId);
    return { items: workflow.members };
  });

  app.post("/projects/:projectId/members", async (request, reply) => {
    assertAuth(request);
    const { projectId } = projectIdParamsSchema.parse(request.params);
    assertProject(projectId);
    let createMemberBody = request.body;
    if (createMemberBody === null) { createMemberBody = {}; }
    const body = createMemberSchema.parse(createMemberBody);
    const member = createProjectMember({
      projectId,
      name: body.name,
      role: body.role,
    });
    return reply.status(201).send(member);
  });

  app.patch("/projects/:projectId/members/:memberId", async (request, reply) => {
    assertAuth(request);
    const { projectId, memberId } = memberIdParamsSchema.parse(request.params);
    assertProject(projectId);
    let updateMemberBody = request.body;
    if (updateMemberBody === null) { updateMemberBody = {}; }
    const body = updateMemberSchema.parse(updateMemberBody);
    let updateName: string | null = null;
    if (body.name !== undefined) {
      updateName = body.name;
    }
    let updateRole: string | null = null;
    if (body.role !== undefined) {
      updateRole = body.role;
    }
    const member = updateProjectMember(memberId, {
      name: updateName,
      role: updateRole,
    });
    if (!member || member.projectId !== projectId) {
      return reply.status(404).send({ error: "Member not found" });
    }
    return member;
  });

  app.delete("/projects/:projectId/members/:memberId", async (request, reply) => {
    assertAuth(request);
    const { projectId, memberId } = memberIdParamsSchema.parse(request.params);
    assertProject(projectId);
    const removed = removeProjectMember(memberId);
    if (!removed) {
      return reply.status(404).send({ error: "Member not found" });
    }
    return reply.status(204).send();
  });
}
