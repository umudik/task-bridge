export type Session = {
  baseUrl: string;
  apiKey: string;
  useHttps: boolean;
  projectId?: string;
  projectName?: string;
};

const KEY = "task-bridge.session";

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Session;
    if (!parsed.baseUrl?.trim() || !parsed.apiKey?.trim()) return null;
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
  saveSession({
    baseUrl: current.baseUrl,
    apiKey: current.apiKey,
    useHttps: current.useHttps,
  });
}

export function sessionFromOrigin(apiKey: string): Session {
  const origin =
    typeof window !== "undefined" ? window.location.origin.replace(/\/$/, "") : "http://localhost:3001";
  return {
    baseUrl: origin,
    apiKey: apiKey.trim(),
    useHttps: origin.startsWith("https://"),
  };
}

export function parseHostPort(baseUrl: string) {
  try {
    const url = new URL(baseUrl);
    return {
      host: url.hostname,
      port: url.port || (url.protocol === "https:" ? "443" : "80"),
      useHttps: url.protocol === "https:",
    };
  } catch {
    return { host: "localhost", port: "3001", useHttps: false };
  }
}

export function defaultBaseUrl() {
  if (import.meta.env.VITE_BACKEND_URL) {
    return String(import.meta.env.VITE_BACKEND_URL).replace(/\/$/, "");
  }
  if (typeof window !== "undefined") {
    return window.location.origin.replace(/\/$/, "");
  }
  return "http://localhost:3001";
}

export function buildBaseUrl(host: string, port: string, useHttps: boolean) {
  const trimmedHost = host.trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
  const trimmedPort = port.trim();
  const protocol = useHttps ? "https" : "http";
  const omitPort =
    !trimmedPort ||
    (useHttps && trimmedPort === "443") ||
    (!useHttps && trimmedPort === "80");
  if (omitPort) return `${protocol}://${trimmedHost}`;
  return `${protocol}://${trimmedHost}:${trimmedPort}`;
}
