import type { StageTaskTemplate } from "./workflow-stage.js";

export type TemplateExecution = "parallel" | "sequential";

export function templateExecution(node: StageTaskTemplate): TemplateExecution {
  return node.execution;
}

export type TemplateSpawnContext = {
  stageId: string;
  stagePosition: number;
  activeStagePosition: number;
  spawnedTemplateIds: Set<string>;
  doneTemplateIds: Set<string>;
};

export function flattenTemplateNodes(
  nodes: StageTaskTemplate[],
): StageTaskTemplate[] {
  const result: StageTaskTemplate[] = [];
  for (const node of nodes) {
    result.push(node);
    if (node.children.length > 0) {
      result.push(...flattenTemplateNodes(node.children));
    }
  }
  return result;
}

export function countSpawnableTemplates(nodes: StageTaskTemplate[]): number {
  let count = 0;
  for (const node of nodes) {
    count += 1;
    if (node.children.length > 0) {
      count += countSpawnableTemplates(node.children);
    }
  }
  return count;
}

function dependenciesMet(
  node: StageTaskTemplate,
  ctx: TemplateSpawnContext,
): boolean {
  return node.dependsOn.every((templateId) => ctx.doneTemplateIds.has(templateId));
}

function previousSequentialSiblingDone(
  siblings: StageTaskTemplate[],
  index: number,
  ctx: TemplateSpawnContext,
): boolean {
  if (index <= 0) return true;
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const sibling = siblings[cursor];
    if (!sibling) continue;
    if (!isTemplateComplete(sibling, ctx)) return false;
    return true;
  }
  return true;
}

function isTemplateComplete(
  node: StageTaskTemplate,
  ctx: TemplateSpawnContext,
): boolean {
  if (!ctx.spawnedTemplateIds.has(node.id)) return false;
  if (!ctx.doneTemplateIds.has(node.id)) return false;
  if (node.children.length === 0) return true;
  return node.children.every((child) => isTemplateComplete(child, ctx));
}

function stageIsReachable(ctx: TemplateSpawnContext): boolean {
  return ctx.stagePosition <= ctx.activeStagePosition;
}

export function collectSpawnableTemplates(
  nodes: StageTaskTemplate[],
  ctx: TemplateSpawnContext,
  parentExecution: TemplateExecution = "parallel",
  siblings: StageTaskTemplate[] = nodes,
): StageTaskTemplate[] {
  if (!stageIsReachable(ctx)) return [];

  const result: StageTaskTemplate[] = [];
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (!node) continue;

    if (parentExecution === "sequential") {
      if (!previousSequentialSiblingDone(siblings, index, ctx)) continue;
    }

    if (!dependenciesMet(node, ctx)) continue;

    if (!ctx.spawnedTemplateIds.has(node.id)) {
      result.push(node);
      continue;
    }

    if (node.children.length > 0) {
      if (!ctx.doneTemplateIds.has(node.id)) continue;
      result.push(
        ...collectSpawnableTemplates(
          node.children,
          ctx,
          templateExecution(node),
          node.children,
        ),
      );
    }
  }

  return result;
}

export function collectSiblingTemplateIds(
  nodes: StageTaskTemplate[],
): string[] {
  const ids: string[] = [];
  for (const node of nodes) {
    ids.push(node.id);
    if (node.children.length > 0) {
      ids.push(...collectSiblingTemplateIds(node.children));
    }
  }
  return ids;
}
