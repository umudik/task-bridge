function getEnv(key: string): string | null {
  if (!(key in process.env)) {
    return null;
  }
  const value = process.env[key];
  if (value === null) {
    return null;
  }
  return value.trim();
}

let configPort = 3000;
if ("PORT" in process.env) {
  const rawPort = process.env["PORT"];
  if (rawPort !== null) {
    configPort = Number(rawPort);
  }
}

export const config = {
  port: configPort,
  databasePath: getEnv("DATABASE_PATH") || getEnv("BRIDGE_DB_PATH") || "",
};
