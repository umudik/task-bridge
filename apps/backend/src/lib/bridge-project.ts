export const PROJECT_TAG_PATTERN = /^\[project:([^\]]+)\]\s*(?:\n\n?|\r\n\r\n?)?/;

export function withProjectMarker(projectId: string, description: string): string {
  const body = description.trim();
  return body ? `[project:${projectId}]\n\n${body}` : `[project:${projectId}]`;
}

export function extractProjectId(description: string | undefined): string | undefined {
  if (!description) return undefined;
  const match = description.match(PROJECT_TAG_PATTERN);
  if (!match) return undefined;
  const id = match[1];
  return id ? id.trim() || undefined : undefined;
}

export function stripProjectMarker(description: string | undefined): string | undefined {
  if (!description) return undefined;
  const stripped = description.replace(PROJECT_TAG_PATTERN, "").trim();
  return stripped || undefined;
}
