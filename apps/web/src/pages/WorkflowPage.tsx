import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { StageInspectorPanel } from "@/components/workflow/StageInspectorPanel";
import { WorkflowCanvas } from "@/components/workflow/WorkflowCanvas";
import { WorkflowInspectorSidebar } from "@/components/workflow/WorkflowInspectorSidebar";
import {
  createEmptyStage,
  insertStageAt,
  moveStageBy,
  syncStageTemplates,
} from "@/components/workflow/workflow-utils";
import { Button } from "@/components/ui/button";
import { TeamPanel } from "@/components/workflow/TeamPanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSession } from "@/hooks/useSession";
import {
  createMember,
  deleteMember,
  fetchProjectWorkflow,
  saveProjectWorkflow,
  updateMember,
  type ProjectMember,
  type WorkflowStage,
} from "@/lib/api";

export function WorkflowPage() {
  const { projectId = "" } = useParams();
  const session = useSession();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [stages, setStages] = useState<WorkflowStage[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [editorIndex, setEditorIndex] = useState<number | null>(null);
  const [selectedTaskTemplateId, setSelectedTaskTemplateId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarPulse, setSidebarPulse] = useState(0);
  const sidebarPulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reload = useCallback(async () => {
    if (!session || !projectId) return;
    setLoading(true);
    try {
      const workflow = await fetchProjectWorkflow(session, projectId);
      setStages(workflow.stages);
      setRoles(workflow.roles ?? []);
      setMembers(workflow.members);
      setDirty(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load workflow");
    } finally {
      setLoading(false);
    }
  }, [session, projectId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    return () => {
      if (sidebarPulseTimerRef.current) clearTimeout(sidebarPulseTimerRef.current);
    };
  }, []);

  function revealSidebar() {
    if (sidebarPulseTimerRef.current) clearTimeout(sidebarPulseTimerRef.current);
    setSidebarOpen(false);
    sidebarPulseTimerRef.current = setTimeout(() => {
      setSidebarOpen(true);
      setSidebarPulse((value) => value + 1);
      sidebarPulseTimerRef.current = null;
    }, 130);
  }

  function markDirty(next: WorkflowStage[]) {
    setStages([...next].sort((a, b) => a.position - b.position));
    setDirty(true);
  }

  function selectNewStage(next: WorkflowStage[], index: number, taskTemplateId: string | null = null) {
    markDirty(next);
    setEditorIndex(index);
    setSelectedTaskTemplateId(taskTemplateId);
    revealSidebar();
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
    const target = index + delta;
    setEditorIndex(target);
  }

  async function handleSaveStages() {
    if (!session) return;
    setSaving(true);
    try {
      const workflow = await saveProjectWorkflow(session, projectId, { stages, roles });
      setStages(workflow.stages);
      setRoles(workflow.roles ?? []);
      setDirty(false);
      toast.success("Workflow saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save workflow");
    } finally {
      setSaving(false);
    }
  }

  function updateStageAt(index: number, stage: WorkflowStage) {
    markDirty(stages.map((item, idx) => (idx === index ? syncStageTemplates(stage) : item)));
  }

  function removeStageAt(index: number) {
    if (stages.length <= 1) {
      toast.error("At least one pipeline step is required");
      return;
    }
    const stage = stages[index];
    const activeTasks = stage?.activeTaskCount ?? 0;
    if (activeTasks > 0) {
      toast.error(`${activeTasks} epic(s) are on this step and it cannot be deleted`);
      return;
    }
    markDirty(
      stages.filter((_, idx) => idx !== index).map((stage, position) => ({ ...stage, position })),
    );
    setEditorIndex(null);
    setSelectedTaskTemplateId(null);
    setSidebarOpen(false);
  }

  async function handleCreateMember(name: string) {
    if (!session || !name.trim()) return;
    const member = await createMember(session, projectId, { name: name.trim() });
    setMembers((current) => [...current, member].sort((a, b) => a.name.localeCompare(b.name)));
    toast.success("Member added");
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

  function selectFromCanvas(sortedIndex: number, taskTemplateId: string | null = null) {
    setStageBySortedIndex(sortedIndex, taskTemplateId);
    revealSidebar();
  }

  function closeInspector() {
    setEditorIndex(null);
    setSelectedTaskTemplateId(null);
    setSidebarOpen(false);
  }

  if (!session) return null;

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="page-toolbar flex-wrap">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Pipeline</h1>
          <p className="text-xs text-muted-foreground">Pipeline steps and task templates · epics run this workflow</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {dirty ? (
            <span className="rounded-full border border-warn/30 bg-warn/10 px-2.5 py-1 text-xs font-medium text-warn">
              Unsaved changes
            </span>
          ) : null}
          <Button onClick={() => void handleSaveStages()} disabled={saving || !dirty}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save workflow
          </Button>
        </div>
      </div>

      <Tabs defaultValue="stages" className="flex min-h-0 flex-1 flex-col">
        <div className="shrink-0 border-b border-white/[0.06] px-5">
          <TabsList className="h-10 bg-transparent p-0">
            <TabsTrigger value="stages" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent">
              Pipeline
            </TabsTrigger>
            <TabsTrigger value="members" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent">
              Team
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="stages" className="mt-0 flex min-h-0 flex-1 data-[state=active]:flex">
          <div className="flex min-h-0 flex-1">
            <WorkflowCanvas
              className="min-h-0 flex-1"
              stages={stages}
              selectedStageId={editingStage?.id ?? null}
              selectedTaskTemplateId={selectedTaskTemplateId}
              onAddStage={addStageAtEnd}
              onInsertStageAfter={insertStageAfter}
              onMoveStage={moveStage}
              onSelectStage={(flowIndex) => selectFromCanvas(flowIndex, null)}
              onSelectTaskTemplate={(flowIndex, templateId) => selectFromCanvas(flowIndex, templateId)}
            />
            <WorkflowInspectorSidebar
              open={sidebarOpen && editingStage !== null}
              pulseKey={sidebarPulse}
              onOpenChange={(next) => {
                if (!next) closeInspector();
                else if (editingStage) setSidebarOpen(true);
              }}
            >
              {editingStage ? (
                <StageInspectorPanel
                  stage={editingStage}
                  stageCount={stages.length}
                  projectRoles={roles}
                  selectedTaskTemplateId={selectedTaskTemplateId}
                  onChange={(stage) => {
                    if (editorIndex === null) return;
                    updateStageAt(editorIndex, stage);
                  }}
                  onSelectTaskTemplate={setSelectedTaskTemplateId}
                  onDeleteStage={() => {
                    if (editorIndex === null) return;
                    removeStageAt(editorIndex);
                  }}
                  onClose={closeInspector}
                />
              ) : null}
            </WorkflowInspectorSidebar>
          </div>
        </TabsContent>

        <TabsContent value="members" className="mt-0 flex-1 overflow-y-auto">
          <TeamPanel
            roles={roles}
            members={members}
            onRolesChange={(nextRoles) => {
              const removed = roles.filter((role) => !nextRoles.includes(role));
              if (removed.length > 0) {
                setStages((current) =>
                  current.map((stage) => ({
                    ...stage,
                    autoAssignRole: removed.includes(stage.autoAssignRole ?? "")
                      ? undefined
                      : stage.autoAssignRole,
                    taskTemplates: (stage.taskTemplates ?? []).map((template) => ({
                      ...template,
                      assigneeRole: removed.includes(template.assigneeRole ?? "")
                        ? undefined
                        : template.assigneeRole,
                    })),
                  })),
                );
                void Promise.all(
                  members
                    .filter((member) => member.role && removed.includes(member.role))
                    .map((member) => updateMember(session, projectId, member.id, { role: "" })),
                ).then((updated) => {
                  if (updated.length === 0) return;
                  setMembers((current) =>
                    current.map((member) => {
                      const patch = updated.find((item) => item?.id === member.id);
                      return patch ?? member;
                    }),
                  );
                });
              }
              setRoles(nextRoles);
              setDirty(true);
            }}
            onCreateMember={async (name) => {
              try {
                await handleCreateMember(name);
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Failed to add member");
              }
            }}
            onUpdateMember={async (memberId, patch) => {
              if (!session) return;
              try {
                const updated = await updateMember(session, projectId, memberId, patch);
                setMembers((current) => current.map((item) => (item.id === memberId ? updated : item)));
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Failed to update member");
              }
            }}
            onDeleteMember={async (id, name) => {
              if (!session) return;
              try {
                await deleteMember(session, projectId, id);
                setMembers((current) => current.filter((item) => item.id !== id));
                toast.success(`Deleted "${name}"`);
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Failed to delete member");
              }
            }}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
