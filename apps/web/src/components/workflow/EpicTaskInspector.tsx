import { Link } from "react-router-dom";
import { ExternalLink, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { ProjectMember, TaskSubtask, WorkStatus } from "@/lib/api";

type EpicTaskInspectorProps = {
  projectId: string;
  epicId: number;
  subtasks: TaskSubtask[];
  selected: TaskSubtask | null;
  humanMembers: ProjectMember[];
  actAsMemberId: string;
  updatingStatus: boolean;
  claiming: boolean;
  onActAsMemberChange: (memberId: string) => void;
  onClose: () => void;
  onClaim: (taskId: number) => void;
  onStatusChange: (taskId: number, status: WorkStatus) => void;
};

function parentBlocksAdvance(selected: TaskSubtask, epicId: number, subtasks: TaskSubtask[]) {
  if (!selected.parentId || selected.parentId === epicId) return false;
  const parent = subtasks.find((entry) => entry.taskId === selected.parentId);
  return parent ? !parent.done : false;
}

const STATUS_OPTIONS: { value: WorkStatus; label: string }[] = [
  { value: "todo", label: "Todo" },
  { value: "in_progress", label: "In progress" },
  { value: "done", label: "Done" },
];

export function EpicTaskInspector({
  projectId,
  epicId,
  subtasks,
  selected,
  humanMembers,
  actAsMemberId,
  updatingStatus,
  claiming,
  onActAsMemberChange,
  onClose,
  onClaim,
  onStatusChange,
}: EpicTaskInspectorProps) {
  const blockedByParent = selected ? parentBlocksAdvance(selected, epicId, subtasks) : false;
  const actAs = humanMembers.find((member) => member.id === actAsMemberId) ?? null;
  const isHumanTask = selected?.assigneeKind === "human";
  const isAiTask = selected?.assigneeKind === "ai";
  const claimedBy = selected?.claimedBy ?? null;
  const claimedByActAs = actAs ? claimedBy === actAs.name : false;
  const needsClaim = Boolean(isHumanTask && selected && !claimedBy);
  const canUpdateStatus =
    selected &&
    !blockedByParent &&
    !isAiTask &&
    (!isHumanTask || (claimedByActAs && actAs));

  return (
    <aside className="flex w-[340px] shrink-0 flex-col border-l border-white/[0.06] bg-[#0c0c0c]">
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">
          {selected ? "Task" : "Details"}
        </p>
        {selected ? (
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        ) : null}
      </div>

      {selected ? (
        <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-4 py-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold leading-snug text-white">{selected.title}</h2>
              {isHumanTask ? (
                <span className="rounded-full border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-300">
                  Human
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Step: {selected.stageTitle ?? selected.stageId ?? "—"}
              {selected.templateId ? null : " · Ad-hoc"}
            </p>
            {claimedBy ? (
              <p className="mt-1 text-xs text-muted-foreground">Claimed by {claimedBy}</p>
            ) : null}
          </div>

          {isHumanTask ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Act as</Label>
                <select
                  value={actAsMemberId}
                  onChange={(event) => onActAsMemberChange(event.target.value)}
                  className="h-10 w-full rounded-xl border border-white/[0.1] bg-[#111] px-3 text-sm"
                  disabled={humanMembers.length === 0}
                >
                  {humanMembers.length === 0 ? (
                    <option value="">Add a human member on Pipeline → Team</option>
                  ) : (
                    humanMembers.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name}
                        {member.role ? ` (${member.role})` : ""}
                      </option>
                    ))
                  )}
                </select>
              </div>
              {needsClaim ? (
                <Button
                  type="button"
                  size="sm"
                  className="w-full"
                  disabled={claiming || !actAs}
                  onClick={() => onClaim(selected.taskId)}
                >
                  {claiming ? "Claiming…" : "Take task"}
                </Button>
              ) : null}
              {claimedBy && !claimedByActAs ? (
                <p className="text-xs text-amber-400/90">
                  Claimed by {claimedBy}. Only they can update status.
                </p>
              ) : null}
              {needsClaim ? (
                <p className="text-xs text-muted-foreground">
                  Human tasks must be claimed before moving to in progress or done.
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-2">
            <p className="text-xs font-medium text-foreground">Work status</p>
            {blockedByParent ? (
              <p className="text-xs text-amber-400/90">Parent task must be done first.</p>
            ) : null}
            <div className="grid grid-cols-1 gap-2">
              {STATUS_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  size="sm"
                  variant={selected.workStatus === option.value ? "default" : "outline"}
                  disabled={
                    updatingStatus ||
                    !canUpdateStatus ||
                    (blockedByParent && option.value !== "todo" && selected.workStatus !== option.value)
                  }
                  className={cn(
                    "justify-start",
                    selected.workStatus === option.value && option.value === "done" && "bg-emerald-600 hover:bg-emerald-600/90",
                    selected.workStatus === option.value && option.value === "in_progress" && "bg-yellow-600 hover:bg-yellow-600/90",
                    selected.workStatus === option.value && option.value === "todo" && "bg-zinc-600 hover:bg-zinc-600/90",
                  )}
                  onClick={() => onStatusChange(selected.taskId, option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>

          <Button type="button" variant="outline" size="sm" asChild className="w-full justify-start">
            <Link to={`/projects/${projectId}/tasks/${selected.taskId}`}>
              <ExternalLink className="mr-2 h-4 w-4" />
              Open task page
            </Link>
          </Button>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-8 text-center">
          <p className="text-sm text-muted-foreground">
            Select a task on the canvas to view and update its status.
          </p>
          <p className="text-xs text-muted-foreground/70">
            Use the <span className="font-medium text-foreground">+ Task</span> button under any step to add one.
          </p>
        </div>
      )}
    </aside>
  );
}
