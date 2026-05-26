import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { platform } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SETUP_URL = "http://localhost:3001/setup";
const detach = process.argv.includes("--detach");

function loadDotEnv() {
  const path = join(ROOT, ".env");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!(key in process.env)) process.env[key] = val;
  }
}

function openBrowser(url) {
  const plat = platform();
  const command =
    plat === "win32"
      ? `start "" "${url}"`
      : plat === "darwin"
        ? `open "${url}"`
        : `xdg-open "${url}"`;
  spawn(command, { shell: true, stdio: "ignore" });
}

function startLocalCursorAgent() {
  if (process.env.WORKER_CURSOR_AGENT === "false") return;
  if (!process.env.CURSOR_API_KEY?.trim()) {
    console.log("[docker-up] CURSOR_API_KEY missing — skip local cursor agent");
    console.log("[docker-up] Add CURSOR_API_KEY to .env then run: npm run agent");
    return;
  }

  console.log("[docker-up] Starting local Cursor agent on host...");
  const child = spawn("node", ["scripts/cursor-agent-runner.mjs", "watch"], {
    cwd: ROOT,
    stdio: "inherit",
    shell: true,
    detached: true,
    env: { ...process.env },
  });
  child.unref();
}

async function isSetupReady() {
  try {
    const response = await fetch(SETUP_URL, {
      signal: AbortSignal.timeout(2000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function waitAndOpen() {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    if (await isSetupReady()) {
      openBrowser(SETUP_URL);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

loadDotEnv();
startLocalCursorAgent();

const args = detach ? ["compose", "up", "-d", "--build"] : ["compose", "up", "--build"];
const child = spawn("docker", args, {
  stdio: "inherit",
  shell: true,
});

void waitAndOpen();

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
