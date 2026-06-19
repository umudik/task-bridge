export function emptyToUndefined(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

export function emptyToNull(value: string | undefined | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export function roleKey(value: string | undefined): string | undefined {
  const normalized = emptyToUndefined(value);
  return normalized ? normalized.toLowerCase() : undefined;
}
