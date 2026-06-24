export const DEFAULT_WORKFLOW_TEMPLATE_ID = "lean-sdlc";

export function normalizeWorkflowTemplateId(value: string): string {
  if (value === "") return DEFAULT_WORKFLOW_TEMPLATE_ID;
  return value;
}
