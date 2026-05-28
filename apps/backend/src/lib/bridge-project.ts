export const PROJECT_TAG_PATTERN = /^\[project:([^\]]+)\]\s*(?:\n\n?|\r\n\r\n?)?/;

export function withProjectMarker(projectId: string, description: string): string {
  const body = description.trim();
  return body ? `[project:${projectId}]\n\n${body}` : `[project:${projectId}]`;
}

export function extractProjectId(description?: string | null): string | null {
  if (!description) return null;
  const match = description.match(PROJECT_TAG_PATTERN);
  return match?.[1]?.trim() || null;
}

export function stripProjectMarker(description?: string | null): string | null {
  if (!description) return null;
  const stripped = description.replace(PROJECT_TAG_PATTERN, "").trim();
  return stripped || null;
}
