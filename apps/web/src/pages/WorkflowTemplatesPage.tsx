import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Save } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { StageInspectorPanel } from "@/components/workflow/StageInspectorPanel";
import { WorkflowCanvas } from "@/components/workflow/WorkflowCanvas";
import {
  createEmptyStage,
  insertStageAt,
  moveStageBy,
  syncStageTemplates,
} from "@/components/workflow/workflow-utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSession } from "@/hooks/useSession";
import {
  createWorkflowTemplate,
  fetchWorkflowTemplate,
  fetchWorkflowTemplates,
  saveWorkflowTemplate,
  type WorkflowStage,
  type WorkflowTemplateSummary,
} from "@/lib/api";
import { cn } from "@/lib/utils";

export function WorkflowTemplatesPage() {
  const session = useSession();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [templates, setTemplates] = useState<WorkflowTemplateSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [stages, setStages] = useState<WorkflowStage[]>([]);
  const [editorIndex, setEditorIndex] = useState<number | null>(null);
  const [selectedTaskTemplateId, setSelectedTaskTemplateId] = useState<string | null>(null);
  const [newTemplateTitle, setNewTemplateTitle] = useState("");
  const [creatingTemplate, setCreatingTemplate] = useState(false);

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
      setSelectedTaskTemplateId(null);
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
    setStages([...next].sort((a, b) => a.position - b.position));
    setDirty(true);
  }

  function selectNewStage(next: WorkflowStage[], index: number, taskTemplateId: string | null = null) {
    markDirty(next);
    setEditorIndex(index);
    setSelectedTaskTemplateId(taskTemplateId);
  }

  function addStageAtEnd() {
    const next = [...stages, createEmptyStage(stages.length)];
    selectNewStage(next, next.length - 1);
  }

  function insertStageAfter(afterIndex: number) {
    const stage = createEmptyStage(afterIndex + 1);
    const next = insertStageAt(stages, afterIndex, stage);
    selectNewStage(next, afterIndex + 1);
  }

  function moveStage(index: number, delta: -1 | 1) {
    const next = moveStageBy(stages, index, delta);
    if (next === stages) return;
    markDirty(next);
    setEditorIndex(index + delta);
  }

  async function handleCreateTemplate() {
    if (!session || !newTemplateTitle.trim()) return;
    if (dirty && !window.confirm("You have unsaved changes. Continue anyway?")) return;
    setCreatingTemplate(true);
    try {
      const template = await createWorkflowTemplate(session, { title: newTemplateTitle.trim() });
      setTemplates((current) =>
        [...current, { id: template.id, title: template.title, description: template.description }].sort((a, b) =>
          a.title.localeCompare(b.title),
        ),
      );
      setSelectedId(template.id);
      setStages(template.stages);
      setDirty(false);
      setEditorIndex(null);
      setSelectedTaskTemplateId(null);
      setNewTemplateTitle("");
      toast.success("Template created");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create template");
    } finally {
      setCreatingTemplate(false);
    }
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

  function setStageBySortedIndex(sortedIndex: number | null, taskTemplateId: string | null = null) {
    if (sortedIndex === null) {
      setEditorIndex(null);
      setSelectedTaskTemplateId(null);
      return;
    }
    const sorted = [...stages].sort((a, b) => a.position - b.position);
    const stage = sorted[sortedIndex];
    if (!stage) return;
    const index = stages.findIndex((item) => item.id === stage.id);
    setEditorIndex(index >= 0 ? index : null);
    setSelectedTaskTemplateId(taskTemplateId);
  }

  if (!session) return null;

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      <aside className="flex w-[240px] shrink-0 flex-col border-r border-white/[0.07] bg-black">
        <div className="space-y-2 border-b border-white/[0.06] px-3 py-3">
          <p className="px-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Templates</p>
          <div className="flex gap-2">
            <Input
              value={newTemplateTitle}
              onChange={(event) => setNewTemplateTitle(event.target.value)}
              placeholder="New template name"
              onKeyDown={(event) => {
                if (event.key === "Enter" && newTemplateTitle.trim()) {
                  event.preventDefault();
                  void handleCreateTemplate();
                }
              }}
            />
            <Button
              type="button"
              size="icon"
              disabled={!newTemplateTitle.trim() || creatingTemplate}
              onClick={() => void handleCreateTemplate()}
            >
              {creatingTemplate ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        <div className="flex-1 space-y-0.5 overflow-y-auto p-2">
          {templates.map((template) => (
            <button
              key={template.id}
              type="button"
              onClick={() => {
                if (dirty && !window.confirm("Discard unsaved changes?")) return;
                setSelectedId(template.id);
              }}
              className={cn(
                "w-full rounded-lg px-3 py-2.5 text-left transition-colors",
                selectedId === template.id
                  ? "bg-white/[0.08] text-foreground"
                  : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground",
              )}
            >
              <p className="text-sm font-medium">{template.title}</p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{template.description}</p>
            </button>
          ))}
        </div>

      </aside>

      <div className="flex min-h-0 flex-1 flex-col">
        <PageHeader
          title={templates.find((item) => item.id === selectedId)?.title ?? "Template"}
          subtitle="Stages and task templates"
          actions={
            <>
              {dirty ? (
                <span className="rounded-full border border-warn/30 bg-warn/10 px-2.5 py-1 text-xs font-medium text-warn">
                  Unsaved
                </span>
              ) : null}
              <Button onClick={() => void handleSave()} disabled={saving || !dirty || !selectedId}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save
              </Button>
            </>
          }
        />

        {loading ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex min-h-0 flex-1">
            <WorkflowCanvas
              className="min-h-0 flex-1"
              stages={stages}
              selectedStageId={editingStage?.id ?? null}
              selectedTaskTemplateId={selectedTaskTemplateId}
              onAddStage={addStageAtEnd}
              onInsertStageAfter={insertStageAfter}
              onMoveStage={moveStage}
              onSelectStage={(flowIndex) => setStageBySortedIndex(flowIndex, null)}
              onSelectTaskTemplate={(flowIndex, templateId) => setStageBySortedIndex(flowIndex, templateId)}
            />
            <aside className="flex w-[380px] shrink-0 flex-col border-l border-white/[0.07] bg-[#0a0a0a]">
              <div className="flex-1 overflow-y-auto p-4">
            {editingStage ? (
              <StageInspectorPanel
                stage={editingStage}
                stageCount={stages.length}
                projectRoles={[]}
                selectedTaskTemplateId={selectedTaskTemplateId}
                onChange={(stage) => {
                  if (editorIndex === null) return;
                  markDirty(stages.map((item, idx) => (idx === editorIndex ? syncStageTemplates(stage) : item)));
                }}
                onSelectTaskTemplate={setSelectedTaskTemplateId}
                onDeleteStage={() => {
                  if (editorIndex === null) return;
                  if (stages.length <= 1) {
                    toast.error("At least one stage is required");
                    return;
                  }
                  markDirty(
                    stages.filter((_, idx) => idx !== editorIndex).map((stage, position) => ({ ...stage, position })),
                  );
                  setEditorIndex(null);
                  setSelectedTaskTemplateId(null);
                }}
                onClose={() => {
                  setEditorIndex(null);
                  setSelectedTaskTemplateId(null);
                }}
              />
            ) : null}
              </div>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
