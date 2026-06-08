import { randomUUID } from "node:crypto";
import {
  countWorkflowStages,
  deleteProjectMemberRow,
  deleteWorkflowStagesForProject,
  getProjectMemberRow,
  getWorkflowStageRow,
  insertProjectMemberRow,
  insertWorkflowStageRow,
  getProjectWorkflowSettingsRow,
  listProjectMemberRows,
  listWorkflowStageRows,
  updateProjectMemberRow,
  upsertProjectWorkflowSettingsRow,
} from "../db/workflow-db.js";
import { countSpawnableTemplates } from "../domain/task-template-graph.js";
import {
  type StageTaskTemplate,
  SUBTASK_SPAWN_STAGE_ID,
  parseRulesJson,
  parseStageRolesJson,
  resolveEpicDescription,
  resolveStageTaskTemplates,
  serializeTaskTemplates,
  stageHasActionableTemplates,
} from "../domain/workflow-stage.js";
import { isDoneStage, listSubtasks, type BridgeTask } from "../domain/task.js";
import { AppError } from "../errors/app-error.js";
import { countActiveTasksOnStage } from "../db/tasks-db.js";
import { allocateTaskId, getBridgeTask, listBridgeTasks, upsertBridgeTask } from "./task-service.js";
import { copyTemplateStagesToProject, getWorkflowTemplate } from "./workflow-template-service.js";
import { validateStageTransition } from "./workflow-rules.js";

export type WorkflowStage = {
  id: string;
  title: string;
  description: string;
  position: number;
  autoAssignRole?: string;
  layoutX: number | null;
  layoutY: number | null;
  spawnTaskCount: number;
  taskTemplates: StageTaskTemplate[];
  activeTaskCount?: number;
};

export type { StageTaskTemplate };

export type ProjectMember = {
  id: string;
  projectId: string;
  name: string;
  role?: string;
  openTasks: number;
};

export type ProjectWorkflow = {
  projectId: string;
  roles: string[];
  stages: WorkflowStage[];
  members: ProjectMember[];
};

function normalizeStageForSave(stage: WorkflowStage, projectRoles?: Set<string>): WorkflowStage {
  const taskTemplates = (stage.taskTemplates ?? []).map((template) => {
    const assigneeRole = template.assigneeRole?.trim() || undefined;
    if (!assigneeRole || !projectRoles || projectRoles.has(assigneeRole)) {
      return { ...template, assigneeRole };
    }
    return { ...template, assigneeRole: undefined };
  });
  const rawRole = stage.autoAssignRole?.trim() || undefined;
  const autoAssignRole =
    rawRole && (!projectRoles || projectRoles.has(rawRole)) ? rawRole : undefined;
  return {
    ...stage,
    taskTemplates,
    autoAssignRole,
    spawnTaskCount: countSpawnableTemplates(taskTemplates),
  };
}

function normalizeProjectRoles(roles: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const role of roles) {
    const trimmed = role.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

function loadProjectRoles(projectId: string, stageRows: { roles_json?: string }[]): string[] {
  const settings = getProjectWorkflowSettingsRow(projectId);
  const fromSettings = parseRulesJson(settings?.roles_json ?? "[]");
  if (fromSettings.length > 0) {
    return normalizeProjectRoles(fromSettings);
  }
  const legacy = stageRows.flatMap((row) => parseRulesJson(row.roles_json ?? "[]"));
  return normalizeProjectRoles(legacy);
}

function rowToStage(row: {
  id: string;
  title: string;
  description: string;
  purpose: string;
  rules_json: string;
  position: number;
  auto_assign: number;
  auto_assign_role?: string;
  layout_x: number | null;
  layout_y: number | null;
  spawn_task_count: number;
  task_templates_json: string;
}): WorkflowStage {
  const taskTemplates = resolveStageTaskTemplates({
    taskTemplatesJson: row.task_templates_json,
    spawnTaskCount: row.spawn_task_count ?? 0,
    stageId: row.id,
    stageTitle: row.title,
  });
  const autoAssignRole = row.auto_assign_role?.trim() || undefined;
  return {
    id: row.id,
    title: row.title,
    description: resolveEpicDescription({
      description: row.description,
      purpose: row.purpose,
      rulesJson: row.rules_json,
    }),
    position: row.position,
    autoAssignRole,
    layoutX: row.layout_x,
    layoutY: row.layout_y,
    spawnTaskCount: countSpawnableTemplates(taskTemplates),
    taskTemplates,
  };
}

function countOpenTasksForMember(tasks: BridgeTask[], memberName: string): number {
  return tasks.filter(
    (task) => task.assignee === memberName && !isDoneStage(task.stageId),
  ).length;
}

function memberRowToProjectMember(
  row: {
    id: string;
    project_id: string;
    name: string;
    stage_roles_json: string;
    role?: string;
  },
  tasks: BridgeTask[],
): ProjectMember {
  const directRole = row.role?.trim() || "";
  const legacyRole = Object.values(parseStageRolesJson(row.stage_roles_json)).find((value) => value.trim())?.trim() ?? "";
  const role = directRole || legacyRole || undefined;
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    role,
    openTasks: countOpenTasksForMember(
      tasks.filter((task) => task.projectId === row.project_id),
      row.name,
    ),
  };
}

