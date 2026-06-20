import { randomUUID } from "node:crypto";
import {
  countWorkflowStages,
  deleteProjectMemberRow,
  deleteWorkflowStagesForProject,
  insertProjectMemberRow,
  insertWorkflowStageRow,
  listProjectMemberRows,
  listProjectWorkflowSettingsRows,
  listWorkflowStageRows,
  updateProjectMemberRow,
  upsertProjectWorkflowSettingsRow,
  type WorkflowStageRow,
} from "../db/workflow-db.js";
import {
  type StageTaskTemplate,
  SUBTASK_SPAWN_STAGE_ID,
  countSpawnableTemplates,
  parseRulesJson,
  resolveEpicDescription,
  resolveStageTaskTemplates,
  serializeTaskTemplates,
  stageHasActionableTemplates,
} from "../domain/workflow-stage.js";
import { isDoneStage, listSubtasks, type BridgeTask } from "../domain/task.js";
import { AppError } from "../errors/app-error.js";
import { deleteEpicSubtasks, mutateTaskRow } from "../db/tasks-db.js";
import { insertEpicRow, listEpicRows } from "../db/epic-workflow-db.js";
import { allocateTaskId, getBridgeTask, listBridgeTasks, upsertBridgeTask } from "./task-service.js";
import { pickMemberByProjectRole, resolveTaskAssignee } from "./task-assignee-service.js";
import { DEFAULT_WORKFLOW_TEMPLATE_ID } from "../domain/workflow-template-id.js";
import { copyTemplateStagesToProject, getWorkflowTemplate } from "./workflow-template-service.js";
import { validateStageTransition } from "./workflow-rules.js";
import { rebuildEpicWorkflowState } from "./workflow-state-service.js";

export type WorkflowStage = {
  id: string;
  title: string;
  description: string;
  position: number;
  autoAssignRole: string | null;
  layoutX: number | null;
  layoutY: number | null;
  spawnTaskCount: number;
  taskTemplates: StageTaskTemplate[];
  activeTaskCount: number | null;
};

export type { StageTaskTemplate };

export type ProjectMember = {
  id: string;
  projectId: string;
  name: string;
  role: string;
  openTasks: number;
};

export type ProjectWorkflow = {
  projectId: string;
  roles: string[];
  stages: WorkflowStage[];
  members: ProjectMember[];
};

function normalizeStageForSave(
  stage: WorkflowStage,
  projectRoles: Set<string> | null = null,
): WorkflowStage {
  const taskTemplates = (stage.taskTemplates || []).map((template) => {
    let assigneeRole: string | null = null;
    let rawRole = "";
    if (template.assigneeRole) {
      rawRole = template.assigneeRole.trim();
    }
    if (rawRole && (!projectRoles || projectRoles.has(rawRole))) {
      assigneeRole = rawRole;
    }
    return { ...template, assigneeRole };
  });
  let autoAssignRole: string | null = null;
  let rawRole = "";
  if (stage.autoAssignRole) {
    rawRole = stage.autoAssignRole.trim();
  }
  if (rawRole && (!projectRoles || projectRoles.has(rawRole))) {
    autoAssignRole = rawRole;
  }
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

function loadProjectRoles(projectId: string): string[] {
  const settingsRows = listProjectWorkflowSettingsRows({ projectId });
  const firstSettingsRow = settingsRows[0];
  if (!firstSettingsRow) return [];
  return normalizeProjectRoles(parseRulesJson(firstSettingsRow.roles_json));
}

function rowToStage(row: WorkflowStageRow): WorkflowStage {
  const taskTemplates = resolveStageTaskTemplates({
    taskTemplatesJson: row.task_templates_json,
    stageId: row.id,
    stageTitle: row.title,
  });
  const autoAssignRole = row.auto_assign_role.trim() || null;
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
    activeTaskCount: null,
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
    role: string;
  },
  tasks: BridgeTask[],
): ProjectMember {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    role: row.role.trim(),
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
    if (best === null || load < best.load) {
      best = { name: member.name, load };
    }
  }
  if (best === null) return null;
  return best.name;
}

export function ensureProjectWorkflow(projectId: string): void {
  const id = projectId.trim();
  if (!id) return;
  if (countWorkflowStages(id) > 0) return;
  copyTemplateStagesToProject(id, DEFAULT_WORKFLOW_TEMPLATE_ID);
}

export async function applyWorkflowTemplateToProject(
  projectId: string,
  templateId: string,
): Promise<ProjectWorkflow> {
  const template = getWorkflowTemplate(templateId);
  if (!template) {
    throw new AppError("Workflow template not found", 404);
  }
  copyTemplateStagesToProject(projectId, templateId);
  await resetProjectEpicWorkflows(projectId);
  return getProjectWorkflow(projectId);
}

