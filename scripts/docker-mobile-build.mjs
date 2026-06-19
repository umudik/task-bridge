import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const isWin = process.platform === "win32";
const image = "task-bridge-mobile:build";
const container = "task-bridge-mobile-extract";
const outDir = join(root, "artifacts");
const outFile = join(outDir, "task-bridge.apk");

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

async function removeContainer() {
  try {
    await run("docker", ["rm", "-f", container]);
  } catch {
  }
}

async function main() {
  mkdirSync(outDir, { recursive: true });

  console.log("[mobile] Building Android APK (first run can take several minutes)…");
  await run("docker", ["build", "-f", "Dockerfile.mobile", "-t", image, "."]);

  await removeContainer();
  await run("docker", ["create", "--name", container, image]);
  await run("docker", ["cp", `${container}:/task-bridge.apk`, outFile]);
  await removeContainer();

  if (!existsSync(outFile)) {
    throw new Error("APK export failed");
  }

  console.log("");
  console.log(`[mobile] APK ready: ${outFile}`);
  console.log("[mobile] Next: npm run docker:up  (APK is bundled into the image)");
}

main().catch(async (error) => {
  await removeContainer();
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
