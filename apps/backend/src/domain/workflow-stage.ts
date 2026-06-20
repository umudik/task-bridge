export type StageTaskTemplate = {
  id: string;
  title: string;
  description: string;
  assigneeRole: string | null;
  dependsOn: string[];
  children: StageTaskTemplate[];
};

export const SUBTASK_SPAWN_STAGE_ID = "in-progress";

export function parseStageRolesJson(
  raw: string | null,
): Record<string, string> {
  if (!raw || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || Array.isArray(parsed) || !(parsed instanceof Object))
      return {};
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(
      parsed as Record<string, unknown>,
    )) {
      const valueStr = value as string;
      if (
        value !== null &&
        String(valueStr) === valueStr &&
        valueStr.trim()
      ) {
        result[key.trim()] = valueStr.trim();
      }
    }
    return result;
  } catch {
    return {};
  }
}

export function serializeStageRolesJson(roles: Record<string, string>): string {
  return JSON.stringify(roles);
}

export function parseRulesJson(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const result: string[] = [];
    for (const item of parsed) {
      if (
        item !== null &&
        String(item) === item &&
        (item as string).trim().length > 0
      ) {
        result.push((item as string).trim());
      }
    }
    return result;
  } catch {
    return [];
  }
}

export function resolveEpicDescription(input: {
  description: string;
  purpose: string;
  rulesJson: string;
}): string {
  const parts: string[] = [];
  const description = input.description.trim();
  const purpose = input.purpose.trim();
  if (description) parts.push(description);
  if (purpose && purpose !== description) parts.push(purpose);
  const rules = parseRulesJson(input.rulesJson);
  if (rules.length > 0) parts.push(rules.join("\n"));
  return parts.join("\n\n");
}

function resolveTaskDescription(row: Record<string, unknown>): string {
  const descCandidate = row.description as string;
  if (row.description !== null && String(descCandidate) === descCandidate) {
    return descCandidate.trim();
  }
  return "";
}

function parseTemplateNode(
  item: unknown,
  index: number,
  fallbackTitle: string,
): StageTaskTemplate | null {
  if (!item || Array.isArray(item) || !(item instanceof Object)) return null;
  const row = item as Record<string, unknown>;
  let id: string;
  const idCandidate = row.id as string;
  if (row.id !== null && String(idCandidate) === idCandidate && idCandidate.trim()) {
    id = idCandidate.trim();
  } else {
    id = `tpl-${index}`;
  }
  let title: string;
  const titleCandidate = row.title as string;
  if (row.title !== null && String(titleCandidate) === titleCandidate) {
    title = titleCandidate.trim();
  } else {
    title = "";
  }
  if (!title) return null;
  const template: StageTaskTemplate = {
    id,
    title: title || fallbackTitle,
    description: resolveTaskDescription(row),
    assigneeRole: null,
    dependsOn: [],
    children: [],
  };
  const assigneeRoleCandidate = row.assigneeRole as string;
  if (
    row.assigneeRole !== null &&
    String(assigneeRoleCandidate) === assigneeRoleCandidate &&
    assigneeRoleCandidate.trim()
  ) {
    template.assigneeRole = assigneeRoleCandidate.trim();
  }
  if (Array.isArray(row.dependsOn)) {
    const deps: string[] = [];
    for (const entry of row.dependsOn) {
      if (
        entry !== null &&
        String(entry) === entry &&
        (entry as string).trim().length > 0
      ) {
        deps.push((entry as string).trim());
      }
    }
    template.dependsOn = deps;
  }
  if (Array.isArray(row.children)) {
    template.children = parseTaskTemplateNodes(row.children, "Task");
  }
  return template;
}

function parseTaskTemplateNodes(
  raw: unknown,
  fallbackTitle: string,
): StageTaskTemplate[] {
  if (!Array.isArray(raw)) return [];
  const result: StageTaskTemplate[] = [];
  for (let i = 0; i < raw.length; i++) {
    const node = parseTemplateNode(raw[i], i, fallbackTitle);
    if (node !== null) result.push(node);
  }
  return result;
}

export function parseTaskTemplatesJson(
  raw: string | null,
): StageTaskTemplate[] {
  if (!raw || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parseTaskTemplateNodes(parsed, "Task");
  } catch {
    return [];
  }
}

function serializeTemplateNode(
  template: StageTaskTemplate,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    id: template.id,
    title: template.title,
    description: template.description,
    dependsOn: template.dependsOn,
  };
  if (template.assigneeRole) payload.assigneeRole = template.assigneeRole;
  if (template.children.length > 0) {
    payload.children = template.children.map((child) =>
      serializeTemplateNode(child),
    );
  }
  return payload;
}

export function serializeTaskTemplates(templates: StageTaskTemplate[]): string {
  return JSON.stringify(
    templates.map((template) => serializeTemplateNode(template)),
  );
}

export function resolveStageTaskTemplates(input: {
  taskTemplatesJson: string | null;
  stageId: string;
  stageTitle: string;
}): StageTaskTemplate[] {
  return parseTaskTemplatesJson(input.taskTemplatesJson);
}

export function resolveStageTaskTemplateRoots(input: {
  taskTemplatesJson: string | null;
  stageId: string;
  stageTitle: string;
}): StageTaskTemplate[] {
  return resolveStageTaskTemplates(input);
}

function templateTreeHasTasks(nodes: StageTaskTemplate[]): boolean {
  return nodes.some((node) => node.title.trim().length > 0);
}

export function stageHasActionableTemplates(input: {
  taskTemplatesJson: string | null;
  stageId: string;
  stageTitle: string;
}): boolean {
  const roots = resolveStageTaskTemplateRoots(input);
  return templateTreeHasTasks(roots);
}

export function countSpawnableTemplates(
  templates: StageTaskTemplate[],
): number {
  let count = 0;
  for (const node of templates) {
    count += 1;
    if (node.children.length > 0) {
      count += countSpawnableTemplates(node.children);
    }
  }
  return count;
}
