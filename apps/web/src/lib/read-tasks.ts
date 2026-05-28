const READ_KEY = "task-bridge.read-tasks";
const NOTIFY_KEY = "task-bridge.notified-comments";

function readIds(key: string): number[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is number => typeof id === "number");
  } catch {
    return [];
  }
}

function writeIds(key: string, ids: number[]) {
  localStorage.setItem(key, JSON.stringify([...new Set(ids)]));
}

export function isTaskRead(taskId: number) {
  return readIds(READ_KEY).includes(taskId);
}

export function markTaskRead(taskId: number) {
  writeIds(READ_KEY, [...readIds(READ_KEY), taskId]);
  window.dispatchEvent(new CustomEvent("task-bridge:read"));
}

export function wasCommentNotified(taskId: number) {
  return readIds(NOTIFY_KEY).includes(taskId);
}

export function markCommentNotified(taskId: number) {
  writeIds(NOTIFY_KEY, [...readIds(NOTIFY_KEY), taskId]);
}

export function unreadCommentCount(items: { taskId: number; status: string }[]) {
  return items.filter((item) => item.status === "ready" && !isTaskRead(item.taskId)).length;
}
