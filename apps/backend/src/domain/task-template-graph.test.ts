import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { collectSpawnableTemplates, type TemplateSpawnContext } from "./task-template-graph.js";
import type { StageTaskTemplate } from "./workflow-stage.js";

function ctx(overrides: Partial<TemplateSpawnContext> = {}): TemplateSpawnContext {
  return {
    stageId: "stage-1",
    stagePosition: 0,
    activeStagePosition: 0,
    spawnedTemplateIds: new Set<string>(),
    doneTemplateIds: new Set<string>(),
    ...overrides,
  };
}

describe("task template graph", () => {
  it("spawns parallel roots on active stage", () => {
    const roots: StageTaskTemplate[] = [
      { id: "a", title: "A", description: "" },
      { id: "b", title: "B", description: "" },
    ];
    const spawnable = collectSpawnableTemplates(roots, ctx());
    assert.deepEqual(
      spawnable.map((item) => item.id),
      ["a", "b"],
    );
  });

  it("spawns only first node in sequential group", () => {
    const roots: StageTaskTemplate[] = [
      {
        id: "group",
        kind: "group",
        title: "Group",
        description: "",
        execution: "sequential",
        children: [
          { id: "a", title: "A", description: "" },
          { id: "b", title: "B", description: "" },
        ],
      },
    ];
    const spawnable = collectSpawnableTemplates(roots, ctx());
    assert.deepEqual(
      spawnable.map((item) => item.id),
      ["a"],
    );
  });

  it("spawns next sequential node after previous is done", () => {
    const roots: StageTaskTemplate[] = [
      {
        id: "group",
        kind: "group",
        title: "Group",
        description: "",
        execution: "sequential",
        children: [
          { id: "a", title: "A", description: "" },
          { id: "b", title: "B", description: "" },
        ],
      },
    ];
    const spawnable = collectSpawnableTemplates(
      roots,
      ctx({
        spawnedTemplateIds: new Set(["a"]),
        doneTemplateIds: new Set(["a"]),
      }),
    );
    assert.deepEqual(
      spawnable.map((item) => item.id),
      ["b"],
    );
  });

  it("waits for dependsOn before spawning", () => {
    const roots: StageTaskTemplate[] = [
      { id: "a", title: "A", description: "" },
      { id: "b", title: "B", description: "", dependsOn: ["a"] },
    ];
    const blocked = collectSpawnableTemplates(roots, ctx());
    assert.deepEqual(
      blocked.map((item) => item.id),
      ["a"],
    );
    const unlocked = collectSpawnableTemplates(
      roots,
      ctx({
        spawnedTemplateIds: new Set(["a"]),
        doneTemplateIds: new Set(["a"]),
      }),
    );
    assert.deepEqual(
      unlocked.map((item) => item.id),
      ["b"],
    );
  });

  it("does not spawn children until parent task is done", () => {
    const roots: StageTaskTemplate[] = [
      {
        id: "parent",
        title: "Parent",
        description: "",
        execution: "parallel",
        children: [
          { id: "c1", title: "Child 1", description: "" },
          { id: "c2", title: "Child 2", description: "" },
        ],
      },
    ];
    const pending = collectSpawnableTemplates(
      roots,
      ctx({
        spawnedTemplateIds: new Set(["parent"]),
      }),
    );
    assert.deepEqual(pending, []);
  });

  it("spawns parallel children when parent task is done", () => {
    const roots: StageTaskTemplate[] = [
      {
        id: "parent",
        title: "Parent",
        description: "",
        execution: "parallel",
        children: [
          { id: "c1", title: "Child 1", description: "" },
          { id: "c2", title: "Child 2", description: "" },
        ],
      },
    ];
    const spawnable = collectSpawnableTemplates(
      roots,
      ctx({
        spawnedTemplateIds: new Set(["parent"]),
        doneTemplateIds: new Set(["parent"]),
      }),
    );
    assert.deepEqual(
      spawnable.map((item) => item.id).sort(),
      ["c1", "c2"],
    );
  });
});
