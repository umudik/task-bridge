import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ChevronRight, Loader2, MessageSquare, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { LoadMore } from "@/components/LoadMore";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/hooks/useSession";
import { fetchInbox, type InboxItem } from "@/lib/api";
import { isTaskRead, markTaskRead } from "@/lib/read-tasks";
import { cn, formatWhen } from "@/lib/utils";

const PAGE_SIZE = 20;

export function InboxPage() {
  const params = useParams();
  let projectId: string | null = null;
  if (typeof params["projectId"] === "string" && params["projectId"].length > 0) {
    projectId = params["projectId"];
  }
  const session = useSession();
  const [items, setItems] = useState<InboxItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(
    async (cursor: string | null, append: boolean) => {
      if (!session || !projectId) return;
      if (append) setLoadingMore(true);
      else setLoading(true);
      try {
        const data = await fetchInbox(session, {
          projectId,
          commentsOnly: true,
          epicsOnly: null,
          cursor,
          limit: PAGE_SIZE,
        });
        setItems((prev) => (append ? prev.concat(data.items) : data.items));
        setNextCursor(data.nextCursor);
        setHasMore(data.hasMore);
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
    void load(null, false);
  }, [load]);

  useEffect(() => {
    void load(null, false);
  }, [load]);

  useEffect(() => {
    const onRead = () => {
      setItems((prev) => prev.slice());
    };
    window.addEventListener("task-bridge:read", onRead);
    return () => window.removeEventListener("task-bridge:read", onRead);
  }, []);

  const unreadOnPage = items.filter((item) => !isTaskRead(item.taskId)).length;

  let projectLabel = "Project";
  if (session !== null && session.projectName !== null) {
    projectLabel = session.projectName;
  } else if (projectId !== null) {
    projectLabel = projectId;
  }
  let projectTasksPath = "/projects";
  if (projectId !== null) {
    projectTasksPath = `/projects/${projectId}/tasks`;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        breadcrumb={[
          { label: "Projects", to: "/projects" },
          { label: projectLabel, to: projectTasksPath },
          { label: "Inbox", to: null },
        ]}
        title="Inbox"
        subtitle={unreadOnPage > 0 ? `${unreadOnPage} unread` : "All caught up"}
        actions={
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading || loadingMore}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto p-5">
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
                  onClick={() => {
                    if (unread) {
                      markTaskRead(item.taskId);
                    }
                  }}
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
                      {formatWhen(
                        item.activityAt !== null
                          ? item.activityAt
                          : item.updatedAt !== null
                            ? item.updatedAt
                            : item.createdAt,
                      )}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              );
            })
          )}
          <LoadMore
            loaded={items.length}
            hasMore={hasMore}
            loading={loadingMore}
            onLoadMore={() => {
              const cursor = nextCursor;
              void load(cursor, true);
            }}
          />
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
