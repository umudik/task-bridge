type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export function createLogger(name: string, minLevel: LogLevel = "info") {
  const log = (level: LogLevel, message: string, meta: Record<string, unknown> | null = null) => {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) return;
    let suffix = "";
    if (meta !== null && Object.keys(meta).length > 0) {
      suffix = ` ${JSON.stringify(meta)}`;
    }
    const line = `[${new Date().toISOString()}] [${level.toUpperCase()}] [${name}] ${message}${suffix}`;
    if (level === "error" || level === "warn") {
      process.stderr.write(`${line}\n`);
    } else {
      process.stdout.write(`${line}\n`);
    }
  };

  return {
    debug: (message: string, meta: Record<string, unknown> | null = null) => log("debug", message, meta),
    info: (message: string, meta: Record<string, unknown> | null = null) => log("info", message, meta),
    warn: (message: string, meta: Record<string, unknown> | null = null) => log("warn", message, meta),
    error: (message: string, meta: Record<string, unknown> | null = null) => log("error", message, meta),
  };
}
