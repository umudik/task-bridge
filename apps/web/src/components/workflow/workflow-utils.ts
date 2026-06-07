import type { WorkflowStage } from "@/lib/api";

export const STAGE_CARD_WIDTH = 260;
export const STAGE_CARD_HEIGHT = 112;
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

export function rulesToText(rules: string[]) {
  return rules.join("\n");
}

export function textToRules(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function stagesForDisplay(stages: WorkflowStage[]): DisplayStage[] {
  const sorted = [...stages].sort((a, b) => a.position - b.position);
  const count = sorted.length;
  const xGap = STAGE_CARD_WIDTH + 48;
  const totalWidth = count > 0 ? STAGE_CARD_WIDTH + (count - 1) * xGap : STAGE_CARD_WIDTH;
  const startX = Math.max(100, (CANVAS_WIDTH - totalWidth) / 2);
  const centerY = (CANVAS_HEIGHT - STAGE_CARD_HEIGHT) / 2;
  return sorted.map((stage, index) => ({
    ...stage,
    displayX: startX + index * xGap,
    displayY: centerY,
  }));
}

export function createEmptyStage(position: number): WorkflowStage {
  return {
    id: `stage-${Date.now()}`,
    title: "New stage",
    description: "",
    purpose: "",
    rules: [],
    position,
    autoAssign: false,
    decisionIds: [],
    layoutX: null,
    layoutY: null,
    spawnTaskCount: 0,
  };
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