async function resetProjectEpicWorkflows(projectId: string): Promise<void> {
  const id = projectId.trim();
  const firstStageId = await getFirstStageId(id);
  const epicIds = new Set<number>();
  for (const row of listEpicRows({ id: 0, projectId: id })) {
    epicIds.add(row.id);
  }
  const tasks = await listBridgeTasks();
  for (const task of tasks) {
    if (task.projectId === id && task.parentId === null) {
      epicIds.add(task.id);
    }
  }
  for (const epicId of epicIds) {
    deleteEpicSubtasks(epicId);
    mutateTaskRow(epicId, (task) => {
      task.stageId = firstStageId;
      task.claimedBy = null;
      task.claimedAt = null;
    });
    if (listEpicRows({ id: epicId, projectId: "" }).length === 0) {
      const epicTask = tasks.find((task) => task.id === epicId);
      if (epicTask) {
        insertEpicRow({
          id: epicId,
          projectId: id,
          title: epicTask.title,
          description: epicTask.description,
          stageId: firstStageId,
          createdBy: epicTask.createdBy,
        });
      }
    }
    rebuildEpicWorkflowState(epicId, id, firstStageId);
  }
}

export async function getFirstStageId(projectId: string): Promise<string | null> {
  ensureProjectWorkflow(projectId);
  const rows = listWorkflowStageRows({ projectId, stageId: "" }).sort((a, b) => a.position - b.position);
  if (rows.length === 0) return null;
  for (const row of rows) {
    if (
      stageHasActionableTemplates({
        taskTemplatesJson: row.task_templates_json,
        stageId: row.id,
        stageTitle: row.title,
      })
    ) {
      return row.id;
    }
  }
  const firstRow = rows[0];
  if (!firstRow) return null;
  return firstRow.id;
}

export async function resolveNewTaskPlacement(projectId: string): Promise<{
  stageId: string | null;
  assignee: string;
  assigneeRole: string | null;
}> {
  ensureProjectWorkflow(projectId);
  const stageId = await getFirstStageId(projectId);
  if (!stageId) {
    const assignee = await pickMemberByProjectRole(projectId, "");
    return { stageId: null, assignee, assigneeRole: null };
  }
  const stageRows = listWorkflowStageRows({ projectId, stageId });
  const row = stageRows[0];
  if (!row) {
    const assignee = await pickMemberByProjectRole(projectId, "");
    return { stageId, assignee, assigneeRole: null };
  }
  const autoAssignRole = row.auto_assign_role.trim();
  const resolved = await resolveTaskAssignee({
    projectId,
    assignee: null,
    assigneeRole: autoAssignRole || null,
    stageId,
  });
  return { stageId, assignee: resolved.assignee, assigneeRole: resolved.assigneeRole };
}

export function getStageTitleLookup(projectId: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of listWorkflowStageRows({ projectId, stageId: "" })) {
    map.set(row.id, row.title);
  }
  return map;
}

function countActiveTasksForStage(tasks: BridgeTask[], stageId: string): number {
  return tasks.filter((task) => task.parentId === null && task.stageId === stageId).length;
}

