import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadProjects } from "./projects.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

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

loadDotEnv();

const text = process.argv.slice(2).join(" ").trim();
if (!text) {
  console.error("Usage: npm run task:add -- \"your task text\"");
  process.exit(1);
}

const projects = loadProjects();
const projectId =
  process.env.BRIDGE_PROJECT_ID?.trim() ||
  process.argv.find((arg) => arg.startsWith("--project="))?.slice(10) ||
  projects[0]?.id;

if (!projectId) {
  console.error("No project. Set projects.json or BRIDGE_PROJECT_ID.");
  process.exit(1);
}

const backendUrl = (process.env.BACKEND_URL ?? "http://localhost:3001").replace(/\/$/, "");
const apiKey = process.env.BACKEND_API_KEY ?? "dev-key";

const response = await fetch(`${backendUrl}/tasks`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Api-Key": apiKey,
    Accept: "application/json",
  },
  body: JSON.stringify({ text, projectId }),
});

const raw = await response.text();
if (!response.ok) {
  console.error(`Failed (${response.status}): ${raw}`);
  process.exit(1);
}

const task = JSON.parse(raw);
console.log(JSON.stringify(task, null, 2));
