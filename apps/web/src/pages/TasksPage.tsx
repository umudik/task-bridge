import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ChevronRight, Loader2, Plus, RefreshCw, SendHorizontal } from "lucide-react";
import { toast } from "sonner";
import { LoadMore } from "@/components/LoadMore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/hooks/useSession";
import { createEpic, fetchInbox, type InboxItem } from "@/lib/api";
import { formatWhen } from "@/lib/utils";

const PAGE_SIZE = 30;

function statusDot(status: string) {
  if (status === "ready") return "bg-emerald-500";
  if (status === "sent") return "bg-sky-500";
  return "bg-amber-500";
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
  const [showComposer, setShowComposer] = useState(false);

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
        const scoped = data.items.filter((item) => !item.parentId);
        setItems((prev) => (append ? [...prev, ...scoped] : scoped));
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
      await createEpic(session, {
        projectId,
        title: trimmedTitle,
        description: description.trim(),
      });
      setTitle("");
      setDescription("");
      setShowComposer(false);
      toast.success("Epic created");
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create task");
    } finally {
      setSending(false);
    }
  }

  const hasMore = items.length < total;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="page-toolbar">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-white">Epics</h1>
          <p className="text-xs text-muted-foreground">
            {total > 0 ? `${total} active` : "No epics yet"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading || loadingMore}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </Button>
          <Button size="sm" onClick={() => setShowComposer((value) => !value)}>
            <Plus className="h-4 w-4" />
            New epic
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {showComposer ? (
          <section className="panel-card mb-5 space-y-4 p-5">
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Epic title"
              disabled={sending}
              autoFocus
            />
            <Textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Description (optional)"
              rows={3}
              disabled={sending}
              className="resize-y rounded-xl border-white/[0.1] bg-[#111111]"
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setShowComposer(false)}>
                Cancel
              </Button>
              <Button disabled={sending || !title.trim()} onClick={() => void submit()}>
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
                Create
              </Button>
            </div>
          </section>
        ) : null}

        {loading && items.length === 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <Skeleton className="h-28 rounded-2xl" />
            <Skeleton className="h-28 rounded-2xl" />
            <Skeleton className="h-28 rounded-2xl" />
          </div>
        ) : items.length === 0 ? (
          <div className="panel-card flex flex-col items-center justify-center px-6 py-16 text-center">
            <p className="text-sm text-muted-foreground">Create your first epic to start the pipeline.</p>
            <Button className="mt-4" size="sm" onClick={() => setShowComposer(true)}>
              <Plus className="h-4 w-4" />
              New epic
            </Button>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((item) => (
              <Link
                key={item.taskId}
                to={`/projects/${projectId}/tasks/${item.taskId}`}
                className="panel-card group flex min-h-[7rem] flex-col justify-between p-4 transition-colors hover:border-white/[0.14] hover:bg-[#141414]"
              >
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${statusDot(item.status)}`} />
                    <span className="text-[11px] text-muted-foreground">#{item.taskId}</span>
                    {item.stageTitle ? (
                      <span className="rounded-md bg-white/[0.06] px-2 py-0.5 text-[10px] font-medium">
                        {item.stageTitle}
                      </span>
                    ) : null}
                  </div>
                  <p className="line-clamp-2 text-sm font-semibold text-white group-hover:text-primary">
                    {item.title || `Task #${item.taskId}`}
                  </p>
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{formatWhen(item.activityAt ?? item.updatedAt ?? item.createdAt)}</span>
                  <ChevronRight className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
              </Link>
            ))}
          </div>
        )}

        <LoadMore
          loaded={items.length}
          total={total}
          hasMore={hasMore}
          loading={loadingMore}
          onLoadMore={() => void load(page + 1, true)}
        />
      </div>
    </div>
  );
}
