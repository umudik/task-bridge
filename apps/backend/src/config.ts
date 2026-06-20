function getEnv(key: string): string | null {
  const keys = Object.keys(process.env);
  for (let i = 0; i < keys.length; i += 1) {
    const envKey = keys[i];
    if (envKey !== key) {
      continue;
    }
    const value = process.env[envKey];
    if (value === null) {
      return null;
    }
    return value as string;
  }
  return null;
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
