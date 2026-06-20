function getEnv(key: string): string | null {
  const value = process.env[key];
  if (value != null) {
    return value.trim();
  }
  return null;
}

let configPort = 3000;
const rawPort = process.env["PORT"];
if (rawPort != null) {
  configPort = Number(rawPort);
}

export const config = {
  port: configPort,
  databasePath: getEnv("DATABASE_PATH") || getEnv("BRIDGE_DB_PATH") || "",
};
