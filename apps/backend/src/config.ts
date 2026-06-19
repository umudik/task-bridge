function getEnv(key: string): string | undefined {
  const value = process.env[key];
  return value !== undefined ? value.trim() : undefined;
}

export const config = {
  port: process.env["PORT"] !== undefined ? Number(process.env["PORT"]) : 3000,
  databasePath: getEnv("DATABASE_PATH") || getEnv("BRIDGE_DB_PATH") || "",
};
