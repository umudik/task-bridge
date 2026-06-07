import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertCanCompleteTask,
  DONE_STAGE_ID,
  incompleteSubtasks,
  isDoneStage,
  listSubtasks,
  normalizeTask,
  type BridgeTask,
  type RawTask,
} from "./task.js";
import { AppError } from "../errors/app-error.js";

function makeTask(overrides: Partial<BridgeTask> & Pick<BridgeTask, "id" | "title">): BridgeTask {
  const now = "2026-01-01T00:00:00.000Z";
  const { id, title, ...rest } = overrides;
  return {
    id,
    title,
    projectId: overrides.projectId ?? "demo",
    projectName: overrides.projectName ?? "Demo",
    parentId: overrides.parentId ?? null,
    description: overrides.description ?? "",
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
    stageId: overrides.stageId ?? "backlog",
    comments: [],
    events: [],
    ...rest,
  };
}

describe("task domain", () => {
  it("maps legacy status done to done stage", () => {
    const task = normalizeTask({
      ...makeTask({ id: 1, title: "A" }),
      status: "done",
      stageId: null,
    } as RawTask);
    assert.equal(task.stageId, DONE_STAGE_ID);
  });

  it("blocks parent completion when subtasks are open", () => {
    const parent = makeTask({ id: 1, title: "Parent", stageId: "review" });
    const child = makeTask({ id: 2, title: "Child", parentId: 1, stageId: "development" });
    const tasks = [parent, child];

    assert.equal(incompleteSubtasks(tasks, 1).length, 1);
    assert.throws(
      () => assertCanCompleteTask(tasks, parent),
      (error: unknown) => error instanceof AppError && error.statusCode === 409,
    );
  });

  it("allows parent completion when all subtasks are done", () => {
    const parent = makeTask({ id: 1, title: "Parent", stageId: "review" });
    const child = makeTask({ id: 2, title: "Child", parentId: 1, stageId: DONE_STAGE_ID });
    assert.doesNotThrow(() => assertCanCompleteTask([parent, child], parent));
  });

  it("lists subtasks for parent", () => {
    const parent = makeTask({ id: 1, title: "Parent" });
    const child = makeTask({ id: 2, title: "Child", parentId: 1 });
    const other = makeTask({ id: 3, title: "Other" });
    const subtasks = listSubtasks([parent, child, other], 1);
    assert.equal(subtasks.length, 1);
    assert.equal(subtasks[0]?.id, 2);
  });

  it("detects done stage", () => {
    assert.equal(isDoneStage(DONE_STAGE_ID), true);
    assert.equal(isDoneStage("development"), false);
  });
});
