export const DEFAULT_WORKFLOW_TEMPLATE_ID = "empty";

export function normalizeWorkflowTemplateId(value: string): string {
  const trimmed = value.trim();
  if (trimmed === "") return DEFAULT_WORKFLOW_TEMPLATE_ID;
  return trimmed;
}
