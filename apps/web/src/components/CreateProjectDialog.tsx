import { Loader2, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Session } from "@/lib/session";
import { createProject, fetchWorkflowTemplates, type Project, type WorkflowTemplateSummary } from "@/lib/api";
import { cn } from "@/lib/utils";

function slugifyProjectId(name: string) {
  const lowered = name.trim().toLowerCase();
  const mapped = lowered
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/ı/g, "i")
    .replace(/İ/g, "i");
  return mapped
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

type CreateProjectDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: Session;
  onCreated: (project: Project) => void;
};

export function CreateProjectDialog({
  open,
  onOpenChange,
  session,
  onCreated,
}: CreateProjectDialogProps) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [projectId, setProjectId] = useState("");
  const [repoPath, setRepoPath] = useState("");
  const [idTouched, setIdTouched] = useState(false);
  const [templates, setTemplates] = useState<WorkflowTemplateSummary[]>([]);
  const [workflowTemplateId, setWorkflowTemplateId] = useState("empty");

  useEffect(() => {
    if (!open) {
      setName("");
      setProjectId("");
      setRepoPath("");
      setIdTouched(false);
      setCreating(false);
      setWorkflowTemplateId("empty");
    }
  }, [open]);

  useEffect(() => {
    if (!open || !session) return;
    void fetchWorkflowTemplates(session)
      .then((items) => {
        setTemplates(items);
        setWorkflowTemplateId((current) =>
          items.some((item) => item.id === current) ? current : (items[0]?.id ?? "empty"),
        );
      })
      .catch(() => setTemplates([]));
  }, [open, session]);

  function handleNameChange(value: string) {
    setName(value);
    if (!idTouched) {
      setProjectId(slugifyProjectId(value));
    }
  }

  async function handleCreate() {
    const trimmedName = name.trim();
    const trimmedRepo = repoPath.trim();
    const trimmedId = projectId.trim();
    if (!trimmedName || !trimmedRepo || !trimmedId) return;

    setCreating(true);
    try {
      const created = await createProject(session, {
        name: trimmedName,
        id: trimmedId,
        repoPath: trimmedRepo,
        workflowTemplateId,
      });
      onCreated(created);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create project");
    } finally {
      setCreating(false);
    }
  }

  const canSubmit = Boolean(name.trim() && projectId.trim() && repoPath.trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>
            Add a workspace path so the AI worker knows where to run.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="project-name">Name</Label>
            <Input
              id="project-name"
              value={name}
              onChange={(event) => handleNameChange(event.target.value)}
              placeholder="My App"
              disabled={creating}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="project-id">Id</Label>
            <Input
              id="project-id"
              value={projectId}
              onChange={(event) => {
                setIdTouched(true);
                setProjectId(event.target.value);
              }}
              placeholder="my-app"
              disabled={creating}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="project-repo">Repo path</Label>
            <Input
              id="project-repo"
              value={repoPath}
              onChange={(event) => setRepoPath(event.target.value)}
              placeholder="C:\dev\my-app"
              disabled={creating}
            />
          </div>
          <div className="space-y-2">
            <Label>Workflow template</Label>
            <div className="grid gap-2">
              {templates.length === 0 ? (
                <p className="text-xs text-muted-foreground">Empty template will be used.</p>
              ) : (
                templates.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    disabled={creating}
                    onClick={() => setWorkflowTemplateId(template.id)}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-left transition-colors",
                      workflowTemplateId === template.id
                        ? "border-primary bg-primary/10"
                        : "border-border hover:border-primary/40",
                    )}
                  >
                    <p className="text-sm font-medium">{template.title}</p>
                    <p className="text-xs text-muted-foreground">{template.description}</p>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={creating}>
            Cancel
          </Button>
          <Button disabled={creating || !canSubmit} onClick={() => void handleCreate()}>
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
