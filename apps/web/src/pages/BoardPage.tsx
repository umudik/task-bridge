import { useState } from "react";
import { useParams } from "react-router-dom";
import { Loader2, SendHorizontal } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/hooks/useSession";
import { createTask } from "@/lib/api";

export function BoardPage() {
  const { projectId } = useParams();
  const session = useSession();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [sending, setSending] = useState(false);

  async function submit() {
    if (!session || !projectId) return;
    const trimmedTitle = title.trim();
    const trimmedDescription = description.trim();
    if (!trimmedTitle) return;
    setSending(true);
    try {
      await createTask(session, {
        projectId,
        title: trimmedTitle,
        description: trimmedDescription,
      });
      setTitle("");
      setDescription("");
      toast.success("Task created");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create task");
    } finally {
      setSending(false);
    }
  }

  const canSubmit = title.trim().length > 0;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Board</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {session?.projectName ?? projectId} · create a new task
        </p>
      </div>

      <Card className="overflow-hidden border-primary/20">
        <div className="h-1 bg-gradient-to-r from-primary/30 via-primary to-primary/30" />
        <CardContent className="space-y-4 p-5">
          <div className="space-y-2">
            <Label htmlFor="task-title">Title</Label>
            <Input
              id="task-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Short summary"
              disabled={sending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="task-description">Description</Label>
            <Textarea
              id="task-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Details, context, requirements…"
              rows={8}
              disabled={sending}
              className="min-h-[160px] resize-y"
            />
          </div>
          <div className="flex justify-end">
            <Button disabled={sending || !canSubmit} onClick={() => void submit()} className="rounded-full px-6">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
              Create task
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
