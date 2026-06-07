import type { StageTaskTemplate, WorkflowStage } from "@/lib/api";

export const STAGE_CARD_WIDTH = 280;
export const STAGE_CARD_HEIGHT = 88;
export const STEP_TASK_GAP = 20;
export const TASK_TEMPLATE_HEIGHT = 40;
export const TASK_TEMPLATE_GAP = 8;
export const CANVAS_WIDTH = 3200;
export const CANVAS_HEIGHT = 2400;

export type DisplayStage = WorkflowStage & {
  displayX: number;
  displayY: number;
};

export function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function stagesForDisplay(stages: WorkflowStage[]): DisplayStage[] {
  const sorted = [...stages].sort((a, b) => a.position - b.position);
  const count = sorted.length;
  const xGap = STAGE_CARD_WIDTH + 48;
  const totalWidth = count > 0 ? STAGE_CARD_WIDTH + (count - 1) * xGap : STAGE_CARD_WIDTH;
  const startX = Math.max(100, (CANVAS_WIDTH - totalWidth) / 2);
  const maxStack = sorted.reduce(
    (max, stage) => Math.max(max, stageStackHeight(stage)),
    STAGE_CARD_HEIGHT,
  );
  const centerY = Math.max(48, (CANVAS_HEIGHT - maxStack) / 2);
  return sorted.map((stage, index) => ({
    ...stage,
    displayX: startX + index * xGap,
    displayY: centerY,
  }));
}

function newEntityId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function createTaskTemplate(stageTitle: string, index: number): StageTaskTemplate {
  return {
    id: newEntityId("task"),
    title: index === 0 ? "New task" : `${stageTitle} task ${index + 1}`,
    description: "",
  };
}

export function createEmptyStage(position: number): WorkflowStage {
  return {
    id: newEntityId("stage"),
    title: "New step",
    description: "",
    position,
    autoAssignRole: undefined,
    layoutX: null,
    layoutY: null,
    spawnTaskCount: 0,
    taskTemplates: [],
  };
}

export function insertStageAt(
  stages: WorkflowStage[],
  afterIndex: number | null,
  stage: WorkflowStage,
): WorkflowStage[] {
  const sorted = [...stages].sort((a, b) => a.position - b.position);
  const insertAt = afterIndex === null ? 0 : afterIndex + 1;
  const next = [...sorted.slice(0, insertAt), stage, ...sorted.slice(insertAt)];
  return next.map((item, position) => ({ ...item, position }));
}

export function moveStageBy(stages: WorkflowStage[], index: number, delta: -1 | 1): WorkflowStage[] {
  const sorted = [...stages].sort((a, b) => a.position - b.position);
  const target = index + delta;
  if (target < 0 || target >= sorted.length) return stages;
  const next = [...sorted];
  const current = next[index];
  const swap = next[target];
  if (!current || !swap) return stages;
  next[index] = swap;
  next[target] = current;
  return next.map((item, position) => ({ ...item, position }));
}

export function syncStageTemplates(stage: WorkflowStage): WorkflowStage {
  const taskTemplates = stage.taskTemplates ?? [];
  return {
    ...stage,
    taskTemplates,
    spawnTaskCount: taskTemplates.length,
  };
}

export function stageStackHeight(stage: WorkflowStage): number {
  const templates = stage.taskTemplates ?? [];
  if (templates.length === 0) return STAGE_CARD_HEIGHT;
  return (
    STAGE_CARD_HEIGHT +
    STEP_TASK_GAP +
    templates.length * TASK_TEMPLATE_HEIGHT +
    (templates.length - 1) * TASK_TEMPLATE_GAP
  );
}

export function normalizeStagePositions(stages: WorkflowStage[]): WorkflowStage[] {
  return [...stages]
    .sort((a, b) => a.position - b.position)
    .map((stage, position) => ({ ...stage, position }));
}

export function screenToCanvas(
  screenX: number,
  screenY: number,
  rect: DOMRect,
  pan: { x: number; y: number },
  zoom: number,
) {
  return {
    x: (screenX - rect.left - pan.x) / zoom,
    y: (screenY - rect.top - pan.y) / zoom,
  };
}
