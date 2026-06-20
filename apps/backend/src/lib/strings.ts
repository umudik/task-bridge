export function trimString(value: string): string {
  return value.trim();
}

export function trimOrEmpty(value: string | null): string {
  if (value === null) {
    return "";
  }
  return value.trim();
}

export function emptyToNull(value: string | null): string | null {
  if (value === null) {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed === "") {
    return null;
  }
  return trimmed;
}

export function roleKey(value: string): string {
  return value.trim().toLowerCase();
}
