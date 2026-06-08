import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const isWin = process.platform === "win32";
const children = [];

function loadEnv() {
  const path = join(root, ".env");
  if (!existsSync(path)) return {};
  const vars = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    vars[trimmed.slice(0, index).trim()] = trimmed.slice(index + 1).trim();
  }
  return vars;
}

function run(command, args, options = {}, track = true) {
  const child = spawn(command, args, {
    stdio: "inherit",
    shell: isWin,
    cwd: root,
    ...options,
  });
  if (track) children.push(child);
  return child;
}

function waitForExit(child) {
  return new Promise((resolve, reject) => {
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`exit ${code}`));
    });
    child.on("error", reject);
  });
}

async function ensureNgrok(env) {
  if (!env.NGROK_AUTHTOKEN) {
    console.log("[dev] No NGROK_AUTHTOKEN — local only (http://localhost:5173/app/login)");
    return;
  }
  console.log("[dev] Starting ngrok (docker, stays up after Ctrl+C)…");
  const child = run(
    "docker",
    ["compose", "-f", "docker-compose.dev.yml", "up", "-d", "--remove-orphans"],
    { env: { ...process.env, ...env } },
    false,
  );
  await waitForExit(child);
}

function shutdown() {
  for (const child of children) {
    if (!child.killed) child.kill();
  }
  process.exit(0);
}

async function main() {
  const env = loadEnv();
  const skipNgrok = process.argv.includes("--no-ngrok");

  if (!skipNgrok) {
    try {
      await ensureNgrok(env);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[dev] ngrok skipped: ${message}`);
    }
  }

  const backendEnv = {
    ...process.env,
    ...env,
    PORT: env.PORT ?? "3000",
    BACKEND_API_KEY: env.BACKEND_API_KEY ?? "dev-key",
    NGROK_INSPECTOR_URL: "http://localhost:4040",
  };

  run("npm", ["--prefix", "apps/backend", "run", "dev"], { env: backendEnv });
  run("npm", ["--prefix", "apps/web", "run", "dev"]);

  console.log("");
  console.log("[dev] Web (HMR):  http://localhost:5173/app/login");
  console.log("[dev] API (watch): http://localhost:3000");
  console.log("[dev] Ngrok panel:  http://localhost:4040");
  console.log("[dev] Ctrl+C stops backend + web only. Ngrok keeps running.");
  console.log("");

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
