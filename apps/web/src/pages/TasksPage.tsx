import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Loader2, MessageSquare, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/hooks/useSession";
import { fetchInbox, type InboxItem } from "@/lib/api";
import { formatWhen } from "@/lib/utils";

const columns = [
  { key: "open", label: "Open" },
  { key: "in_progress", label: "In progress" },
  { key: "done", label: "Done" },
] as const;

function columnFor(item: InboxItem) {
  const workflow = (item.workflowStatus ?? "open").toLowerCase();
  if (workflow === "done") return "done";
  if (workflow === "in_progress" || workflow === "claimed") return "in_progress";
  return "open";
}

export function TasksPage() {
  const { projectId } = useParams();
  const session = useSession();
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!session || !projectId) return;
    setLoading(true);
    try {
      const data = await fetchInbox(session, { projectId, page: 1, limit: 100 });
      setItems(data.items);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load tasks");
    } finally {
      setLoading(false);
    }
  }, [session, projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const grouped = columns.map((column) => ({
    ...column,
    items: items.filter((item) => columnFor(item) === column.key),
  }));

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Track status and open tasks for comments.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </Button>
      </div>

      {loading && items.length === 0 ? (
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {grouped.map((column) => (
            <section
              key={column.key}
              className="flex min-h-[320px] flex-col rounded-xl border bg-card/50"
            >
              <header className="flex items-center justify-between border-b px-4 py-3">
                <h2 className="text-sm font-medium">{column.label}</h2>
                <span className="text-xs text-muted-foreground">{column.items.length}</span>
              </header>
              <div className="flex flex-1 flex-col gap-2 p-3">
                {column.items.length === 0 ? (
                  <p className="py-8 text-center text-xs text-muted-foreground">No tasks</p>
                ) : (
                  column.items.map((item) => (
                    <Link
                      key={item.taskId}
                      to={`/projects/${projectId}/tasks/${item.taskId}`}
                      className="rounded-lg border bg-background/70 p-3 transition-colors hover:border-primary/30 hover:bg-accent/20"
                    >
                      <p className="mb-2 line-clamp-2 text-sm font-medium leading-snug">
                        {item.title || `Task #${item.taskId}`}
                      </p>
                      {item.preview ? (
                        <p className="line-clamp-2 text-xs text-muted-foreground">{item.preview}</p>
                      ) : null}
                      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                        <span>#{item.taskId}</span>
                        <span className="flex items-center gap-1">
                          {item.preview ? <MessageSquare className="h-3 w-3" /> : null}
                          {formatWhen(item.activityAt ?? item.updatedAt ?? item.createdAt)}
                        </span>
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
