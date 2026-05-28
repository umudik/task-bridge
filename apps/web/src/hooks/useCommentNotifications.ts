import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { fetchInbox, type InboxItem } from "@/lib/api";
import { markCommentNotified, wasCommentNotified } from "@/lib/read-tasks";
import type { Session } from "@/lib/session";

export function useCommentNotifications(session: Session | null, projectId: string | undefined) {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const initializedRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!session || !projectId) return;
    setLoading(true);
    try {
      const data = await fetchInbox(session, {
        projectId,
        commentsOnly: true,
        page: 1,
        limit: 100,
      });

      for (const item of data.items) {
        if (!initializedRef.current) {
          markCommentNotified(item.taskId);
          continue;
        }
        if (!wasCommentNotified(item.taskId)) {
          markCommentNotified(item.taskId);
          toast.message("A comment was added to your task", {
            description: item.title || `Task #${item.taskId}`,
          });
        }
      }
      initializedRef.current = true;

      const all = await fetchInbox(session, { projectId, page: 1, limit: 100 });
      setItems(all.items);
    } finally {
      setLoading(false);
    }
  }, [session, projectId]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30000);
    const onRead = () => void refresh();
    window.addEventListener("task-bridge:read", onRead);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("task-bridge:read", onRead);
    };
  }, [refresh]);

  const commentItems = items.filter((item) => item.status === "ready");
  const openItems = items.filter((item) => item.status === "sent");

  return { items, commentItems, openItems, loading, refresh };
}
