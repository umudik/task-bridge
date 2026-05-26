type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export function createLogger(name: string, minLevel: LogLevel = "info") {
  const log = (level: LogLevel, message: string, meta?: Record<string, unknown>) => {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) return;
    const suffix = meta && Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : "";
    const line = `[${new Date().toISOString()}] [${level.toUpperCase()}] [${name}] ${message}${suffix}`;
    (level === "error" || level === "warn" ? process.stderr : process.stdout).write(`${line}\n`);
  };

  return {
    debug: (message: string, meta?: Record<string, unknown>) => log("debug", message, meta),
    info: (message: string, meta?: Record<string, unknown>) => log("info", message, meta),
    warn: (message: string, meta?: Record<string, unknown>) => log("warn", message, meta),
    error: (message: string, meta?: Record<string, unknown>) => log("error", message, meta),
  };
}
