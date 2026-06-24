#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(here, "..");
const serverEntry = join(pkgRoot, "apps", "backend", "dist", "index.js");

function parseArgs(argv) {
  const result = { port: null, data: null, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      result.help = true;
    } else if (arg === "--port" || arg === "-p") {
      result.port = argv[i + 1];
      i += 1;
    } else if (arg.startsWith("--port=")) {
      result.port = arg.slice("--port=".length);
    } else if (arg === "--data" || arg === "-d") {
      result.data = argv[i + 1];
      i += 1;
    } else if (arg.startsWith("--data=")) {
      result.data = arg.slice("--data=".length);
    }
  }
  return result;
}

function printHelp() {
  console.log(`task-bridge — self-hosted API + web UI

Usage:
  npx @umudik/task-bridge [options]

Options:
  -p, --port <port>   Port to listen on (default: 3000 or $PORT)
  -d, --data <dir>    Data directory for the SQLite database
                      (default: ./task-bridge-data)
  -h, --help          Show this help

After start, open http://localhost:<port>/app/login and create the admin
account at /app/setup on first run.`);
}

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  printHelp();
  process.exit(0);
}

if (!existsSync(serverEntry)) {
  console.error("[task-bridge] Build is missing. Try reinstalling the package.");
  process.exit(1);
}

const env = { ...process.env };

if (args.port) {
  env.PORT = String(args.port);
} else if (!env.PORT) {
  env.PORT = "3000";
}

if (args.data) {
  env.DATABASE_PATH = resolve(process.cwd(), args.data, "bridge.db");
} else if (!env.DATABASE_PATH && !env.BRIDGE_DB_PATH) {
  env.DATABASE_PATH = resolve(process.cwd(), "task-bridge-data", "bridge.db");
}

const child = spawn(process.execPath, [serverEntry], { stdio: "inherit", env });

child.on("exit", (code) => process.exit(code ?? 0));
child.on("error", (error) => {
  console.error("[task-bridge] Failed to start:", error.message);
  process.exit(1);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    if (!child.killed) child.kill(signal);
  });
}
