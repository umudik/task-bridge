import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ExpandableMarkdown } from "@/components/ExpandableMarkdown";
import { MarkdownView } from "@/components/MarkdownView";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/hooks/useSession";
import {
  createTask,
  fetchAnswer,
  fetchProjectWorkflow,
  postTaskComment,
  transitionTask,
  type AnswerDetail,
  type ProjectWorkflow,
  type TaskComment,
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
  return comment.authorType === "ai" ? "Cursor AI" : "User";
}

export function TaskPage() {
  const { projectId, taskId: taskIdParam } = useParams();
  const taskId = Number(taskIdParam);
  const session = useSession();
  const [detail, setDetail] = useState<AnswerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [commentText, setCommentText] = useState("");
  const [sending, setSending] = useState(false);
  const [workflow, setWorkflow] = useState<ProjectWorkflow | null>(null);
  const [transitioning, setTransitioning] = useState(false);
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [creatingSubtask, setCreatingSubtask] = useState(false);

  useEffect(() => {
    if (!session || !Number.isFinite(taskId)) return;
    const activeSession = session;
    let active = true;

    async function load() {
      setLoading(true);
      try {
        const data = await fetchAnswer(activeSession, taskId);
        if (!active) return;
        if (data.answer?.trim() || data.status === "ready") {
          markTaskRead(taskId);
        }
        setDetail(data);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to load task");
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    if (projectId) {
      void fetchProjectWorkflow(activeSession, projectId)
        .then((data) => {
          if (active) setWorkflow(data);
        })
        .catch(() => undefined);
    }
    return () => {
      active = false;
    };
  }, [session, taskId, projectId]);

  const comments = useMemo(
    () => sortComments(detail?.comments ?? []),
    [detail?.comments],
  );
  const description = detail?.description?.trim() ? detail.description : null;

  async function handleTransition(stageId: string) {
    if (!session || !Number.isFinite(taskId)) return;
    setTransitioning(true);
    try {
      const data = await transitionTask(session, taskId, stageId);
      setDetail(data);
      toast.success("Stage updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to move task");
    } finally {
      setTransitioning(false);
    }
  }

  async function handleCreateSubtask() {
    if (!session || !Number.isFinite(taskId)) return;
    const title = subtaskTitle.trim();
    if (!title) return;
    setCreatingSubtask(true);
    try {
      await createTask(session, { parentId: taskId, title });
      const data = await fetchAnswer(session, taskId);
      setDetail(data);
      setSubtaskTitle("");
      toast.success("Subtask created");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create subtask");
    } finally {
      setCreatingSubtask(false);
    }
  }

  async function handleSendComment() {
    if (!session || !Number.isFinite(taskId)) return;
    const text = commentText.trim();
    if (!text) return;

    setSending(true);
    try {
      await postTaskComment(session, taskId, text);
      const data = await fetchAnswer(session, taskId);
      setDetail(data);
      setCommentText("");
      toast.success("Comment added");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to send comment");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex w-full flex-col gap-5 pb-10">
      <Button variant="ghost" asChild className="w-fit px-0 text-muted-foreground hover:text-foreground">
        <Link to={`/projects/${projectId}/tasks`}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to tasks
        </Link>
      </Button>

      {loading ? (
        <Skeleton className="h-96 w-full rounded-xl" />
      ) : detail ? (
        <>
          <header className="border-b border-border pb-4">
            <h1 className="text-2xl font-semibold leading-snug tracking-tight">{detail.title}</h1>
            <div className="mt-2 flex flex-wrap gap-2 text-sm text-muted-foreground">
              {detail.parent ? (
                <Link
                  to={`/projects/${projectId}/tasks/${detail.parent.taskId}`}
                  className="rounded-full border px-2 py-0.5 hover:text-foreground"
                >
                  Parent: {detail.parent.title}
                </Link>
              ) : null}
              {detail.stage?.title ? (
                <span className="rounded-full border px-2 py-0.5 text-foreground">{detail.stage.title}</span>
              ) : null}
              {detail.assignee ? <span>Assignee: {detail.assignee}</span> : null}
            </div>
          </header>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">Subtasks</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              {(detail.subtasks ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No subtasks yet.</p>
              ) : (
                <ul className="space-y-2">
                  {(detail.subtasks ?? []).map((subtask) => (
                    <li key={subtask.taskId}>
                      <Link
                        to={`/projects/${projectId}/tasks/${subtask.taskId}`}
                        className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm hover:border-primary/30"
                      >
                        <span>{subtask.title}</span>
                        <span className="text-xs text-muted-foreground">
                          {subtask.stageTitle ?? subtask.stageId ?? "—"}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex gap-2 border-t border-border pt-3">
                <input
                  value={subtaskTitle}
                  onChange={(event) => setSubtaskTitle(event.target.value)}
                  placeholder="New subtask title"
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  disabled={creatingSubtask}
                />
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={creatingSubtask || !subtaskTitle.trim()}
                  onClick={() => void handleCreateSubtask()}
                >
                  {creatingSubtask ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {detail.stage ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold">Stage</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                {detail.stage.purpose ? (
                  <div>
                    <p className="text-xs uppercase text-muted-foreground">Purpose</p>
                    <p className="text-sm">{detail.stage.purpose}</p>
                  </div>
                ) : null}
                {detail.stage.rules.length > 0 ? (
                  <div>
                    <p className="text-xs uppercase text-muted-foreground">Rules</p>
                    <ul className="list-disc space-y-1 pl-5 text-sm">
                      {detail.stage.rules.map((rule) => (
                        <li key={rule}>{rule}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {detail.stage.decisions.length > 0 ? (
                  <div>
                    <p className="text-xs uppercase text-muted-foreground">Linked decisions</p>
                    <ul className="space-y-2 text-sm">
                      {detail.stage.decisions.map((decision) => (
                        <li key={decision.id} className="rounded-lg border px-3 py-2">
                          <p className="font-medium">{decision.title}</p>
                          {decision.body ? <p className="text-muted-foreground">{decision.body}</p> : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {workflow && workflow.stages.length > 0 ? (
                  <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                    {workflow.stages
                      .filter((stage) => stage.id !== detail.stageId)
                      .map((stage) => (
                        <Button
                          key={stage.id}
                          size="sm"
                          variant="outline"
                          disabled={transitioning}
                          onClick={() => void handleTransition(stage.id)}
                        >
                          Move to {stage.title}
                        </Button>
                      ))}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">Description</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {description?.trim() ? (
                <ExpandableMarkdown content={description} />
              ) : (
                <p className="text-sm text-muted-foreground">No description yet.</p>
              )}
            </CardContent>
          </Card>

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
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Task not found.</p>
      )}
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
