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

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: isWin,
      cwd: root,
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} failed with exit ${code}`));
    });
    child.on("error", reject);
  });
}

async function main() {
  const env = { ...process.env, ...loadEnv() };
  const args = process.argv.slice(2).filter((entry) => entry !== "--mobile");
  const includeMobile = process.argv.includes("--mobile");
  const tag = args[0]?.trim() || "latest";
  const version = args[1]?.trim() || tag;
  const user = env.DOCKER_USER?.trim() || env.DOCKERHUB_USER?.trim() || env.DOCKERHUB_USERNAME?.trim();

  if (!user) {
    console.error("Set DOCKER_USER (or DOCKERHUB_USER) in .env or environment.");
    console.error("Example: DOCKER_USER=yourname npm run docker:publish");
    console.error("Log in first: docker login -u yourname");
    process.exit(1);
  }

  if (includeMobile) {
    console.log("[docker] Building Android APK first…");
    await run("node", ["scripts/docker-mobile-build.mjs"]);
  }

  const image = `${user}/task-bridge`;
  const labels = tag === "latest" ? [`${image}:latest`] : [`${image}:${tag}`, `${image}:latest`];

  console.log(`[docker] Building ${labels.join(", ")} (version ${version})`);
  console.log("[docker] Tip: use 'docker buildx build --platform linux/amd64,linux/arm64' for multi-arch (CI does this automatically).");
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
