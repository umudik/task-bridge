import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { consumerStatus } from "./task-response.js";
import type { BridgeTask } from "../domain/task.js";

function makeTask(overrides: Partial<BridgeTask>): BridgeTask {
  const now = "2026-01-01T00:00:00.000Z";
  return {
    id: 1,
    title: "Task",
    projectId: "demo",
    projectName: "Demo",
    parentId: null,
    epicId: null,
    templateId: null,
    description: "",
    acceptanceCriteria: null,
    priority: null,
    labels: [],
    assignee: null,
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
    stageId: "development",
    comments: [],
    events: [],
    ...overrides,
  };
}

describe("task response mapper", () => {
  it("returns sent while task is claimed", () => {
    const status = consumerStatus(makeTask({ claimedBy: "worker", claimedAt: nowIso() }));
    assert.equal(status, "sent");
  });

  it("returns ready when ai output exists and task is not claimed", () => {
    const status = consumerStatus(makeTask({ aiSummary: "done work" }));
    assert.equal(status, "ready");
  });

  it("returns sent when user commented after ai", () => {
    const status = consumerStatus(
      makeTask({
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
      }),
    );
    assert.equal(status, "sent");
  });
});

function nowIso() {
  return new Date().toISOString();
}
