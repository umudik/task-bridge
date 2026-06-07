import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BridgeTask } from "../domain/task.js";
import type { EpicClaimIndex } from "./task-claim-policy.js";
import { isWorkflowClaimable, sortWorkflowClaimCandidates } from "./task-claim-policy.js";

function makeIndex(activeStageId: string): EpicClaimIndex {
  return {
    activeStageByEpic: new Map([[1, activeStageId]]),
    stagePositionByProject: new Map([
      ["p1", new Map([
        ["stage-1", 0],
        ["stage-2", 1],
      ])],
    ]),
  };
}

function makeTask(overrides: Partial<BridgeTask> & { id: number }): BridgeTask {
  const now = new Date().toISOString();
  return {
    id: overrides.id,
    projectId: overrides.projectId ?? "p1",
    projectName: overrides.projectName ?? "Project",
    parentId: overrides.parentId ?? null,
    epicId: overrides.epicId ?? (overrides.parentId ? 1 : null),
    templateId: overrides.templateId ?? null,
    title: overrides.title ?? `Task ${overrides.id}`,
    description: "",
    acceptanceCriteria: null,
    priority: null,
    labels: [],
    assignee: null,
    aiContext: null,
    aiSummary: null,
    createdBy: "test",
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
    claimedBy: overrides.claimedBy ?? null,
    claimedAt: overrides.claimedAt ?? null,
    answeredBy: null,
    answeredAt: null,
    answer: null,
    stageId: overrides.stageId ?? "stage-1",
    workStatus: overrides.workStatus ?? "todo",
    comments: overrides.comments ?? [],
    events: [],
  };
}

describe("task claim policy", () => {
  it("only allows tasks on the epic active stage", () => {
    const tasks = [
      makeTask({ id: 1, parentId: null, stageId: "stage-1" }),
      makeTask({ id: 10, parentId: 1, stageId: "stage-1", workStatus: "todo" }),
      makeTask({ id: 11, parentId: 1, stageId: "stage-2", workStatus: "todo" }),
    ];
    const index = makeIndex("stage-1");
    assert.equal(isWorkflowClaimable(tasks[1]!, index), true);
    assert.equal(isWorkflowClaimable(tasks[2]!, index), false);
  });

  it("prefers in-progress work on the active stage", () => {
    const tasks = [
      makeTask({ id: 1, parentId: null, stageId: "stage-1" }),
      makeTask({ id: 10, parentId: 1, stageId: "stage-1", workStatus: "todo", createdAt: "2026-01-01T00:00:00.000Z" }),
      makeTask({ id: 11, parentId: 1, stageId: "stage-1", workStatus: "in_progress", createdAt: "2026-01-02T00:00:00.000Z" }),
    ];
    const index = makeIndex("stage-1");
    const sorted = sortWorkflowClaimCandidates(tasks.filter((task) => task.parentId !== null), index);
    assert.equal(sorted[0]?.id, 11);
  });
});
