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
import { fetchAnswer, postTaskComment, type AnswerDetail, type TaskComment } from "@/lib/api";
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
    return () => {
      active = false;
    };
  }, [session, taskId]);

  const comments = useMemo(
    () => sortComments(detail?.comments ?? []),
    [detail?.comments],
  );
  const description = detail?.description?.trim() ? detail.description : null;

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
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 pb-10">
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
          </header>

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

  return (
    <article className="w-full py-3 first:pt-0 last:pb-0">
      <p className="text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{name}</span>
        {comment.at ? <> · {formatWhen(comment.at)}</> : null}
      </p>
      <div className="mt-1 w-full">
        <MarkdownView content={body} />
      </div>
    </article>
  );
}
