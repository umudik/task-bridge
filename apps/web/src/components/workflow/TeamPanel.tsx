import { useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ProjectMember } from "@/lib/api";
import { useConfirm } from "@/lib/confirm";

type TeamPanelProps = {
  roles: string[];
  members: ProjectMember[];
  onRolesChange: (roles: string[]) => void;
  onCreateMember: (name: string) => Promise<void>;
  onUpdateMember: (memberId: string, patch: { role?: string }) => Promise<void>;
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

  function addRole() {
    const draft = roleDraft.trim();
    if (!draft) return;
    if (roles.includes(draft)) {
      toast.error("Role already exists");
      return;
    }
    onRolesChange([...roles, draft]);
    setRoleDraft("");
  }

  function removeRole(role: string) {
    onRolesChange(roles.filter((item) => item !== role));
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
          <p className="mt-1 text-sm text-muted-foreground">Assign one project role per member.</p>
        </div>
        <Card>
          <CardContent className="flex gap-2 pt-6">
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Member name"
              onKeyDown={(event) => {
                if (event.key === "Enter" && name.trim()) {
                  event.preventDefault();
                  void onCreateMember(name.trim()).then(() => setName(""));
                }
              }}
            />
            <Button
              disabled={!name.trim()}
              onClick={() => void onCreateMember(name.trim()).then(() => setName(""))}
            >
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
                  <div className="w-full space-y-1.5 sm:w-56">
                    <Label className="text-xs text-muted-foreground">Role</Label>
                    <select
                      value={member.role ?? ""}
                      disabled={roles.length === 0}
                      onChange={(event) =>
                        void onUpdateMember(member.id, { role: event.target.value || undefined })
                      }
                      className="h-10 w-full rounded-xl border border-white/[0.1] bg-[#111] px-3 text-sm"
                    >
                      <option value="">—</option>
                      {roles.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
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
