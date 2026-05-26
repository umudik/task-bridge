export const config = {
  port: Number(process.env.PORT ?? 3000),
  ngrokInspectorUrl: process.env.NGROK_INSPECTOR_URL ?? "http://localhost:4040",
  vikunjaBaseUrl: process.env.VIKUNJA_BASE_URL ?? "http://localhost:3456",
  vikunjaApiToken: process.env.VIKUNJA_API_TOKEN ?? "",
  vikunjaProjectId: Number(process.env.VIKUNJA_PROJECT_ID ?? 0),
  backendApiKey: process.env.BACKEND_API_KEY ?? "dev-key",
  projectsPath:
    process.env.BRIDGE_PROJECTS_PATH?.trim() ||
    process.env.PROJECTS_PATH?.trim() ||
    "",
};
