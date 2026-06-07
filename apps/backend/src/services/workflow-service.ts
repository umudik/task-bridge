import { randomUUID } from "node:crypto";
import {
  countWorkflowStages,
  deleteProjectDecisionRow,
  deleteProjectMemberRow,
  deleteWorkflowStagesForProject,
  getProjectDecisionRow,
  getProjectMemberRow,
  getWorkflowStageRow,
  insertProjectDecisionRow,
  insertProjectMemberRow,
  insertWorkflowStageRow,
  listProjectDecisionRows,
  listProjectMemberRows,
  listWorkflowStageRows,
  updateProjectDecisionRow,
  updateProjectMemberRow,
} from "../db/workflow-db.js";
import { isDoneStage, listSubtasks, type BridgeTask } from "../domain/task.js";
import { AppError } from "../errors/app-error.js";
import { allocateTaskId, getBridgeTask, listBridgeTasks, upsertBridgeTask } from "./task-service.js";
import { copyTemplateStagesToProject } from "./workflow-template-service.js";
import { validateStageTransition } from "./workflow-rules.js";

export type WorkflowStage = {
  id: string;
  title: string;
  description: string;
  purpose: string;
  rules: string[];
  position: number;
  autoAssign: boolean;
  decisionIds: string[];
  layoutX: number | null;
  layoutY: number | null;
  spawnTaskCount: number;
  decisions?: ProjectDecision[];
};

export type ProjectDecision = {
  id: string;
  projectId: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
};

export type ProjectMember = {
  id: string;
  projectId: string;
  name: string;
  available: boolean;
  openTasks: number;
};

export type ProjectWorkflow = {
  projectId: string;
  stages: WorkflowStage[];
  members: ProjectMember[];
  decisions: ProjectDecision[];
};

function parseJsonArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  } catch {
    return [];
  }
}

function rowToDecision(row: {
  id: string;
  project_id: string;
  title: string;
  body: string;
  created_at: string;
  updated_at: string;
}): ProjectDecision {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToStage(
  row: {
    id: string;
    title: string;
    description: string;
    purpose: string;
    rules_json: string;
    position: number;
    auto_assign: number;
    decision_ids_json: string;
    layout_x: number | null;
    layout_y: number | null;
    spawn_task_count: number;
  },
  decisionsById: Map<string, ProjectDecision>,
): WorkflowStage {
  const decisionIds = parseJsonArray(row.decision_ids_json);
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    purpose: row.purpose,
    rules: parseJsonArray(row.rules_json),
    position: row.position,
    autoAssign: row.auto_assign === 1,
    layoutX: row.layout_x,
    layoutY: row.layout_y,
    spawnTaskCount: row.spawn_task_count ?? 0,
    decisionIds,
    decisions: decisionIds
      .map((id) => decisionsById.get(id))
      .filter((item): item is ProjectDecision => item !== undefined),
  };
}

function countOpenTasksForMember(tasks: BridgeTask[], memberName: string): number {
  return tasks.filter(
    (task) => task.assignee === memberName && !isDoneStage(task.stageId),
  ).length;
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
  copyTemplateStagesToProject(projectId, templateId);
  return getProjectWorkflow(projectId);
}

export async function getFirstStageId(projectId: string): Promise<string | null> {
  await ensureProjectWorkflow(projectId);
  const rows = listWorkflowStageRows(projectId);
  if (rows.length === 0) return null;
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
  if (!row || row.auto_assign !== 1) {
    return { stageId, assignee: null };
  }
  const assignee = await pickAutoAssignee(projectId);
  return { stageId, assignee };
}

export function getStageTitleLookup(projectId: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of listWorkflowStageRows(projectId)) {
    map.set(row.id, row.title);
  }
  return map;
}

export async function getProjectWorkflow(projectId: string): Promise<ProjectWorkflow> {
  await ensureProjectWorkflow(projectId);
  const decisions = listProjectDecisionRows(projectId).map(rowToDecision);
  const decisionsById = new Map(decisions.map((item) => [item.id, item]));
  const stages = listWorkflowStageRows(projectId).map((row) => rowToStage(row, decisionsById));
  const tasks = await listBridgeTasks();
  const members = listProjectMemberRows(projectId).map((row) => ({
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    available: row.available === 1,
    openTasks: countOpenTasksForMember(
      tasks.filter((task) => task.projectId === projectId),
      row.name,
    ),
  }));
  return { projectId, stages, members, decisions };
}

export async function replaceProjectWorkflow(
  projectId: string,
  stages: WorkflowStage[],
): Promise<ProjectWorkflow> {
  const id = projectId.trim();
  deleteWorkflowStagesForProject(id);
  stages.forEach((stage, index) => {
    insertWorkflowStageRow({
      id: stage.id.trim(),
      projectId: id,
      title: stage.title,
      description: stage.description,
      purpose: stage.purpose,
      rulesJson: JSON.stringify(stage.rules ?? []),
      position: stage.position ?? index,
      autoAssign: stage.autoAssign,
      decisionIdsJson: JSON.stringify(stage.decisionIds ?? []),
      layoutX: stage.layoutX,
      layoutY: stage.layoutY,
      spawnTaskCount: stage.spawnTaskCount ?? 0,
    });
  });
  return getProjectWorkflow(id);
}

