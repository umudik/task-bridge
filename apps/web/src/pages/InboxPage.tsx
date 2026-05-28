import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ChevronRight, Loader2, MessageSquare, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { LoadMore } from "@/components/LoadMore";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/hooks/useSession";
import { fetchInbox, type InboxItem } from "@/lib/api";
import { isTaskRead } from "@/lib/read-tasks";
import { cn, formatWhen } from "@/lib/utils";

const PAGE_SIZE = 20;

export function InboxPage() {
  const { projectId } = useParams();
  const session = useSession();
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
          commentsOnly: true,
          page: pageNum,
          limit: PAGE_SIZE,
        });
        setItems((prev) => (append ? [...prev, ...data.items] : data.items));
        setTotal(data.total);
        setPage(pageNum);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to load inbox");
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

  useEffect(() => {
    const onRead = () => refresh();
    window.addEventListener("task-bridge:read", onRead);
    return () => window.removeEventListener("task-bridge:read", onRead);
  }, [refresh]);

  const unreadOnPage = items.filter((item) => !isTaskRead(item.taskId)).length;
  const hasMore = items.length < total;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Inbox</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Comments on your tasks, newest first.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh} disabled={loading || loadingMore}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <MessageSquare className="h-5 w-5 text-primary" />
            Notifications
          </CardTitle>
          <CardDescription>
            {unreadOnPage > 0 ? `${unreadOnPage} unread` : "You are all caught up."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading && items.length === 0 ? (
            <>
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No comments yet.</p>
          ) : (
            items.map((item) => {
              const unread = !isTaskRead(item.taskId);
              return (
                <Link
                  key={item.taskId}
                  to={`/projects/${projectId}/tasks/${item.taskId}`}
                  className={cn(
                    "flex items-center justify-between rounded-xl border px-4 py-3 transition-colors",
                    unread
                      ? "border-primary/20 bg-primary/5 hover:border-primary/40 hover:bg-primary/10"
                      : "border-border/60 bg-background/40 opacity-80 hover:bg-accent/20",
                  )}
                >
                  <div className="min-w-0 pr-3">
                    <p className="text-sm font-medium">
                      {unread ? "A comment was added to your task" : "Comment on your task"}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">
                      {item.title || `Task #${item.taskId}`}
                    </p>
                    {item.preview ? (
                      <p className="line-clamp-1 text-xs text-muted-foreground">{item.preview}</p>
                    ) : null}
                    <p className="text-xs text-muted-foreground">
                      {formatWhen(item.activityAt ?? item.answeredAt ?? item.updatedAt ?? item.createdAt)}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              );
            })
          )}
          <LoadMore
            loaded={items.length}
            total={total}
            hasMore={hasMore}
            loading={loadingMore}
            onLoadMore={() => void load(page + 1, true)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
