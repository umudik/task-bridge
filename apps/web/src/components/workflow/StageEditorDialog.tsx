import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import type { ProjectDecision, WorkflowStage } from "@/lib/api";
import { rulesToText, slugify, textToRules } from "./workflow-utils";

type StageEditorDialogProps = {
  open: boolean;
  stage: WorkflowStage | null;
  decisions: ProjectDecision[];
  onOpenChange: (open: boolean) => void;
  onSave: (stage: WorkflowStage) => void;
  onDelete: () => void;
};

export function StageEditorDialog({
  open,
  stage,
  decisions,
  onOpenChange,
  onSave,
  onDelete,
}: StageEditorDialogProps) {
  const [draft, setDraft] = useState<WorkflowStage | null>(stage);

  useEffect(() => {
    setDraft(stage);
  }, [stage]);

  if (!draft) return null;

  function patch(partial: Partial<WorkflowStage>) {
    setDraft((current) => (current ? { ...current, ...partial } : current));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Stage settings</DialogTitle>
          <DialogDescription>
            Purpose, rules and linked decisions for this workflow step.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="stage-title">Title</Label>
              <Input
                id="stage-title"
                value={draft.title}
                onChange={(event) => {
                  const title = event.target.value;
                  patch({
                    title,
                    id: draft.id.startsWith("stage-") ? slugify(title) || draft.id : draft.id,
                  });
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="stage-id">Id</Label>
              <Input
                id="stage-id"
                value={draft.id}
                onChange={(event) => patch({ id: slugify(event.target.value) || draft.id })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="stage-description">Description</Label>
            <Textarea
              id="stage-description"
              value={draft.description}
              onChange={(event) => patch({ description: event.target.value })}
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="stage-purpose">Purpose</Label>
            <Textarea
              id="stage-purpose"
              value={draft.purpose}
              onChange={(event) => patch({ purpose: event.target.value })}
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="stage-rules">Rules (one per line)</Label>
            <Textarea
              id="stage-rules"
              value={rulesToText(draft.rules)}
              onChange={(event) => patch({ rules: textToRules(event.target.value) })}
              rows={5}
              className="font-mono text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label>Linked decisions</Label>
            <div className="flex flex-wrap gap-2">
              {decisions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No project decisions yet.</p>
              ) : (
                decisions.map((decision) => {
                  const checked = draft.decisionIds.includes(decision.id);
                  return (
                    <button
                      key={decision.id}
                      type="button"
                      onClick={() => {
                        const next = checked
                          ? draft.decisionIds.filter((id) => id !== decision.id)
                          : [...draft.decisionIds, decision.id];
                        patch({ decisionIds: next });
                      }}
                      className={
                        checked
                          ? "rounded-full border border-primary bg-primary/15 px-3 py-1 text-xs font-medium text-primary"
                          : "rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                      }
                    >
                      {decision.title}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="stage-spawn-count">Auto-create subtasks on entry</Label>
            <Input
              id="stage-spawn-count"
              type="number"
              min={0}
              max={100}
              value={draft.spawnTaskCount ?? 0}
              onChange={(event) => {
                const value = Number.parseInt(event.target.value, 10);
                patch({ spawnTaskCount: Number.isFinite(value) && value >= 0 ? value : 0 });
              }}
            />
            <p className="text-xs text-muted-foreground">
              When a task enters this stage, create this many subtasks (0 = off). Existing subtasks are not duplicated.
            </p>
          </div>

          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3">
            <input
              type="checkbox"
              checked={draft.autoAssign}
              onChange={(event) => patch({ autoAssign: event.target.checked })}
              className="h-4 w-4 accent-primary"
            />
            <div>
              <p className="text-sm font-medium">Auto-assign</p>
              <p className="text-xs text-muted-foreground">
                Assign to the available member with the lowest open task count.
              </p>
            </div>
          </label>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button type="button" variant="ghost" className="text-destructive hover:text-destructive" onClick={onDelete}>
            <Trash2 className="mr-2 h-4 w-4" />
            Delete stage
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => onSave(draft)}>
              Apply
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
