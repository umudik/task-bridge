import type { StageTaskTemplate } from "./workflow-stage.js";

export type TemplateExecution = "parallel" | "sequential";

export type TemplateSpawnContext = {
  stageId: string;
  stagePosition: number;
  activeStagePosition: number;
  spawnedTemplateIds: Set<string>;
  doneTemplateIds: Set<string>;
};

export function templateKind(node: StageTaskTemplate): "task" | "group" {
  return node.kind === "group" ? "group" : "task";
}

export function templateExecution(node: StageTaskTemplate): TemplateExecution {
  return node.execution === "sequential" ? "sequential" : "parallel";
}

export function flattenTemplateNodes(nodes: StageTaskTemplate[]): StageTaskTemplate[] {
  const result: StageTaskTemplate[] = [];
  for (const node of nodes) {
    result.push(node);
    if (node.children?.length) {
      result.push(...flattenTemplateNodes(node.children));
    }
  }
  return result;
}

export function countSpawnableTemplates(nodes: StageTaskTemplate[]): number {
  let count = 0;
  for (const node of nodes) {
    if (templateKind(node) === "group") {
      count += countSpawnableTemplates(node.children ?? []);
      continue;
    }
    count += 1;
    if (node.children?.length) {
      count += countSpawnableTemplates(node.children);
    }
  }
  return count;
}

function dependenciesMet(node: StageTaskTemplate, ctx: TemplateSpawnContext): boolean {
  return (node.dependsOn ?? []).every((templateId) => ctx.doneTemplateIds.has(templateId));
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
    if (templateKind(sibling) === "group") {
      if (!isGroupComplete(sibling, ctx)) return false;
      continue;
    }
    if (!ctx.doneTemplateIds.has(sibling.id)) return false;
    return true;
  }
  return true;
}

function isGroupComplete(group: StageTaskTemplate, ctx: TemplateSpawnContext): boolean {
  const children = group.children ?? [];
  if (children.length === 0) return true;
  return children.every((child) => isTemplateComplete(child, ctx));
}

function isTemplateComplete(node: StageTaskTemplate, ctx: TemplateSpawnContext): boolean {
  if (templateKind(node) === "group") {
    return isGroupComplete(node, ctx);
  }
  if (!ctx.spawnedTemplateIds.has(node.id)) return false;
  if (!ctx.doneTemplateIds.has(node.id)) return false;
  if (!node.children?.length) return true;
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

    if (templateKind(node) === "group") {
      result.push(
        ...collectSpawnableTemplates(
          node.children ?? [],
          ctx,
          templateExecution(node),
          node.children ?? [],
        ),
      );
      continue;
    }

    if (!ctx.spawnedTemplateIds.has(node.id)) {
      result.push(node);
      continue;
    }

    if (node.children?.length) {
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

export function collectSiblingTemplateIds(nodes: StageTaskTemplate[]): string[] {
  const ids: string[] = [];
  for (const node of nodes) {
    if (templateKind(node) === "task") ids.push(node.id);
    if (node.children?.length) ids.push(...collectSiblingTemplateIds(node.children));
  }
  return ids;
}
