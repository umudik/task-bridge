import { assertCanCompleteTask, isDoneStage, type BridgeTask } from "../domain/task.js";
import { listBridgeTasks } from "./task-service.js";

export async function validateStageTransition(task: BridgeTask, stageId: string): Promise<void> {
  if (!isDoneStage(stageId)) return;
  const tasks = await listBridgeTasks();
  assertCanCompleteTask(tasks, task);
}
