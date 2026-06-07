import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Copy, Loader2, Plus, Save } from "lucide-react";
import { toast } from "sonner";
import { StageEditorDialog } from "@/components/workflow/StageEditorDialog";
import { WorkflowCanvas } from "@/components/workflow/WorkflowCanvas";
import { createEmptyStage } from "@/components/workflow/workflow-utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/hooks/useSession";
import {
  applyWorkflowTemplate,
  createDecision,
  createMember,
  deleteDecision,
  deleteMember,
  fetchProjectWorkflow,
  fetchWorkflowTemplates,
  saveProjectWorkflow,
  updateDecision,
  updateMember,
  type ProjectDecision,
  type ProjectMember,
  type WorkflowStage,
  type WorkflowTemplateSummary,
} from "@/lib/api";

export function WorkflowPage() {
  const { projectId = "" } = useParams();
  const session = useSession();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [stages, setStages] = useState<WorkflowStage[]>([]);
  const [decisions, setDecisions] = useState<ProjectDecision[]>([]);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [editorIndex, setEditorIndex] = useState<number | null>(null);
  const [templates, setTemplates] = useState<WorkflowTemplateSummary[]>([]);
  const [applyingTemplate, setApplyingTemplate] = useState(false);

  const reload = useCallback(async () => {
    if (!session || !projectId) return;
    setLoading(true);
    try {
      const workflow = await fetchProjectWorkflow(session, projectId);
      setStages(workflow.stages);
      setDecisions(workflow.decisions);
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
    if (!session) return;
    void fetchWorkflowTemplates(session)
      .then(setTemplates)
      .catch(() => setTemplates([]));
  }, [session]);

  function markDirty(next: WorkflowStage[]) {
    setStages(next);
    setDirty(true);
  }

  async function handleApplyTemplate(templateId: string) {
    if (!session) return;
    const template = templates.find((item) => item.id === templateId);
    if (!template) return;
    if (
      !window.confirm(
        `Copy "${template.title}" template into this project workflow? Current stages will be replaced.`,
      )
    ) {
      return;
    }
    setApplyingTemplate(true);
    try {
      const workflow = await applyWorkflowTemplate(session, projectId, templateId);
      setStages(workflow.stages);
      setDirty(false);
      toast.success(`Applied "${template.title}" template`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to apply template");
    } finally {
      setApplyingTemplate(false);
    }
  }

  async function handleSaveStages() {
    if (!session) return;
    setSaving(true);
    try {
      const workflow = await saveProjectWorkflow(session, projectId, stages);
      setStages(workflow.stages);
      setDirty(false);
      toast.success("Workflow saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save workflow");
    } finally {
      setSaving(false);
    }
  }

  function replaceStageAt(index: number, stage: WorkflowStage) {
    markDirty(stages.map((item, idx) => (idx === index ? stage : item)));
    setEditorIndex(null);
  }

  function removeStageAt(index: number) {
    markDirty(
      stages.filter((_, idx) => idx !== index).map((stage, position) => ({ ...stage, position })),
    );
    setEditorIndex(null);
  }

  async function handleCreateDecision(title: string, body: string) {
    if (!session || !title.trim()) return;
    const decision = await createDecision(session, projectId, { title: title.trim(), body });
    setDecisions((current) => [decision, ...current]);
    toast.success("Decision added");
  }

  async function handleCreateMember(name: string) {
    if (!session || !name.trim()) return;
    const member = await createMember(session, projectId, { name: name.trim(), available: true });
    setMembers((current) => [...current, member].sort((a, b) => a.name.localeCompare(b.name)));
    toast.success("Member added");
  }

  const editingStage = editorIndex !== null ? stages[editorIndex] ?? null : null;

  if (!session) return null;

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Workflow</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Canvas üzerinde gez (pan/zoom). Akış sırası stage position alanından gelir.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {templates.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {templates.map((template) => (
                <Button
                  key={template.id}
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={applyingTemplate || saving}
                  onClick={() => void handleApplyTemplate(template.id)}
                >
                  <Copy className="mr-1.5 h-3.5 w-3.5" />
                  {template.title}
                </Button>
              ))}
            </div>
          ) : null}
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

      <Tabs defaultValue="stages">
        <TabsList>
          <TabsTrigger value="stages">Pipeline</TabsTrigger>
          <TabsTrigger value="decisions">Decisions</TabsTrigger>
          <TabsTrigger value="members">Team</TabsTrigger>
        </TabsList>

        <TabsContent value="stages" className="space-y-4">
          <WorkflowCanvas
            stages={stages}
            onSelectStage={setEditorIndex}
            onAddStage={() => {
              const next = [...stages, createEmptyStage(stages.length)];
              markDirty(next);
              setEditorIndex(next.length - 1);
            }}
          />
        </TabsContent>

        <TabsContent value="decisions">
          <DecisionsPanel
            decisions={decisions}
            onCreate={(title, body) =>
              void handleCreateDecision(title, body).catch((error) => {
                toast.error(error instanceof Error ? error.message : "Failed to create decision");
              })
            }
            onUpdate={async (id, title, body) => {
              if (!session) return;
              const updated = await updateDecision(session, projectId, id, { title, body });
              setDecisions((current) => current.map((item) => (item.id === id ? updated : item)));
            }}
            onDelete={async (id) => {
              if (!session) return;
              await deleteDecision(session, projectId, id);
              setDecisions((current) => current.filter((item) => item.id !== id));
              setStages((current) =>
                current.map((stage) => ({
                  ...stage,
                  decisionIds: stage.decisionIds.filter((decisionId) => decisionId !== id),
                })),
              );
              setDirty(true);
            }}
          />
        </TabsContent>

        <TabsContent value="members">
          <MembersPanel
            members={members}
            onCreate={(name) =>
              void handleCreateMember(name).catch((error) => {
                toast.error(error instanceof Error ? error.message : "Failed to create member");
              })
            }
            onToggle={async (member) => {
              if (!session) return;
              const updated = await updateMember(session, projectId, member.id, {
                available: !member.available,
              });
              setMembers((current) => current.map((item) => (item.id === member.id ? updated : item)));
            }}
            onDelete={async (id) => {
              if (!session) return;
              await deleteMember(session, projectId, id);
              setMembers((current) => current.filter((item) => item.id !== id));
            }}
          />
        </TabsContent>
      </Tabs>

      <StageEditorDialog
        open={editorIndex !== null}
        stage={editingStage}
        decisions={decisions}
        onOpenChange={(open) => {
          if (!open) setEditorIndex(null);
        }}
        onSave={(stage) => {
          if (editorIndex === null) return;
          replaceStageAt(editorIndex, stage);
        }}
        onDelete={() => {
          if (editorIndex === null) return;
          removeStageAt(editorIndex);
        }}
      />
    </div>
  );
}

