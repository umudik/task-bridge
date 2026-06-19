export type TemplateExecution = "parallel" | "sequential";

export type AssigneeKind = "human" | "ai";

export function parseActorKind(value: string): AssigneeKind {
  return value === "ai" ? "ai" : "human";
}

export type StageTaskTemplate = {
  id: string;
  title: string;
  description: string;
  assigneeRole: string | undefined;
  assigneeKind: AssigneeKind | undefined;
  kind: "task" | "group" | undefined;
  execution: TemplateExecution | undefined;
  dependsOn: string[] | undefined;
  children: StageTaskTemplate[] | undefined;
};

export const SUBTASK_SPAWN_STAGE_ID = "in-progress";

export function parseStageRolesJson(raw: string | undefined): Record<string, string> {
  if (!raw || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof key === "string" && typeof value === "string" && value.trim()) {
        result[key.trim()] = value.trim();
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
    return parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  } catch {
    return [];
  }
}

export function resolveEpicDescription(input: {
  description: string | undefined;
  purpose: string | undefined;
  rulesJson: string | undefined;
}): string {
  const parts: string[] = [];
  const description = input.description !== undefined ? input.description.trim() : "";
  const purpose = input.purpose !== undefined ? input.purpose.trim() : "";
  if (description) parts.push(description);
  if (purpose && purpose !== description) parts.push(purpose);
  const rulesRaw = input.rulesJson !== undefined ? input.rulesJson : "[]";
  const rules = parseRulesJson(rulesRaw);
  if (rules.length > 0) parts.push(rules.join("\n"));
  return parts.join("\n\n");
}

function resolveTaskDescription(row: Record<string, unknown>): string {
  if (typeof row.description === "string") return row.description;
  if (Array.isArray(row.rules)) {
    return row.rules
      .filter((rule): rule is string => typeof rule === "string" && rule.trim().length > 0)
      .join("\n");
  }
  return "";
}

function parseTemplateNode(item: unknown, index: number, fallbackTitle: string): StageTaskTemplate | undefined {
  if (!item || typeof item !== "object") return undefined;
  const row = item as Record<string, unknown>;
  const id = typeof row.id === "string" && row.id.trim() ? row.id.trim() : `tpl-${index}`;
  const kind = row.kind === "group" ? "group" : "task";
  const title = typeof row.title === "string" ? row.title.trim() : "";
  if (!title && kind === "task") return undefined;
  if (!title && kind === "group") {
    return {
      id,
      kind: "group",
      title: fallbackTitle || "Group",
      description: "",
      execution: row.execution === "sequential" ? "sequential" : "parallel",
      assigneeRole: undefined,
      assigneeKind: undefined,
      dependsOn: undefined,
      children: parseTaskTemplateNodes(row.children, "Task"),
    };
  }
  const template: StageTaskTemplate = {
    id,
    kind,
    title: title || fallbackTitle,
    description: resolveTaskDescription(row),
    execution: row.execution === "sequential" ? "sequential" : "parallel",
    assigneeRole: undefined,
    assigneeKind: undefined,
    dependsOn: undefined,
    children: undefined,
  };
  if (typeof row.assigneeRole === "string" && row.assigneeRole.trim()) {
    template.assigneeRole = row.assigneeRole.trim();
  }
  if (row.assigneeKind === "human" || row.assigneeKind === "ai") {
    template.assigneeKind = row.assigneeKind;
  }
  if (Array.isArray(row.dependsOn)) {
    template.dependsOn = row.dependsOn
      .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
      .map((entry) => entry.trim());
  }
  if (Array.isArray(row.children)) {
    template.children = parseTaskTemplateNodes(row.children, "Task");
  }
  return template;
}

function parseTaskTemplateNodes(raw: unknown, fallbackTitle: string): StageTaskTemplate[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item, index) => parseTemplateNode(item, index, fallbackTitle))
    .filter((item): item is StageTaskTemplate => item !== undefined);
}

export function parseTaskTemplatesJson(raw: string | undefined): StageTaskTemplate[] {
  if (!raw || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parseTaskTemplateNodes(parsed, "Task");
  } catch {
    return [];
  }
}

function serializeTemplateNode(template: StageTaskTemplate): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    id: template.id,
    title: template.title,
    description: template.description,
    kind: template.kind !== undefined ? template.kind : "task",
    execution: template.execution !== undefined ? template.execution : "parallel",
    dependsOn: template.dependsOn !== undefined ? template.dependsOn : [],
  };
  if (template.assigneeRole) payload.assigneeRole = template.assigneeRole;
  if (template.assigneeKind) payload.assigneeKind = template.assigneeKind;
  if (template.children !== undefined && template.children.length > 0) {
    payload.children = template.children.map((child) => serializeTemplateNode(child));
  }
  return payload;
}

export function serializeTaskTemplates(templates: StageTaskTemplate[]): string {
  return JSON.stringify(templates.map((template) => serializeTemplateNode(template)));
}

export function legacyTemplatesFromCount(stageId: string, stageTitle: string, count: number): StageTaskTemplate[] {
  if (count <= 0) return [];
  return Array.from({ length: count }, (_, index) => ({
    id: `${stageId}-tpl-${index}`,
    title: `${stageTitle} #${index + 1}`,
    description: "",
    assigneeRole: undefined,
    assigneeKind: undefined,
    kind: undefined,
    execution: undefined,
    dependsOn: undefined,
    children: undefined,
  }));
}

export function resolveStageTaskTemplates(input: {
  taskTemplatesJson: string | undefined;
  spawnTaskCount: number;
  stageId: string;
  stageTitle: string;
}): StageTaskTemplate[] {
  const parsed = parseTaskTemplatesJson(input.taskTemplatesJson);
  if (parsed.length > 0) return parsed;
  return legacyTemplatesFromCount(input.stageId, input.stageTitle, input.spawnTaskCount);
}

export function resolveStageTaskTemplateRoots(input: {
  taskTemplatesJson: string | undefined;
  spawnTaskCount: number;
  stageId: string;
  stageTitle: string;
}): StageTaskTemplate[] {
  return resolveStageTaskTemplates(input);
}

function templateTreeHasTasks(nodes: StageTaskTemplate[]): boolean {
  for (const node of nodes) {
    if (node.kind === "group") {
      const children = node.children !== undefined ? node.children : [];
      if (templateTreeHasTasks(children)) return true;
      continue;
    }
    return true;
  }
  return false;
}

export function stageHasActionableTemplates(input: {
  taskTemplatesJson: string | undefined;
  spawnTaskCount: number;
  stageId: string;
  stageTitle: string;
}): boolean {
  const roots = resolveStageTaskTemplateRoots(input);
  return templateTreeHasTasks(roots);
}
