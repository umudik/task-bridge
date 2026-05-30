export const config = {
  port: Number(process.env.PORT ?? 3000),
  ngrokInspectorUrl: process.env.NGROK_INSPECTOR_URL ?? "http://localhost:4040",
  backendApiKey: process.env.BACKEND_API_KEY ?? "dev-key",
  databasePath:
    process.env.DATABASE_PATH?.trim() ||
    process.env.BRIDGE_DB_PATH?.trim() ||
    "",
};
