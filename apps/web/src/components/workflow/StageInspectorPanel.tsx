import { Trash2, X } from "lucide-react";
import { DescriptionEditor } from "@/components/DescriptionEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { WorkflowStage } from "@/lib/api";
import { useConfirm } from "@/lib/confirm";
import {
  findTemplateInTree,
  patchTemplateInTree,
  removeTemplateFromTree,
} from "./template-graph-utils";
import { syncStageTemplates } from "./workflow-utils";
import { ProjectRoleSelect } from "./ProjectRoleSelect";

type StageInspectorPanelProps = {
  stage: WorkflowStage;
  stageCount: number;
  projectRoles: string[];
  selectedTaskTemplateId: string | null;
  onChange: (stage: WorkflowStage) => void;
  onSelectTaskTemplate: (templateId: string | null) => void;
  onDeleteStage: () => void;
  onClose: () => void;
};

function nodeKindLabel(depth: number) {
  if (depth <= 0) return "Task";
  return "Subtask";
}

export function StageInspectorPanel({
  stage,
  stageCount,
  projectRoles,
  selectedTaskTemplateId,
  onChange,
  onSelectTaskTemplate,
  onDeleteStage,
  onClose,
}: StageInspectorPanelProps) {
  const { confirmDestructive } = useConfirm();
  const activeTasks = stage.activeTaskCount ?? 0;
  const canDeleteStage = stageCount > 1 && activeTasks === 0;
  const templates = stage.taskTemplates ?? [];
  const selected = selectedTaskTemplateId
    ? findTemplateInTree(templates, selectedTaskTemplateId)
    : null;
  const activeTemplate = selected?.template ?? null;
  const nodeDepth = selected?.depth ?? 0;

  function updateStage(patch: Partial<WorkflowStage>) {
    onChange(syncStageTemplates({ ...stage, ...patch }));
  }

  function updateTemplates(next: typeof templates) {
    onChange(syncStageTemplates({ ...stage, taskTemplates: next }));
  }

  function patchTemplate(templateId: string, patch: Parameters<typeof patchTemplateInTree>[2]) {
    updateTemplates(patchTemplateInTree(templates, templateId, patch));
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">
            {activeTemplate ? nodeKindLabel(nodeDepth) : "Pipeline step"}
          </p>
          <p className="mt-1 truncate text-sm font-semibold text-white">
            {activeTemplate ? activeTemplate.title : stage.title || "Untitled"}
          </p>
          {activeTemplate ? (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              Step: {stage.title || "Untitled"}
              {nodeDepth > 0 ? ` · nested level ${nodeDepth}` : ""}
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-muted-foreground">Use + on the canvas to add tasks</p>
          )}
        </div>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {activeTemplate ? (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="task-title">Title</Label>
            <Input
              id="task-title"
              value={activeTemplate.title}
              onChange={(event) => patchTemplate(activeTemplate.id, { title: event.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <DescriptionEditor
              value={activeTemplate.description}
              onChange={(next) => patchTemplate(activeTemplate.id, { description: next })}
              placeholder="What should happen in this task?"
            />
          </div>
          <ProjectRoleSelect
            label="Assignee role"
            value={activeTemplate.assigneeRole ?? ""}
            roles={projectRoles}
            onChange={(next) => patchTemplate(activeTemplate.id, { assigneeRole: next || undefined })}
          />
          <Button
            type="button"
            variant="ghost"
            className="w-full justify-start text-destructive hover:text-destructive"
            onClick={() => {
              void (async () => {
                if (!(await confirmDestructive(`Delete "${activeTemplate.title}"?`))) {
                  return;
                }
                updateTemplates(removeTemplateFromTree(templates, activeTemplate.id));
                onSelectTaskTemplate(null);
              })();
            }}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete node
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="stage-title">Title</Label>
            <Input
              id="stage-title"
              value={stage.title}
              onChange={(event) => updateStage({ title: event.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <DescriptionEditor
              value={stage.description}
              onChange={(next) => updateStage({ description: next })}
              placeholder="Step context, expectations, notes…"
            />
          </div>
          <ProjectRoleSelect
            id="stage-auto-assign-role"
            label="Auto-assign role"
            value={stage.autoAssignRole ?? ""}
            roles={projectRoles}
            emptyLabel="Off"
            onChange={(next) => updateStage({ autoAssignRole: next || undefined })}
          />
          {stageCount <= 1 ? (
            <p className="text-xs text-muted-foreground">At least one pipeline step is required.</p>
          ) : activeTasks > 0 ? (
            <p className="text-xs text-muted-foreground">
              {activeTasks} epic(s) are on this step and it cannot be deleted.
            </p>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            disabled={!canDeleteStage}
            className="w-full justify-start text-destructive hover:text-destructive disabled:opacity-40"
            onClick={() => {
              if (!canDeleteStage) return;
              void (async () => {
                if (!(await confirmDestructive(`Delete step "${stage.title || "Untitled"}"?`))) return;
                onDeleteStage();
              })();
            }}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete step
          </Button>
        </div>
      )}
    </div>
  );
}
