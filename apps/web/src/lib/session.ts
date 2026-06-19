export type UserRole = "admin" | "read-write" | "read";

export type Session = {
  token: string;
  userId: string;
  userName: string;
  userEmail: string;
  userRole: UserRole;
  isSystemAdmin: boolean;
  projectId?: string;
  projectName?: string;
};

const KEY = "task-bridge.session.v2";

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Session;
    if (!parsed.token?.trim() || !parsed.userId?.trim()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveSession(session: Session) {
  localStorage.setItem(KEY, JSON.stringify(session));
}

export function clearSession() {
  localStorage.removeItem(KEY);
}

export function setSelectedProject(projectId: string, projectName: string) {
  const current = loadSession();
  if (!current) return;
  saveSession({ ...current, projectId, projectName });
}

export function clearSelectedProject() {
  const current = loadSession();
  if (!current) return;
  const { projectId: _p, projectName: _n, ...rest } = current;
  saveSession(rest);
}
