import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { CreateTaskModal } from "@/components/CreateTaskModal";
import { DescriptionEditorModal } from "@/components/DescriptionEditorModal";
import { TaskLibraryLinks } from "@/components/TaskLibraryLinks";
import { EpicProgressCanvas } from "@/components/workflow/EpicProgressCanvas";
import { EpicTaskInspector } from "@/components/workflow/EpicTaskInspector";
import { MarkdownView } from "@/components/MarkdownView";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/hooks/useSession";
import {
  addTaskComment,
  createTask,
  fetchProjectWorkflow,
  fetchTask,
  updateTaskDescription,
  updateTaskWorkStatus,
  type TaskComment,
  type TaskDetail,
  type WorkflowStage,
  type WorkStatus,
} from "@/lib/api";
import { markTaskRead } from "@/lib/read-tasks";
import { formatWhen } from "@/lib/utils";

function parseTime(value: string | null | undefined) {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function sortComments(comments: TaskComment[]) {
  return [...comments].sort((a, b) => parseTime(a.at) - parseTime(b.at));
}

function authorLabel(comment: TaskComment) {
  if (comment.authorId?.trim()) return comment.authorId.trim();
  if (comment.by?.trim()) return comment.by.trim();
  if (comment.authorType === "system") return comment.authorId?.trim() || "System";
  return comment.authorId?.trim() || comment.by?.trim() || "User";
}

export function TaskPage() {
  const { projectId = "", taskId: taskIdParam } = useParams();
  const taskId = Number(taskIdParam);
  const session = useSession();
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [workflowStages, setWorkflowStages] = useState<WorkflowStage[]>([]);
  const [loading, setLoading] = useState(true);
  const [commentText, setCommentText] = useState("");
  const [sending, setSending] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [updatingSubtaskStatus, setUpdatingSubtaskStatus] = useState(false);
  const [addTaskTarget, setAddTaskTarget] = useState<{
    parentId: number;
    stageId: string | null;
    label: string;
  } | null>(null);
  const [creatingTask, setCreatingTask] = useState(false);
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  const [savingDescription, setSavingDescription] = useState(false);
  const [selectedSubtaskId, setSelectedSubtaskId] = useState<number | null>(null);

  useEffect(() => {
    if (!session || !Number.isFinite(taskId)) return;
    const activeSession = session;
    let active = true;

    async function load() {
      setLoading(true);
      try {
        const data = await fetchTask(activeSession, taskId);
        if (!active) return;
        if (data.status === "ready") {
          markTaskRead(taskId);
        }
        setDetail(data);
        if (data.isEpic) {
          const workflowProjectId = data.projectId ?? projectId;
          if (workflowProjectId) {
            const workflow = await fetchProjectWorkflow(activeSession, workflowProjectId);
            if (active) setWorkflowStages(workflow.stages);
          }
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to load task");
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [session, taskId, projectId]);

  const comments = useMemo(
    () => sortComments(detail?.comments ?? []),
    [detail?.comments],
  );
  const description = detail?.description?.trim() ? detail.description : null;
  const subtasks = detail?.subtasks ?? [];
  const selectedSubtask = useMemo(
    () => subtasks.find((entry) => entry.taskId === selectedSubtaskId) ?? null,
    [subtasks, selectedSubtaskId],
  );
  const epicProgress = useMemo(() => {
    const total = subtasks.length;
    const done = subtasks.filter((entry) => entry.done).length;
    const active = subtasks.filter((entry) => entry.workStatus === "in_progress").length;
    return { total, done, active };
  }, [subtasks]);

  async function reloadEpic() {
    if (!session || !Number.isFinite(taskId)) return;
    const data = await fetchTask(session, taskId);
    setDetail(data);
    return data;
  }

  async function handleWorkStatus(workStatus: WorkStatus) {
    if (!session || !Number.isFinite(taskId)) return;
    setUpdatingStatus(true);
    try {
      const data = await updateTaskWorkStatus(session, taskId, workStatus);
      setDetail(data);
      toast.success("Status updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update status");
    } finally {
      setUpdatingStatus(false);
    }
  }

  async function handleSubtaskStatus(subtaskId: number, workStatus: WorkStatus) {
    if (!session) return;
    setUpdatingSubtaskStatus(true);
    try {
      await updateTaskWorkStatus(session, subtaskId, workStatus);
      const data = await reloadEpic();
      if (data) {
        const refreshed = data.subtasks?.find((entry) => entry.taskId === subtaskId);
        if (refreshed) setSelectedSubtaskId(subtaskId);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update status");
    } finally {
      setUpdatingSubtaskStatus(false);
    }
  }

  async function handleCreateTask(title: string, description: string) {
    if (!session || !addTaskTarget) return;
    const trimmed = title.trim();
    if (!trimmed) return;
    setCreatingTask(true);
    try {
      const created = await createTask(session, {
        parentId: addTaskTarget.parentId,
        title: trimmed,
        description: description.trim() || undefined,
        stageId: addTaskTarget.stageId ?? undefined,
      });
      const data = await reloadEpic();
      const createdId = Number(created.id);
      if (Number.isFinite(createdId)) {
        setSelectedSubtaskId(createdId);
      } else if (data?.subtasks?.length) {
        const match = data.subtasks.find((entry) => entry.title === trimmed);
        if (match) setSelectedSubtaskId(match.taskId);
      }
      toast.success(`Added to ${addTaskTarget.label}`);
      setAddTaskTarget(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create task");
    } finally {
      setCreatingTask(false);
    }
  }

  async function handleSaveDescription(next: string) {
    if (!session || !Number.isFinite(taskId)) return;
    setSavingDescription(true);
    try {
      const data = await updateTaskDescription(session, taskId, next);
      setDetail(data);
      setDescriptionOpen(false);
      toast.success("Description saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save description");
    } finally {
      setSavingDescription(false);
    }
  }

  async function handleSendComment() {
    if (!session || !Number.isFinite(taskId)) return;
    const text = commentText.trim();
    if (!text) return;

    setSending(true);
    try {
      const data = await addTaskComment(session, taskId, text);
      setDetail(data);
      setCommentText("");
      toast.success("Comment added");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to send comment");
    } finally {
      setSending(false);
    }
  }

  const tasksPath = `/projects/${projectId}/tasks`;
  const crumbs = [
    { label: "Projects", to: "/projects" },
    { label: session?.projectName ?? projectId ?? "Project", to: tasksPath },
    { label: "Epics", to: tasksPath },
  ];
  if (detail?.parent) {
    crumbs.push({ label: detail.parent.title, to: `${tasksPath}/${detail.parent.taskId}` });
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        breadcrumb={crumbs}
        title={loading ? "Loading…" : detail?.title ?? "Task"}
      />

      <div className="flex-1 overflow-y-auto px-8 py-5 pb-10">
        <div className="flex flex-col gap-5">
      {loading ? (
        <Skeleton className="h-96 w-full rounded-xl" />
      ) : detail ? (
        <>
          <header className="space-y-3 border-b border-border pb-4">
                <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                  {detail.parent ? (
                    <Link
                      to={`/projects/${projectId}/tasks/${detail.parent.taskId}`}
                      className="rounded-full border px-2 py-0.5 hover:text-foreground"
                    >
                      Parent: {detail.parent.title}
                    </Link>
                  ) : null}
                  {detail.isEpic && detail.stage?.title ? (
                    <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-primary">
                      Active step: {detail.stage.title}
                    </span>
                  ) : null}
                  {detail.isEpic && epicProgress.total > 0 ? (
                    <span className="rounded-full border px-2 py-0.5 text-foreground">
                      {epicProgress.done}/{epicProgress.total} tasks done
                      {epicProgress.active > 0 ? ` · ${epicProgress.active} in progress` : ""}
                    </span>
                  ) : null}
                  {!detail.isEpic && detail.workStatusLabel ? (
                    <span className="rounded-full border px-2 py-0.5 text-foreground">{detail.workStatusLabel}</span>
                  ) : null}
                  {detail.assignee ? <span>Assignee: {detail.assignee}</span> : null}
                </div>
          </header>

          {detail.isEpic ? (
            <section className="panel-card p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-white">Description</h2>
                <Button type="button" variant="ghost" size="sm" onClick={() => setDescriptionOpen(true)}>
                  <Pencil className="mr-1.5 h-3.5 w-3.5" />
                  {description ? "Edit" : "Add"}
                </Button>
              </div>
              <div className="mt-3">
                {description ? (
                  <MarkdownView content={description} />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No description yet — add goals, scope, or acceptance notes.
                  </p>
                )}
              </div>
            </section>
          ) : null}

          {session && detail.isEpic ? (
            <TaskLibraryLinks
              session={session}
              taskId={taskId}
              links={detail.libraryLinks ?? []}
              onChange={(libraryLinks) =>
                setDetail((current) => (current ? { ...current, libraryLinks } : current))
              }
            />
          ) : null}

          {detail.isEpic ? (
            <div className="flex min-h-[min(72vh,680px)] overflow-hidden rounded-xl border border-white/[0.06] bg-[#080808]">
              <EpicProgressCanvas
                stages={workflowStages}
                epicId={taskId}
                epicStageId={detail.stageId ?? null}
                subtasks={subtasks}
                selectedTaskId={selectedSubtaskId}
                onSelectTask={setSelectedSubtaskId}
                onAddTaskToStage={(stageId, stageTitle) =>
                  setAddTaskTarget({ parentId: taskId, stageId, label: `step "${stageTitle}"` })
                }
                onAddSubtask={(parentTaskId, parentTitle, stageId) =>
                  setAddTaskTarget({ parentId: parentTaskId, stageId, label: `subtask of "${parentTitle}"` })
                }
              />
              <EpicTaskInspector
                projectId={projectId}
                epicId={taskId}
                subtasks={subtasks}
                selected={selectedSubtask}
                updatingStatus={updatingSubtaskStatus}
                onClose={() => setSelectedSubtaskId(null)}
                onStatusChange={(subtaskId, status) => void handleSubtaskStatus(subtaskId, status)}
              />
            </div>
          ) : null}

          {!detail.isEpic ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold">Work status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                <p className="text-sm text-muted-foreground">
                  Step: {detail.stage?.title ?? detail.stageId ?? "—"}
                </p>
                <div className="flex flex-wrap gap-2">
                  {(["todo", "in_progress", "done"] as WorkStatus[]).map((status) => (
                    <Button
                      key={status}
                      size="sm"
                      variant={detail.workStatus === status ? "default" : "outline"}
                      disabled={updatingStatus}
                      onClick={() => void handleWorkStatus(status)}
                    >
                      {status === "in_progress" ? "In progress" : status === "done" ? "Done" : "Todo"}
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : null}

          {!detail.isEpic && description ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold">Description</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <MarkdownView content={description} />
              </CardContent>
            </Card>
          ) : null}

          {detail.isEpic ? (
            <DescriptionEditorModal
              open={descriptionOpen}
              onOpenChange={setDescriptionOpen}
              title="Epic description"
              value={detail.description ?? ""}
              onSave={(next) => void handleSaveDescription(next)}
              placeholder="Goals, scope, links, acceptance notes…"
              saving={savingDescription}
            />
          ) : null}

          {detail.isEpic ? (
            <CreateTaskModal
              open={addTaskTarget !== null}
              onOpenChange={(open) => {
                if (!open) setAddTaskTarget(null);
              }}
              targetLabel={addTaskTarget?.label ?? null}
              saving={creatingTask}
              onCreate={(title, description) => void handleCreateTask(title, description)}
            />
          ) : null}

          {!detail.isEpic ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold">Comments</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 pt-0">
                {comments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No comments yet.</p>
                ) : (
                  <div className="divide-y divide-border">
                    {comments.map((comment) => (
                      <CommentRow key={comment.id} comment={comment} />
                    ))}
                  </div>
                )}

                <div className="border-t border-border pt-4">
                  <Textarea
                    value={commentText}
                    onChange={(event) => setCommentText(event.target.value)}
                    placeholder="Add a comment…"
                    rows={2}
                    disabled={sending}
                    className="min-h-[56px] resize-y"
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                        event.preventDefault();
                        void handleSendComment();
                      }
                    }}
                  />
                  <div className="mt-2 flex justify-end">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => void handleSendComment()}
                      disabled={sending || !commentText.trim()}
                    >
                      {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      {sending ? "Saving…" : "Comment"}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Task not found.</p>
      )}
        </div>
      </div>
    </div>
  );
}

function CommentRow({ comment }: { comment: TaskComment }) {
  const name = authorLabel(comment);
  const body = comment.body ?? comment.text ?? null;
  const tags = comment.tags ?? [];

  return (
    <article className="w-full py-3 first:pt-0 last:pb-0">
      <p className="text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{name}</span>
        {tags.length > 0 ? <> · {tags.join(", ")}</> : null}
        {comment.at ? <> · {formatWhen(comment.at)}</> : null}
      </p>
      <div className="mt-1 w-full">
        <MarkdownView content={body} />
      </div>
    </article>
  );
}
