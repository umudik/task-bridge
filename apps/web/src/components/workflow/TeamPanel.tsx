import { useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { AssigneeKind, ProjectMember } from "@/lib/api";
import { useConfirm } from "@/lib/confirm";

type TeamPanelProps = {
  roles: string[];
  members: ProjectMember[];
  onRolesChange: (roles: string[]) => void;
  onCreateMember: (input: { name: string; role: string; actorKind: AssigneeKind }) => Promise<void>;
  onUpdateMember: (
    memberId: string,
    patch: { role?: string; actorKind?: AssigneeKind },
  ) => Promise<void>;
  onDeleteMember: (memberId: string, name: string) => Promise<void>;
};

export function TeamPanel({
  roles,
  members,
  onRolesChange,
  onCreateMember,
  onUpdateMember,
  onDeleteMember,
}: TeamPanelProps) {
  const { confirmDestructive } = useConfirm();
  const [name, setName] = useState("");
  const [roleDraft, setRoleDraft] = useState("");
  const [newMemberRole, setNewMemberRole] = useState("");
  const [newMemberKind, setNewMemberKind] = useState<AssigneeKind>("human");

  function addRole() {
    const draft = roleDraft.trim();
    if (!draft) return;
    if (roles.includes(draft)) {
      toast.error("Role already exists");
      return;
    }
    onRolesChange([...roles, draft]);
    setRoleDraft("");
    if (!newMemberRole) setNewMemberRole(draft);
  }

  function removeRole(role: string) {
    onRolesChange(roles.filter((item) => item !== role));
  }

  async function submitMember() {
    const trimmed = name.trim();
    if (!trimmed || !newMemberRole) return;
    await onCreateMember({ name: trimmed, role: newMemberRole, actorKind: newMemberKind });
    setName("");
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-8 py-5">
      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-white">Project roles</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Roles are project-wide. Stages and task templates pick from this list.
          </p>
        </div>
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="flex flex-wrap gap-2">
              {roles.map((role) => (
                <span
                  key={role}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.1] bg-[#111] px-3 py-1.5 text-sm"
                >
                  {role}
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => removeRole(role)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              ))}
              {roles.length === 0 ? (
                <p className="text-sm text-muted-foreground">No roles yet.</p>
              ) : null}
            </div>
            <div className="flex gap-2">
              <Input
                value={roleDraft}
                onChange={(event) => setRoleDraft(event.target.value)}
                placeholder="New role"
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addRole();
                  }
                }}
              />
              <Button type="button" variant="outline" onClick={addRole}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-white">Members</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Each member has a project role and a kind (human or AI).
          </p>
        </div>
        <Card>
          <CardContent className="flex flex-wrap gap-2 pt-6">
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Member name"
              className="min-w-[10rem] flex-1"
              onKeyDown={(event) => {
                if (event.key === "Enter" && name.trim() && newMemberRole) {
                  event.preventDefault();
                  void submitMember();
                }
              }}
            />
            <Select
              value={newMemberRole}
              disabled={roles.length === 0}
              onChange={(event) => setNewMemberRole(event.target.value)}
              className="h-10 min-w-[8rem]"
            >
              <option value="">Role</option>
              {roles.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </Select>
            <Select
              value={newMemberKind}
              onChange={(event) => setNewMemberKind(event.target.value as AssigneeKind)}
              className="h-10 min-w-[7rem]"
            >
              <option value="human">Human</option>
              <option value="ai">AI</option>
            </Select>
            <Button disabled={!name.trim() || !newMemberRole} onClick={() => void submitMember()}>
              Add
            </Button>
          </CardContent>
        </Card>

        {members.length === 0 ? (
          <p className="text-sm text-muted-foreground">No members yet.</p>
        ) : (
          <div className="space-y-3">
            {members.map((member) => (
              <Card key={member.id}>
                <CardContent className="flex flex-wrap items-center gap-4 pt-6 sm:flex-nowrap">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-white">{member.name}</p>
                    <p className="text-xs text-muted-foreground">{member.openTasks} open tasks</p>
                  </div>
                  <div className="w-full space-y-1.5 sm:w-36">
                    <Label className="text-xs text-muted-foreground">Kind</Label>
                    <Select
                      value={member.actorKind}
                      onChange={(event) =>
                        void onUpdateMember(member.id, {
                          actorKind: event.target.value as AssigneeKind,
                        })
                      }
                    >
                      <option value="human">Human</option>
                      <option value="ai">AI</option>
                    </Select>
                  </div>
                  <div className="w-full space-y-1.5 sm:w-56">
                    <Label className="text-xs text-muted-foreground">Role</Label>
                    <Select
                      value={member.role}
                      disabled={roles.length === 0}
                      onChange={(event) =>
                        void onUpdateMember(member.id, { role: event.target.value })
                      }
                    >
                      {roles.length === 0 ? (
                        <option value={member.role}>{member.role || "—"}</option>
                      ) : (
                        roles.map((role) => (
                          <option key={role} value={role}>
                            {role}
                          </option>
                        ))
                      )}
                    </Select>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 text-destructive hover:text-destructive"
                    onClick={() => {
                      void (async () => {
                        if (!(await confirmDestructive(`Delete member "${member.name}"?`))) {
                          return;
                        }
                        await onDeleteMember(member.id, member.name);
                      })();
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