function pickMemberWithLowestLoad(
  members: { name: string }[],
  tasks: BridgeTask[],
): string | null {
  let best: { name: string; load: number } | null = null;
  for (const member of members) {
    const load = countOpenTasksForMember(tasks, member.name);
    if (!best || load < best.load) {
      best = { name: member.name, load };
    }
  }
  return best?.name ?? null;
}

export async function ensureProjectWorkflow(projectId: string): Promise<void> {
  const id = projectId.trim();
  if (!id) return;
  if (countWorkflowStages(id) > 0) return;
  copyTemplateStagesToProject(id, "empty");
}

export async function applyWorkflowTemplateToProject(
  projectId: string,
  templateId: string,
): Promise<ProjectWorkflow> {
  const template = getWorkflowTemplate(templateId);
  if (!template) {
    throw new AppError("Workflow template not found", 404);
  }
  validateWorkflowStageRemoval(projectId, template.stages);
  copyTemplateStagesToProject(projectId, templateId);
  return getProjectWorkflow(projectId);
}

export async function getFirstStageId(projectId: string): Promise<string | null> {
  await ensureProjectWorkflow(projectId);
  const rows = listWorkflowStageRows(projectId).sort((a, b) => a.position - b.position);
  if (rows.length === 0) return null;
  for (const row of rows) {
    if (
      stageHasActionableTemplates({
        taskTemplatesJson: row.task_templates_json,
        spawnTaskCount: row.spawn_task_count ?? 0,
        stageId: row.id,
        stageTitle: row.title,
      })
    ) {
      return row.id;
    }
  }
  return rows[0]?.id ?? null;
}

export async function resolveNewTaskPlacement(projectId: string): Promise<{
  stageId: string | null;
  assignee: string | null;
}> {
  await ensureProjectWorkflow(projectId);
  const stageId = await getFirstStageId(projectId);
  if (!stageId) return { stageId: null, assignee: null };
  const row = getWorkflowStageRow(projectId, stageId);
  const autoAssignRole = row?.auto_assign_role?.trim() ?? "";
  if (!row || !autoAssignRole) {
    return { stageId, assignee: null };
  }
  const assignee = await pickMemberByProjectRole(projectId, autoAssignRole);
  return { stageId, assignee };
}

export function getStageTitleLookup(projectId: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of listWorkflowStageRows(projectId)) {
    map.set(row.id, row.title);
  }
  return map;
}

function countActiveTasksForStage(tasks: BridgeTask[], stageId: string): number {
  return tasks.filter((task) => task.parentId === null && task.stageId === stageId).length;
}

