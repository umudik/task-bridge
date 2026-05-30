import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ChevronRight, Loader2, RefreshCw, SendHorizontal } from "lucide-react";
import { toast } from "sonner";
import { LoadMore } from "@/components/LoadMore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/hooks/useSession";
import { createTask, fetchInbox, type InboxItem } from "@/lib/api";
import { cn, formatWhen } from "@/lib/utils";

const PAGE_SIZE = 30;

function statusLabel(status: string | null | undefined) {
  const value = (status ?? "open").toLowerCase();
  if (value === "done") return "Done";
  if (value === "in_progress" || value === "claimed") return "In progress";
  return "Open";
}

function statusClass(status: string | null | undefined) {
  const value = (status ?? "open").toLowerCase();
  if (value === "done") return "bg-emerald-500/15 text-emerald-400";
  if (value === "in_progress" || value === "claimed") return "bg-amber-500/15 text-amber-400";
  return "bg-muted text-muted-foreground";
}

export function TasksPage() {
  const { projectId } = useParams();
  const session = useSession();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [sending, setSending] = useState(false);
  const [items, setItems] = useState<InboxItem[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(
    async (pageNum: number, append: boolean) => {
      if (!session || !projectId) return;
      if (append) setLoadingMore(true);
      else setLoading(true);
      try {
        const data = await fetchInbox(session, {
          projectId,
          page: pageNum,
          limit: PAGE_SIZE,
        });
        setItems((prev) => (append ? [...prev, ...data.items] : data.items));
        setTotal(data.total);
        setPage(pageNum);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to load tasks");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [session, projectId],
  );

  const refresh = useCallback(() => {
    void load(1, false);
  }, [load]);

  useEffect(() => {
    void load(1, false);
  }, [load]);

  async function submit() {
    if (!session || !projectId) return;
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;
    setSending(true);
    try {
      await createTask(session, {
        projectId,
        title: trimmedTitle,
        description: description.trim(),
      });
      setTitle("");
      setDescription("");
      toast.success("Task created");
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create task");
    } finally {
      setSending(false);
    }
  }

  const hasMore = items.length < total;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Create and browse all tasks in this project.
        </p>
      </div>

      <section className="space-y-4 rounded-xl border bg-card/50 p-5">
        <div className="space-y-2">
          <Label htmlFor="task-title">Title</Label>
          <Input
            id="task-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="What needs to be done?"
            disabled={sending}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="task-description">Description</Label>
          <Textarea
            id="task-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Optional details"
            rows={4}
            disabled={sending}
            className="resize-y"
          />
        </div>
        <div className="flex justify-end">
          <Button disabled={sending || !title.trim()} onClick={() => void submit()}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
            Create task
          </Button>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            {total > 0 ? `${total} task${total === 1 ? "" : "s"}` : "No tasks yet"}
          </p>
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading || loadingMore}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </Button>
        </div>

        {loading && items.length === 0 ? (
          <>
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </>
        ) : items.length === 0 ? (
          <p className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
            Create your first task above.
          </p>
        ) : (
          <ul className="space-y-2">
            {items.map((item) => (
              <li key={item.taskId}>
                <Link
                  to={`/projects/${projectId}/tasks/${item.taskId}`}
                  className="flex items-center gap-3 rounded-xl border bg-card/40 px-4 py-3 transition-colors hover:border-primary/30 hover:bg-accent/20"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-muted-foreground">#{item.taskId}</span>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs font-medium",
                          statusClass(item.workflowStatus),
                        )}
                      >
                        {statusLabel(item.workflowStatus)}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-sm font-medium">
                      {item.title || `Task #${item.taskId}`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Updated {formatWhen(item.activityAt ?? item.updatedAt ?? item.createdAt)}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        )}

        <LoadMore
          loaded={items.length}
          total={total}
          hasMore={hasMore}
          loading={loadingMore}
          onLoadMore={() => void load(page + 1, true)}
        />
      </section>
    </div>
  );
}
