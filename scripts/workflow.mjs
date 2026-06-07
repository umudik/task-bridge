#!/usr/bin/env node

const baseUrl = (process.env.BACKEND_URL ?? "http://localhost:3001").replace(/\/$/, "");
const apiKey = process.env.BACKEND_API_KEY ?? "dev-key";

async function request(path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "X-Api-Key": apiKey,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!response.ok) {
    const message = data?.error ?? text ?? response.statusText;
    throw new Error(`HTTP ${response.status}: ${message}`);
  }
  return data;
}

function usage() {
  console.log(`Task Bridge workflow CLI

Usage:
  node scripts/workflow.mjs get <projectId>
  node scripts/workflow.mjs export <projectId>
  node scripts/workflow.mjs decisions list <projectId>
  node scripts/workflow.mjs decisions add <projectId> <title> [body]
  node scripts/workflow.mjs members list <projectId>

Env:
  BACKEND_URL=http://localhost:3001
  BACKEND_API_KEY=dev-key
`);
}

const [command, ...args] = process.argv.slice(2);

try {
  if (!command || command === "help" || command === "--help") {
    usage();
    process.exit(0);
  }

  if (command === "get") {
    const [projectId] = args;
    if (!projectId) throw new Error("projectId required");
    const data = await request(`/projects/${projectId}/workflow`);
    console.log(JSON.stringify(data, null, 2));
    process.exit(0);
  }

  if (command === "export") {
    const [projectId] = args;
    if (!projectId) throw new Error("projectId required");
    const data = await request(`/projects/${projectId}/workflow/export`);
    console.log(JSON.stringify(data, null, 2));
    process.exit(0);
  }

  if (command === "decisions") {
    const [sub, projectId, title, ...bodyParts] = args;
    if (!projectId) throw new Error("projectId required");
    if (sub === "list") {
      const data = await request(`/projects/${projectId}/decisions`);
      console.log(JSON.stringify(data, null, 2));
      process.exit(0);
    }
    if (sub === "add") {
      if (!title) throw new Error("title required");
      const data = await request(`/projects/${projectId}/decisions`, {
        method: "POST",
        body: JSON.stringify({ title, body: bodyParts.join(" ") }),
      });
      console.log(JSON.stringify(data, null, 2));
      process.exit(0);
    }
    throw new Error(`Unknown decisions subcommand: ${sub ?? "(missing)"}`);
  }

  if (command === "members") {
    const [sub, projectId] = args;
    if (!projectId) throw new Error("projectId required");
    if (sub === "list") {
      const data = await request(`/projects/${projectId}/members`);
      console.log(JSON.stringify(data, null, 2));
      process.exit(0);
    }
    throw new Error(`Unknown members subcommand: ${sub ?? "(missing)"}`);
  }

  usage();
  process.exit(1);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