export async function pickAutoAssignee(projectId: string): Promise<string | null> {
  const members = listProjectMemberRows(projectId).filter((row) => row.available === 1);
  if (members.length === 0) return null;
  const tasks = (await listBridgeTasks()).filter((task) => task.projectId === projectId);
  let best: { name: string; load: number } | null = null;
  for (const member of members) {
    const load = countOpenTasksForMember(tasks, member.name);
    if (!best || load < best.load) {
      best = { name: member.name, load };
    }
  }
  return best?.name ?? null;
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
  if (stage.auto_assign === 1) {
    assignee = await pickAutoAssignee(task.projectId);
  }
  return { assignee };
}

export async function spawnStageSubtasks(
  parent: BridgeTask,
  stageId: string,
): Promise<BridgeTask[]> {
  if (parent.parentId) return [];
  const row = getWorkflowStageRow(parent.projectId, stageId);
  const target = row?.spawn_task_count ?? 0;
  if (!row || target <= 0) return [];

  const tasks = await listBridgeTasks();
  const existing = listSubtasks(tasks, parent.id);
  if (existing.length >= target) return [];

  let assignee: string | null = null;
  if (row.auto_assign === 1) {
    assignee = await pickAutoAssignee(parent.projectId);
  }

  const created: BridgeTask[] = [];
  for (let i = existing.length; i < target; i += 1) {
    const id = await allocateTaskId();
    const task = await upsertBridgeTask({
      id,
      projectId: parent.projectId,
      projectName: parent.projectName,
      title: `${row.title} #${i + 1}`,
      description: "",
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
  const decisions = listProjectDecisionRows(projectId).map(rowToDecision);
  const decisionsById = new Map(decisions.map((item) => [item.id, item]));
  const stage = rowToStage(row, decisionsById);
  return {
    id: stage.id,
    title: stage.title,
    description: stage.description,
    purpose: stage.purpose,
    rules: stage.rules,
    spawnTaskCount: stage.spawnTaskCount,
    decisions: stage.decisions ?? [],
  };
}

export async function createProjectDecision(input: {
  projectId: string;
  title: string;
  body?: string;
}): Promise<ProjectDecision> {
  const id = randomUUID();
  insertProjectDecisionRow({
    id,
    projectId: input.projectId,
    title: input.title,
    body: input.body ?? "",
  });
  const row = getProjectDecisionRow(id);
  if (!row) throw new Error("Failed to create decision");
  return rowToDecision(row);
}

export async function updateProjectDecision(
  id: string,
  patch: { title?: string; body?: string },
): Promise<ProjectDecision | null> {
  if (!updateProjectDecisionRow(id, patch)) return null;
  const row = getProjectDecisionRow(id);
  return row ? rowToDecision(row) : null;
}

export async function removeProjectDecision(id: string): Promise<boolean> {
  return deleteProjectDecisionRow(id);
}

export async function createProjectMember(input: {
  projectId: string;
  name: string;
  available?: boolean;
}): Promise<ProjectMember> {
  const id = randomUUID();
  insertProjectMemberRow({
    id,
    projectId: input.projectId,
    name: input.name,
    available: input.available ?? true,
  });
  const row = getProjectMemberRow(id);
  if (!row) throw new Error("Failed to create member");
  const tasks = await listBridgeTasks();
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    available: row.available === 1,
    openTasks: countOpenTasksForMember(
      tasks.filter((task) => task.projectId === input.projectId),
      row.name,
    ),
  };
}

export async function updateProjectMember(
  id: string,
  patch: { name?: string; available?: boolean },
): Promise<ProjectMember | null> {
  if (!updateProjectMemberRow(id, patch)) return null;
  const row = getProjectMemberRow(id);
  if (!row) return null;
  const tasks = await listBridgeTasks();
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    available: row.available === 1,
    openTasks: countOpenTasksForMember(
      tasks.filter((task) => task.projectId === row.project_id),
      row.name,
    ),
  };
}

export async function removeProjectMember(id: string): Promise<boolean> {
  return deleteProjectMemberRow(id);
}

export async function exportWorkflowReadable(projectId: string) {
  const workflow = await getProjectWorkflow(projectId);
  return {
    projectId: workflow.projectId,
    stages: workflow.stages.map((stage) => ({
      id: stage.id,
      title: stage.title,
      description: stage.description,
      purpose: stage.purpose,
      rules: stage.rules,
      autoAssign: stage.autoAssign,
      spawnTaskCount: stage.spawnTaskCount,
      linkedDecisions: (stage.decisions ?? []).map((decision) => ({
        id: decision.id,
        title: decision.title,
      })),
    })),
    members: workflow.members.map((member) => ({
      id: member.id,
      name: member.name,
      available: member.available,
      openTasks: member.openTasks,
    })),
    decisions: workflow.decisions.map((decision) => ({
      id: decision.id,
      title: decision.title,
      body: decision.body,
      updatedAt: decision.updatedAt,
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
