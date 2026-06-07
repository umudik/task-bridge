import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { StageEditorDialog } from "@/components/workflow/StageEditorDialog";
import { WorkflowCanvas } from "@/components/workflow/WorkflowCanvas";
import { createEmptyStage } from "@/components/workflow/workflow-utils";
import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/useSession";
import {
  fetchWorkflowTemplate,
  fetchWorkflowTemplates,
  saveWorkflowTemplate,
  type WorkflowStage,
  type WorkflowTemplateSummary,
} from "@/lib/api";
import { cn } from "@/lib/utils";

export function WorkflowTemplatesPage() {
  const session = useSession();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [templates, setTemplates] = useState<WorkflowTemplateSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [stages, setStages] = useState<WorkflowStage[]>([]);
  const [editorIndex, setEditorIndex] = useState<number | null>(null);

  const loadTemplates = useCallback(async () => {
    if (!session) return;
    const items = await fetchWorkflowTemplates(session);
    setTemplates(items);
    if (items.length > 0 && !selectedId) {
      setSelectedId(items[0]?.id ?? null);
    }
  }, [session, selectedId]);

  const loadTemplateStages = useCallback(async () => {
    if (!session || !selectedId) return;
    setLoading(true);
    try {
      const template = await fetchWorkflowTemplate(session, selectedId);
      setStages(template.stages);
      setDirty(false);
      setEditorIndex(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load template");
    } finally {
      setLoading(false);
    }
  }, [session, selectedId]);

  useEffect(() => {
    void loadTemplates().catch((error) => {
      toast.error(error instanceof Error ? error.message : "Failed to load templates");
    });
  }, [loadTemplates]);

  useEffect(() => {
    if (selectedId) {
      void loadTemplateStages();
    }
  }, [loadTemplateStages, selectedId]);

  function markDirty(next: WorkflowStage[]) {
    setStages(next);
    setDirty(true);
  }

  async function handleSave() {
    if (!session || !selectedId) return;
    setSaving(true);
    try {
      const template = await saveWorkflowTemplate(session, selectedId, stages);
      setStages(template.stages);
      setDirty(false);
      toast.success("Template saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save template");
    } finally {
      setSaving(false);
    }
  }

  const editingStage = editorIndex !== null ? stages[editorIndex] ?? null : null;
  const selectedTemplate = templates.find((item) => item.id === selectedId) ?? null;

  if (!session) return null;

  return (
    <div className="surface-grid min-h-full px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-[1800px] space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Button variant="ghost" size="sm" className="mb-2 -ml-2" onClick={() => navigate("/projects")}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Projects
            </Button>
            <h1 className="text-2xl font-semibold tracking-tight">Workflow templates</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Edit shared templates. Projects copy a template when created or via Apply template on the workflow page.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {dirty ? (
              <span className="rounded-full border border-warn/30 bg-warn/10 px-2.5 py-1 text-xs font-medium text-warn">
                Unsaved changes
              </span>
            ) : null}
            <Button onClick={() => void handleSave()} disabled={saving || !dirty || !selectedId}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save template
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {templates.map((template) => (
            <button
              key={template.id}
              type="button"
              onClick={() => {
                if (dirty && !window.confirm("Discard unsaved changes?")) return;
                setSelectedId(template.id);
              }}
              className={cn(
                "rounded-lg border px-4 py-2 text-left transition-colors",
                selectedId === template.id
                  ? "border-primary bg-primary/10"
                  : "border-border bg-card/80 hover:border-primary/40",
              )}
            >
              <p className="text-sm font-medium">{template.title}</p>
              <p className="text-xs text-muted-foreground">{template.description}</p>
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : selectedTemplate ? (
          <WorkflowCanvas
            stages={stages}
            onSelectStage={setEditorIndex}
            onAddStage={() => {
              const next = [...stages, createEmptyStage(stages.length)];
              markDirty(next);
              setEditorIndex(next.length - 1);
            }}
          />
        ) : null}

        <StageEditorDialog
          open={editorIndex !== null}
          stage={editingStage}
          decisions={[]}
          onOpenChange={(open) => {
            if (!open) setEditorIndex(null);
          }}
          onSave={(stage) => {
            if (editorIndex === null) return;
            markDirty(stages.map((item, idx) => (idx === editorIndex ? stage : item)));
            setEditorIndex(null);
          }}
          onDelete={() => {
            if (editorIndex === null) return;
            markDirty(
              stages.filter((_, idx) => idx !== editorIndex).map((stage, position) => ({ ...stage, position })),
            );
            setEditorIndex(null);
          }}
        />
      </div>
    </div>
  );
}