export function validateWorkflowStageRemoval(
  projectId: string,
  nextStages: WorkflowStage[],
): void {
  if (nextStages.length < 1) {
    throw new AppError("At least one workflow stage is required", 400);
  }
  const current = listWorkflowStageRows(projectId);
  const nextIds = new Set(nextStages.map((stage) => stage.id.trim()));
  for (const row of current) {
    if (nextIds.has(row.id)) continue;
    const activeCount = countActiveTasksOnStage(projectId, row.id);
    if (activeCount > 0) {
      throw new AppError(
        `Cannot remove stage "${row.title}": ${activeCount} active task(s) are on this stage`,
        409,
        { stageId: row.id, stageTitle: row.title, activeTaskCount: activeCount },
      );
    }
  }
}

export async function getProjectWorkflow(projectId: string): Promise<ProjectWorkflow> {
  await ensureProjectWorkflow(projectId);
  const tasks = await listBridgeTasks();
  const projectTasks = tasks.filter((task) => task.projectId === projectId);
  const stages = listWorkflowStageRows(projectId).map((row) => {
    const stage = rowToStage(row);
    return {
      ...stage,
      activeTaskCount: countActiveTasksForStage(projectTasks, stage.id),
    };
  });
  const stageRows = listWorkflowStageRows(projectId);
  const roles = loadProjectRoles(projectId, stageRows);
  const members = listProjectMemberRows(projectId).map((row) =>
    memberRowToProjectMember(row, tasks),
  );
  return { projectId, roles, stages, members };
}

export async function replaceProjectWorkflow(
  projectId: string,
  stages: WorkflowStage[],
  roles: string[] = [],
): Promise<ProjectWorkflow> {
  const id = projectId.trim();
  validateWorkflowStageRemoval(id, stages);
  const normalizedRoles = normalizeProjectRoles(roles);
  const roleSet = new Set(normalizedRoles);
  deleteWorkflowStagesForProject(id);
  stages.forEach((stage, index) => {
    const normalized = normalizeStageForSave(stage, roleSet);
    insertWorkflowStageRow({
      id: normalized.id.trim(),
      projectId: id,
      title: normalized.title,
      description: normalized.description ?? "",
      purpose: "",
      rulesJson: "[]",
      position: normalized.position ?? index,
      autoAssignRole: normalized.autoAssignRole ?? "",
      layoutX: normalized.layoutX,
      layoutY: normalized.layoutY,
      spawnTaskCount: normalized.spawnTaskCount,
      taskTemplatesJson: serializeTaskTemplates(normalized.taskTemplates),
    });
  });
  upsertProjectWorkflowSettingsRow(id, JSON.stringify(normalizedRoles));
  return getProjectWorkflow(id);
}

export async function pickMemberByProjectRole(
  projectId: string,
  roleName: string,
): Promise<string | null> {
  const normalizedRole = roleName.trim();
  if (!normalizedRole) return null;
  const members = listProjectMemberRows(projectId).filter((row) => {
    const directRole = row.role?.trim() ?? "";
    if (directRole) return directRole === normalizedRole;
    const legacyRoles = parseStageRolesJson(row.stage_roles_json);
    return Object.values(legacyRoles).some((value) => value === normalizedRole);
  });
  if (members.length === 0) return null;
  const tasks = (await listBridgeTasks()).filter((task) => task.projectId === projectId);
  return pickMemberWithLowestLoad(
    members.map((row) => ({ name: row.name })),
    tasks,
  );
}

export async function applyStageToTask(
  task: BridgeTask,
  stageId: string,
): Promise<{ assignee: string | null }> {
  await validateStageTransition(task, stageId);
  const stage = getWorkflowStageRow(task.projectId, stageId);
  if (!stage) {
    throw new AppError("Unknown stage", 400);
  }
  let assignee = task.assignee;
  const autoAssignRole = stage.auto_assign_role?.trim() ?? "";
  if (autoAssignRole) {
    assignee = await pickMemberByProjectRole(task.projectId, autoAssignRole);
  }
  return { assignee };
}

