export function emptyToNull(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export function roleKey(value: string | null | undefined): string | null {
  const normalized = emptyToNull(value);
  return normalized ? normalized.toLowerCase() : null;
}