function DecisionsPanel({
  decisions,
  onCreate,
  onUpdate,
  onDelete,
}: {
  decisions: ProjectDecision[];
  onCreate: (title: string, body: string) => void;
  onUpdate: (id: string, title: string, body: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">New decision</CardTitle>
          <CardDescription>Project-level decisions can be linked to stages.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Decision title" />
          <Textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="Details" rows={3} />
          <Button
            onClick={() => {
              onCreate(title, body);
              setTitle("");
              setBody("");
            }}
            disabled={!title.trim()}
          >
            <Plus className="h-4 w-4" />
            Add decision
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {decisions.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No decisions yet.
            </CardContent>
          </Card>
        ) : (
          decisions.map((decision) => (
            <DecisionCard key={decision.id} decision={decision} onUpdate={onUpdate} onDelete={onDelete} />
          ))
        )}
      </div>
    </div>
  );
}

function DecisionCard({
  decision,
  onUpdate,
  onDelete,
}: {
  decision: ProjectDecision;
  onUpdate: (id: string, title: string, body: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [title, setTitle] = useState(decision.title);
  const [body, setBody] = useState(decision.body);
  const [saving, setSaving] = useState(false);

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <Input value={title} onChange={(event) => setTitle(event.target.value)} />
        <Textarea value={body} onChange={(event) => setBody(event.target.value)} rows={3} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => void onDelete(decision.id)}>
            Delete
          </Button>
          <Button
            size="sm"
            disabled={saving}
            onClick={() => {
              setSaving(true);
              void onUpdate(decision.id, title, body).finally(() => setSaving(false));
            }}
          >
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function MembersPanel({
  members,
  onCreate,
  onToggle,
  onDelete,
}: {
  members: ProjectMember[];
  onCreate: (name: string) => void;
  onToggle: (member: ProjectMember) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [name, setName] = useState("");

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Team</CardTitle>
          <CardDescription>Used for auto-assign when a stage has auto-assign enabled.</CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Member name" />
          <Button
            onClick={() => {
              onCreate(name);
              setName("");
            }}
            disabled={!name.trim()}
          >
            Add
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {members.map((member) => (
          <Card key={member.id}>
            <CardContent className="flex items-center justify-between gap-3 pt-6">
              <div className="min-w-0">
                <p className="truncate font-medium">{member.name}</p>
                <p className="text-xs text-muted-foreground">
                  {member.openTasks} open · {member.available ? "Available" : "Busy"}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button variant="outline" size="sm" onClick={() => void onToggle(member)}>
                  {member.available ? "Busy" : "Available"}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => void onDelete(member.id)}>
                  ×
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