export async function spawnStageSubtasks(
  parent: BridgeTask,
  stageId: string,
): Promise<BridgeTask[]> {
  if (parent.parentId) return [];
  if (stageId !== SUBTASK_SPAWN_STAGE_ID) return [];
  const row = getWorkflowStageRow(parent.projectId, stageId);
  if (!row) return [];

  const templates = resolveStageTaskTemplates({
    taskTemplatesJson: row.task_templates_json,
    spawnTaskCount: row.spawn_task_count ?? 0,
    stageId: row.id,
    stageTitle: row.title,
  });
  if (templates.length === 0) return [];

  const tasks = await listBridgeTasks();
  const existing = listSubtasks(tasks, parent.id);
  if (existing.length >= templates.length) return [];

  const created: BridgeTask[] = [];
  for (let i = existing.length; i < templates.length; i += 1) {
    const template = templates[i];
    if (!template) continue;
    let assignee: string | null = null;
    if (template.assigneeRole?.trim()) {
      assignee = await pickMemberByProjectRole(parent.projectId, template.assigneeRole);
    } else {
      const autoAssignRole = row.auto_assign_role?.trim() ?? "";
      if (autoAssignRole) {
        assignee = await pickMemberByProjectRole(parent.projectId, autoAssignRole);
      }
    }
    const id = await allocateTaskId();
    const task = await upsertBridgeTask({
      id,
      projectId: parent.projectId,
      projectName: parent.projectName,
      title: template.title,
      description: template.description ?? "",
      createdBy: "workflow",
      parentId: parent.id,
      stageId,
      assignee,
    });
    created.push(task);
  }
  return created;
}

export async function getStageSnapshot(projectId: string, stageId: string | null | undefined) {
  if (!stageId) return null;
  await ensureProjectWorkflow(projectId);
  const row = getWorkflowStageRow(projectId, stageId);
  if (!row) return null;
  const stage = rowToStage(row);
  return {
    id: stage.id,
    title: stage.title,
    description: stage.description,
    spawnTaskCount: stage.spawnTaskCount,
    taskTemplates: stage.taskTemplates,
  };
}

export async function createProjectMember(input: {
  projectId: string;
  name: string;
  role?: string;
}): Promise<ProjectMember> {
  const id = randomUUID();
  insertProjectMemberRow({
    id,
    projectId: input.projectId,
    name: input.name,
    role: input.role ?? "",
  });
  const row = getProjectMemberRow(id);
  if (!row) throw new Error("Failed to create member");
  const tasks = await listBridgeTasks();
  return memberRowToProjectMember(row, tasks);
}

export async function updateProjectMember(
  id: string,
  patch: { name?: string; role?: string },
): Promise<ProjectMember | null> {
  const dbPatch: { name?: string; role?: string } = {};
  if (patch.name !== undefined) dbPatch.name = patch.name;
  if (patch.role !== undefined) dbPatch.role = patch.role;
  if (!updateProjectMemberRow(id, dbPatch)) return null;
  const row = getProjectMemberRow(id);
  if (!row) return null;
  const tasks = await listBridgeTasks();
  return memberRowToProjectMember(row, tasks);
}

export async function removeProjectMember(id: string): Promise<boolean> {
  return deleteProjectMemberRow(id);
}

export async function exportWorkflowReadable(projectId: string) {
  const workflow = await getProjectWorkflow(projectId);
  return {
    projectId: workflow.projectId,
    roles: workflow.roles,
    stages: workflow.stages.map((stage) => ({
      id: stage.id,
      title: stage.title,
      description: stage.description,
      autoAssignRole: stage.autoAssignRole ?? "",
      spawnTaskCount: stage.spawnTaskCount,
      taskTemplates: stage.taskTemplates,
    })),
    members: workflow.members.map((member) => ({
      id: member.id,
      name: member.name,
      role: member.role ?? "",
      openTasks: member.openTasks,
    })),
  };
}

export async function enrichTaskWithWorkflow(task: BridgeTask | null) {
  if (!task) return null;
  const stage = await getStageSnapshot(task.projectId, task.stageId);
  return {
    stageId: task.stageId ?? null,
    stage,
    assignee: task.assignee,
  };
}

export async function validateTaskBelongsToProject(taskId: number, projectId: string) {
  const task = await getBridgeTask(taskId);
  if (!task || task.projectId !== projectId) return null;
  return task;
}