export async function getProjectWorkflow(projectId: string): Promise<ProjectWorkflow> {
  ensureProjectWorkflow(projectId);
  const tasks = await listBridgeTasks();
  const projectTasks = tasks.filter((task) => task.projectId === projectId);
  const stages = listWorkflowStageRows({ projectId, stageId: "" }).map((row) => {
    const stage = rowToStage(row);
    return {
      ...stage,
      activeTaskCount: countActiveTasksForStage(projectTasks, stage.id),
    };
  });
  const stageRows = listWorkflowStageRows({ projectId, stageId: "" });
  const roles = loadProjectRoles(projectId);
  const members = listProjectMemberRows({ projectId, id: "" }).map((row) =>
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
  if (stages.length < 1) {
    throw new AppError("At least one workflow stage is required", 400);
  }
  const normalizedRoles = normalizeProjectRoles(roles);
  const roleSet = new Set(normalizedRoles);
  deleteWorkflowStagesForProject(id);
  stages.forEach((stage, index) => {
    const normalized = normalizeStageForSave(stage, roleSet);
    let position = index;
    if (normalized.position > 0 || index === 0) {
      position = normalized.position;
    }
    const autoAssignRole = normalized.autoAssignRole || "";
    insertWorkflowStageRow({
      id: normalized.id.trim(),
      projectId: id,
      title: normalized.title,
      description: normalized.description,
      purpose: "",
      rulesJson: "[]",
      position,
      autoAssignRole,
      layoutX: normalized.layoutX,
      layoutY: normalized.layoutY,
      spawnTaskCount: normalized.spawnTaskCount,
      taskTemplatesJson: serializeTaskTemplates(normalized.taskTemplates),
    });
  });
  upsertProjectWorkflowSettingsRow(id, JSON.stringify(normalizedRoles));
  await resetProjectEpicWorkflows(id);
  return getProjectWorkflow(id);
}

export async function pickMemberByProjectRole(
  projectId: string,
  roleName: string,
): Promise<string> {
  const { pickMemberByProjectRole: pick } = await import("./task-assignee-service.js");
  return pick(projectId, roleName);
}

export async function applyStageToTask(
  task: BridgeTask,
  stageId: string,
): Promise<{ assignee: string; assigneeRole: string | null }> {
  await validateStageTransition(task, stageId);
  const stageRows = listWorkflowStageRows({ projectId: task.projectId, stageId });
  if (stageRows.length === 0) {
    throw new AppError("Unknown stage", 400);
  }
  const stage = stageRows[0];
  if (!stage) throw new AppError("Unknown stage", 400);
  const autoAssignRole = stage.auto_assign_role.trim();
  return resolveTaskAssignee({
    projectId: task.projectId,
    assignee: null,
    assigneeRole: autoAssignRole || task.assigneeRole,
    stageId,
  });
}

export async function spawnStageSubtasks(
  parent: BridgeTask,
  stageId: string,
): Promise<BridgeTask[]> {
  if (parent.parentId !== null) return [];
  if (stageId !== SUBTASK_SPAWN_STAGE_ID) return [];
  const stageRows = listWorkflowStageRows({ projectId: parent.projectId, stageId });
  if (stageRows.length === 0) return [];
  const row = stageRows[0];
  if (!row) return [];

  const templates = resolveStageTaskTemplates({
    taskTemplatesJson: row.task_templates_json,
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
    let templateRole = "";
    if (template.assigneeRole) {
      templateRole = template.assigneeRole.trim();
    }
    if (templateRole) {
      assignee = await pickMemberByProjectRole(parent.projectId, templateRole);
    } else {
      const autoAssignRole = row.auto_assign_role.trim();
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
      description: template.description,
      createdBy: "workflow",
      createdAt: null,
      parentId: parent.id,
      epicId: null,
      stageId,
      assignee,
      assigneeRole: template.assigneeRole,
      assigneeKind: null,
      templateId: template.id,
      workStatus: "todo",
    });
    created.push(task);
  }
  return created;
}

export async function getStageSnapshot(projectId: string, stageId: string | null) {
  if (!stageId) return null;
  ensureProjectWorkflow(projectId);
  const stageRows = listWorkflowStageRows({ projectId, stageId });
  if (stageRows.length === 0) return null;
  const row = stageRows[0];
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
  role: string;
}): Promise<ProjectMember> {
  const id = randomUUID();
  insertProjectMemberRow({
    id,
    projectId: input.projectId,
    name: input.name,
    role: input.role.trim(),
  });
  const memberRows = listProjectMemberRows({ projectId: "", id });
  if (memberRows.length === 0) throw new Error("Failed to create member");
  const row = memberRows[0];
  if (!row) throw new Error("Failed to create member");
  const tasks = await listBridgeTasks();
  return memberRowToProjectMember(row, tasks);
}

export async function updateProjectMember(
  id: string,
  patch: { name: string | null; role: string | null },
): Promise<ProjectMember | null> {
  if (!updateProjectMemberRow(id, { name: patch.name, role: patch.role })) {
    return null;
  }
  const memberRows = listProjectMemberRows({ projectId: "", id });
  if (memberRows.length === 0) return null;
  const row = memberRows[0];
  if (!row) return null;
  const tasks = await listBridgeTasks();
  return memberRowToProjectMember(row, tasks);
}

export function removeProjectMember(id: string): boolean {
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
      autoAssignRole: stage.autoAssignRole || "",
      spawnTaskCount: stage.spawnTaskCount,
      taskTemplates: stage.taskTemplates,
    })),
    members: workflow.members.map((member) => ({
      id: member.id,
      name: member.name,
      role: member.role,
      openTasks: member.openTasks,
    })),
  };
}

export async function enrichTaskWithWorkflow(task: BridgeTask | null) {
  if (!task) return null;
  const stage = await getStageSnapshot(task.projectId, task.stageId);
  return {
    stageId: task.stageId,
    stage,
    assignee: task.assignee,
  };
}

export async function validateTaskBelongsToProject(taskId: number, projectId: string): Promise<BridgeTask | null> {
  const task = await getBridgeTask(taskId);
  if (!task) return null;
  if (task.projectId !== projectId) {
    throw new AppError("Task not found", 404);
  }
  return task;
}
