import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BridgeTask } from "../domain/task.js";
import type { EpicClaimIndex } from "./task-claim-policy.js";
import {
  aiAwaitingHumanReply,
  canActorClaimTask,
  isAiClaimRole,
  isWorkflowClaimable,
  rolesMatch,
  sortWorkflowClaimCandidates,
  userAwaitingReply,
} from "./task-claim-policy.js";

function makeIndex(activeStageId: string): EpicClaimIndex {
  return {
    activeStageByEpic: new Map([[1, activeStageId]]),
    stagePositionByProject: new Map([
      [
        "p1",
        new Map([
          ["stage-1", 0],
          ["stage-2", 1],
        ]),
      ],
    ]),
  };
}

function makeTask(overrides: Partial<BridgeTask> & { id: number }): BridgeTask {
  const now = new Date().toISOString();
  const { id, ...rest } = overrides;
  return {
    id,
    projectId: "p1",
    projectName: "Project",
    parentId: null,
    epicId: null,
    templateId: null,
    title: `Task ${id}`,
    description: "",
    acceptanceCriteria: null,
    priority: null,
    labels: [],
    assignee: null,
    assigneeRole: null,
    aiContext: null,
    aiSummary: null,
    createdBy: "test",
    createdAt: now,
    updatedAt: now,
    claimedBy: null,
    claimedAt: null,
    answeredBy: null,
    answeredAt: null,
    answer: null,
    stageId: "stage-1",
    workStatus: "todo",
    comments: [],
    events: [],
    ...rest,
    epicId: rest.epicId ?? (rest.parentId ? 1 : null),
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
      makeTask({
        id: 10,
        parentId: 1,
        stageId: "stage-1",
        workStatus: "todo",
        createdAt: "2026-01-01T00:00:00.000Z",
      }),
      makeTask({
        id: 11,
        parentId: 1,
        stageId: "stage-1",
        workStatus: "in_progress",
        createdAt: "2026-01-02T00:00:00.000Z",
      }),
    ];
    const index = makeIndex("stage-1");
    const sorted = sortWorkflowClaimCandidates(tasks.filter((task) => task.parentId !== null), index);
    assert.equal(sorted[0]?.id, 11);
  });

  it("detects ai roles", () => {
    assert.equal(isAiClaimRole("ai"), true);
    assert.equal(isAiClaimRole("cursor-ai"), true);
    assert.equal(isAiClaimRole("developer"), false);
  });

  it("matches roles case-insensitively", () => {
    assert.equal(rolesMatch("Developer", "developer"), true);
    assert.equal(rolesMatch("ai", "developer"), false);
    assert.equal(rolesMatch("developer", null), true);
  });

  it("lets only ai claim when a human is waiting for a reply", () => {
    const task = makeTask({
      id: 10,
      parentId: 1,
      comments: [
        {
          id: "ai-1",
          authorType: "ai",
          authorId: "cursor-ai",
          tags: [],
          body: "answer",
          at: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "human-1",
          authorType: "human",
          authorId: "user",
          tags: [],
          body: "follow up",
          at: "2026-01-02T00:00:00.000Z",
        },
      ],
    });
    const index = makeIndex("stage-1");
    assert.equal(userAwaitingReply(task), true);
    assert.equal(
      canActorClaimTask(task, index, { claimedBy: "cursor-ai", role: "ai" }),
      true,
    );
    assert.equal(
      canActorClaimTask(task, index, { claimedBy: "Seyit", role: "developer" }),
      false,
    );
  });

  it("requires matching team role for workflow tasks", () => {
    const task = makeTask({
      id: 10,
      parentId: 1,
      assigneeRole: "developer",
    });
    const index = makeIndex("stage-1");
    assert.equal(
      canActorClaimTask(task, index, { claimedBy: "Dev", role: "developer" }),
      true,
    );
    assert.equal(
      canActorClaimTask(task, index, { claimedBy: "cursor-ai", role: "ai" }),
      false,
    );
    assert.equal(
      canActorClaimTask(task, index, { claimedBy: "PM", role: "product" }),
      false,
    );
  });

  it("blocks ai when ai is waiting for a human follow-up", () => {
    const task = makeTask({
      id: 10,
      parentId: 1,
      comments: [
        {
          id: "human-1",
          authorType: "human",
          authorId: "user",
          tags: [],
          body: "please add docs",
          at: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "ai-1",
          authorType: "ai",
          authorId: "cursor-ai",
          tags: [],
          body: "please upload documentation",
          at: "2026-01-02T00:00:00.000Z",
        },
      ],
    });
    const index = makeIndex("stage-1");
    assert.equal(aiAwaitingHumanReply(task), true);
    assert.equal(
      canActorClaimTask(task, index, { claimedBy: "cursor-ai", role: "ai" }),
      false,
    );
    assert.equal(
      canActorClaimTask(task, index, { claimedBy: "Seyit", role: "developer" }),
      true,
    );
  });
});
