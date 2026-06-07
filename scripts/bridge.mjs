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
  if (response.status === 204) return null;
  return data;
}

function pad(value, width) {
  const text = String(value ?? "");
  return text.length >= width ? text : text + " ".repeat(width - text.length);
}

function usage() {
  console.log(`Task Bridge CLI

Usage:
  node scripts/bridge.mjs epic list <projectId>
  node scripts/bridge.mjs epic get <projectId> <epicId>
  node scripts/bridge.mjs task list <projectId> [--epic <epicId>]
  node scripts/bridge.mjs workflow get <projectId>
  node scripts/bridge.mjs epic create <projectId> <title>

Env:
  BACKEND_URL=http://localhost:3001
  BACKEND_API_KEY=dev-key
`);
}

function parseFlags(args) {
  const flags = {};
  const positional = [];
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === "--epic" && args[index + 1]) {
      flags.epicId = args[index + 1];
      index += 1;
      continue;
    }
    positional.push(token);
  }
  return { flags, positional };
}

function printEpicTable(epics, stageTitles) {
  if (epics.length === 0) {
    console.log("No epics found.");
    return;
  }
  console.log(`${pad("ID", 6)} ${pad("STAGE", 22)} TITLE`);
  console.log("-".repeat(72));
  for (const epic of epics) {
    const stageTitle = epic.stageId ? (stageTitles.get(epic.stageId) ?? epic.stageId) : "—";
    console.log(`${pad(epic.id, 6)} ${pad(stageTitle, 22)} ${epic.title}`);
  }
}

function printTaskTable(tasks) {
  if (tasks.length === 0) {
    console.log("No tasks found.");
    return;
  }
  console.log(`${pad("ID", 6)} ${pad("STATUS", 14)} ${pad("STAGE", 18)} TITLE`);
  console.log("-".repeat(80));
  for (const task of tasks) {
    console.log(
      `${pad(task.id, 6)} ${pad(task.workStatusLabel ?? task.workStatus, 14)} ${pad(task.stageTitle ?? task.stageId ?? "—", 18)} ${task.title}`,
    );
  }
}

const [command, sub, ...rest] = process.argv.slice(2);

try {
  if (!command || command === "help" || command === "--help") {
    usage();
    process.exit(0);
  }

  if (command === "workflow" && sub === "get") {
    const [projectId] = rest;
    if (!projectId) throw new Error("projectId required");
    const data = await request(`/projects/${projectId}/workflow`);
    console.log(JSON.stringify(data, null, 2));
    process.exit(0);
  }

  if (command === "epic") {
    const [projectId, epicId] = rest;
    if (!projectId) throw new Error("projectId required");

    if (sub === "create") {
      const title = rest.slice(1).join(" ").trim() || epicId?.trim();
      if (!title) throw new Error("title required");
      const data = await request("/epics", {
        method: "POST",
        body: JSON.stringify({ projectId, title }),
      });
      console.log(`Created epic #${data.id}: ${data.title}`);
      process.exit(0);
    }

    if (sub === "list") {
      const data = await request("/tasks");
      const workflow = await request(`/projects/${projectId}/workflow`);
      const stageTitles = new Map((workflow.stages ?? []).map((stage) => [stage.id, stage.title]));
      const epics = (data.items ?? []).filter(
        (item) => item.projectId === projectId && !item.parentId,
      );
      printEpicTable(epics, stageTitles);
      process.exit(0);
    }

    if (sub === "get") {
      if (!epicId) throw new Error("epicId required");
      const data = await request(`/projects/${projectId}/epics/${epicId}/tasks`);
      console.log(`Epic #${data.epicId}: ${data.epicTitle}`);
      console.log(`Stage: ${data.stageTitle ?? data.stageId ?? "—"}`);
      console.log("");
      printTaskTable(data.tasks ?? []);
      process.exit(0);
    }

    throw new Error(`Unknown epic subcommand: ${sub ?? "(missing)"}`);
  }

  if (command === "task" && sub === "list") {
    const { flags, positional } = parseFlags(rest);
    const [projectId] = positional;
    if (!projectId) throw new Error("projectId required");

    if (flags.epicId) {
      const data = await request(`/projects/${projectId}/epics/${flags.epicId}/tasks`);
      printTaskTable(data.tasks ?? []);
      process.exit(0);
    }

    const data = await request("/tasks");
    const workflow = await request(`/projects/${projectId}/workflow`);
    const stageTitles = new Map((workflow.stages ?? []).map((stage) => [stage.id, stage.title]));
    const tasks = (data.items ?? [])
      .filter((item) => item.projectId === projectId && item.parentId)
      .map((item) => ({
        id: item.id,
        title: item.title,
        stageId: item.stageId,
        stageTitle: item.stageId ? (stageTitles.get(item.stageId) ?? item.stageId) : null,
        workStatus: "todo",
        workStatusLabel: "Todo",
      }));

    const enriched = [];
    for (const epic of (data.items ?? []).filter((item) => item.projectId === projectId && !item.parentId)) {
      const epicTasks = await request(`/projects/${projectId}/epics/${epic.id}/tasks`);
      enriched.push(...(epicTasks.tasks ?? []));
    }
    printTaskTable(enriched.length > 0 ? enriched : tasks);
    process.exit(0);
  }

  usage();
  process.exit(1);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
