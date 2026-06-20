import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { AssigneeKind, ProjectMember } from "@/lib/api";
import { useConfirm } from "@/lib/confirm";

type TeamPanelProps = {
  members: ProjectMember[];
  onCreateMember: (input: { name: string; role: string; actorKind: AssigneeKind }) => Promise<void>;
  onUpdateMember: (
    memberId: string,
    patch: { role?: string; actorKind?: AssigneeKind },
  ) => Promise<void>;
  onDeleteMember: (memberId: string, name: string) => Promise<void>;
};

export function TeamPanel({
  members,
  onCreateMember,
  onUpdateMember,
  onDeleteMember,
}: TeamPanelProps) {
  const { confirmDestructive } = useConfirm();
  const [name, setName] = useState("");
  const [newMemberKind, setNewMemberKind] = useState<AssigneeKind>("human");

  async function submitMember() {
    const trimmed = name.trim();
    if (!trimmed) return;
    await onCreateMember({ name: trimmed, role: "", actorKind: newMemberKind });
    setName("");
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-8 py-5">
      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-white">Members</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Anyone on the team can claim and update any task.
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
                if (event.key === "Enter" && name.trim()) {
                  event.preventDefault();
                  void submitMember();
                }
              }}
            />
            <Select
              value={newMemberKind}
              onChange={(event) => setNewMemberKind(event.target.value as AssigneeKind)}
              className="h-10 min-w-[7rem]"
            >
              <option value="human">Human</option>
              <option value="ai">AI</option>
            </Select>
            <Button disabled={!name.trim()} onClick={() => void submitMember()}>
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
