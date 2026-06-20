import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const isWin = process.platform === "win32";

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

function run(command, args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: input ? ["pipe", "inherit", "inherit"] : "inherit",
      shell: isWin,
      cwd: root,
    });
    if (input) {
      child.stdin.write(input);
      child.stdin.end();
    }
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} failed with exit ${code}`));
    });
    child.on("error", reject);
  });
}

async function ensureDockerLogin(user, token) {
  console.log(`[docker] Logging in as ${user}`);
  await run("docker", ["login", "-u", user, "--password-stdin"], `${token}\n`);
}

async function main() {
  const env = { ...process.env, ...loadEnv() };
  const args = process.argv.slice(2).filter((entry) => entry !== "--mobile");
  const includeMobile = process.argv.includes("--mobile");
  const tag = args[0]?.trim() || "latest";
  const version = args[1]?.trim() || tag;
  const user =
    env.DOCKERHUB_USERNAME?.trim() ||
    env.DOCKER_USER?.trim() ||
    env.DOCKERHUB_USER?.trim();
  const token = env.DOCKER_HUB_SECRET_KEY?.trim();

  if (!user) {
    console.error("Set DOCKERHUB_USERNAME in .env or environment.");
    console.error("Example: DOCKERHUB_USERNAME=yourname npm run docker:publish");
    process.exit(1);
  }

  if (token) {
    await ensureDockerLogin(user, token);
  } else {
    console.log("[docker] DOCKER_HUB_SECRET_KEY not set — assuming docker login already done.");
  }

  if (includeMobile) {
    console.log("[docker] Building Android APK first…");
    await run("node", ["scripts/docker-mobile-build.mjs"]);
  }

  const image = `${user}/task-bridge`;
  const labels = tag === "latest" ? [`${image}:latest`] : [`${image}:${tag}`, `${image}:latest`];

  console.log(`[docker] Building ${labels.join(", ")} (version ${version})`);
  console.log("[docker] Tip: CI pushes multi-arch (amd64 + arm64) via GitHub Actions.");
  await run("docker", [
    "build",
    "-f",
    "Dockerfile",
    "--build-arg",
    `VERSION=${version}`,
    ...labels.flatMap((label) => ["-t", label]),
    ".",
  ]);

  for (const label of labels) {
    console.log(`[docker] Pushing ${label}`);
    await run("docker", ["push", label]);
  }

  console.log("");
  console.log(`Published: ${image}:${tag}`);
  console.log(`Pull:      docker pull ${image}:${tag}`);
  console.log(`Run:       TASK_BRIDGE_IMAGE=${image}:${tag} docker compose -f deploy/docker-compose.yml up -d`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
