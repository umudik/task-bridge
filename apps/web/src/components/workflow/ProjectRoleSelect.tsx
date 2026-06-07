import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type ProjectRoleSelectProps = {
  id?: string;
  label: string;
  value: string;
  roles: string[];
  onChange: (value: string) => void;
  emptyLabel?: string;
};

export function ProjectRoleSelect({
  id,
  label,
  value,
  roles,
  onChange,
  emptyLabel = "Off",
}: ProjectRoleSelectProps) {
  const hasRoles = roles.length > 0;
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        value={value}
        disabled={!hasRoles}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          "h-10 w-full rounded-xl border border-white/[0.1] bg-[#111] px-3 text-sm",
          !hasRoles && "cursor-not-allowed opacity-50",
        )}
      >
        <option value="">{emptyLabel}</option>
        {roles.map((role) => (
          <option key={role} value={role}>
            {role}
          </option>
        ))}
      </select>
      {!hasRoles ? (
        <p className="text-xs text-muted-foreground">Add project roles in the Team tab first.</p>
      ) : null}
    </div>
  );
}
