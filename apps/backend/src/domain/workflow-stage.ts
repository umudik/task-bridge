export type TemplateExecution = "parallel" | "sequential";

export type StageTaskTemplate = {
  id: string;
  title: string;
  description: string;
  assigneeRole?: string;
  kind?: "task" | "group";
  execution?: TemplateExecution;
  dependsOn?: string[];
  children?: StageTaskTemplate[];
};

export const SUBTASK_SPAWN_STAGE_ID = "in-progress";

export function parseStageRolesJson(raw: string | null | undefined): Record<string, string> {
  if (!raw?.trim()) return {};
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
  description?: string;
  purpose?: string;
  rulesJson?: string;
}): string {
  const parts: string[] = [];
  const description = input.description?.trim() ?? "";
  const purpose = input.purpose?.trim() ?? "";
  if (description) parts.push(description);
  if (purpose && purpose !== description) parts.push(purpose);
  const rules = parseRulesJson(input.rulesJson ?? "[]");
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

function parseTemplateNode(item: unknown, index: number, fallbackTitle: string): StageTaskTemplate | null {
  if (!item || typeof item !== "object") return null;
  const row = item as Record<string, unknown>;
  const id = typeof row.id === "string" && row.id.trim() ? row.id.trim() : `tpl-${index}`;
  const kind = row.kind === "group" ? "group" : "task";
  const title = typeof row.title === "string" ? row.title.trim() : "";
  if (!title && kind === "task") return null;
  if (!title && kind === "group") {
    return {
      id,
      kind: "group",
      title: fallbackTitle || "Group",
      description: "",
      execution: row.execution === "sequential" ? "sequential" : "parallel",
      children: parseTaskTemplateNodes(row.children, "Task"),
    };
  }
  const template: StageTaskTemplate = {
    id,
    kind,
    title: title || fallbackTitle,
    description: resolveTaskDescription(row),
    execution: row.execution === "sequential" ? "sequential" : "parallel",
  };
  if (typeof row.assigneeRole === "string" && row.assigneeRole.trim()) {
    template.assigneeRole = row.assigneeRole.trim();
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
    .filter((item): item is StageTaskTemplate => item !== null);
}

export function parseTaskTemplatesJson(raw: string | null | undefined): StageTaskTemplate[] {
  if (!raw?.trim()) return [];
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
    description: template.description ?? "",
    assigneeRole: template.assigneeRole ?? "",
    kind: template.kind ?? "task",
    execution: template.execution ?? "parallel",
    dependsOn: template.dependsOn ?? [],
  };
  if (template.children?.length) {
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
  }));
}

export function resolveStageTaskTemplates(input: {
  taskTemplatesJson: string | null | undefined;
  spawnTaskCount: number;
  stageId: string;
  stageTitle: string;
}): StageTaskTemplate[] {
  const parsed = parseTaskTemplatesJson(input.taskTemplatesJson);
  if (parsed.length > 0) return parsed;
  return legacyTemplatesFromCount(input.stageId, input.stageTitle, input.spawnTaskCount ?? 0);
}

export function resolveStageTaskTemplateRoots(input: {
  taskTemplatesJson: string | null | undefined;
  spawnTaskCount: number;
  stageId: string;
  stageTitle: string;
}): StageTaskTemplate[] {
  return resolveStageTaskTemplates(input);
}
