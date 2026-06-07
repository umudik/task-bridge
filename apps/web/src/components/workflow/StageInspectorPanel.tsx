import { Layers, Plus, Trash2, X } from "lucide-react";
import { DescriptionEditor } from "@/components/DescriptionEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { StageTaskTemplate, WorkflowStage } from "@/lib/api";
import { useConfirm } from "@/lib/confirm";
import { createTaskTemplate, syncStageTemplates } from "./workflow-utils";
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

function patchTemplate(
  templates: StageTaskTemplate[],
  templateId: string,
  patch: Partial<StageTaskTemplate>,
): StageTaskTemplate[] {
  return templates.map((item) => (item.id === templateId ? { ...item, ...patch } : item));
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
  const activeTemplate = templates.find((item) => item.id === selectedTaskTemplateId) ?? null;
  const editingTask = Boolean(activeTemplate);

  function updateStage(patch: Partial<WorkflowStage>) {
    onChange(syncStageTemplates({ ...stage, ...patch }));
  }

  function updateTemplates(next: StageTaskTemplate[]) {
    onChange(syncStageTemplates({ ...stage, taskTemplates: next }));
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">
            {editingTask ? "Task template" : "Pipeline step"}
          </p>
          <p className="mt-1 truncate text-sm font-semibold text-white">
            {editingTask ? activeTemplate?.title : stage.title || "Untitled"}
          </p>
          {editingTask ? (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">Step: {stage.title || "Untitled"}</p>
          ) : (
            <p className="mt-0.5 text-xs text-muted-foreground">Workflow step · not an epic</p>
          )}
        </div>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {editingTask && activeTemplate ? (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="task-title">Title</Label>
            <Input
              id="task-title"
              value={activeTemplate.title}
              onChange={(event) =>
                updateTemplates(patchTemplate(templates, activeTemplate.id, { title: event.target.value }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <DescriptionEditor
              value={activeTemplate.description}
              onChange={(next) =>
                updateTemplates(patchTemplate(templates, activeTemplate.id, { description: next }))
              }
              placeholder="What should happen in this subtask?"
            />
          </div>
          <ProjectRoleSelect
            label="Assignee role"
            value={activeTemplate.assigneeRole ?? ""}
            roles={projectRoles}
            onChange={(next) =>
              updateTemplates(
                patchTemplate(templates, activeTemplate.id, {
                  assigneeRole: next || undefined,
                }),
              )
            }
          />
          <p className="text-xs text-muted-foreground">
            Templates spawn when an epic is created. Subtasks use Todo / In progress / Done.
          </p>
          <Button
            type="button"
            variant="ghost"
            className="w-full justify-start text-destructive hover:text-destructive"
            onClick={() => {
              void (async () => {
                if (!(await confirmDestructive(`Delete task "${activeTemplate.title}"?`))) {
                  return;
                }
                const next = templates.filter((item) => item.id !== activeTemplate.id);
                updateTemplates(next);
                onSelectTaskTemplate(null);
              })();
            }}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete task template
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
          <div className="rounded-lg border border-white/[0.08] p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                <p className="text-sm font-medium text-white">Task templates</p>
                <span className="text-xs text-muted-foreground">({templates.length})</span>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  const next = [...templates, createTaskTemplate(stage.title, templates.length)];
                  updateTemplates(next);
                  const created = next[next.length - 1];
                  if (created) onSelectTaskTemplate(created.id);
                }}
              >
                <Plus className="h-4 w-4" />
                Add
              </Button>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Click a task card on the canvas to edit. Title shows on canvas; description stays here.
            </p>
          </div>
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
