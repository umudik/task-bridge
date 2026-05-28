import { Link2, Radio } from "lucide-react";
import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-primary/15 ring-1 ring-primary/30">
        <Link2 className="h-5 w-5 text-primary" />
        <Radio className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-card p-0.5 text-primary" />
      </div>
      <div>
        <p className="text-lg font-semibold tracking-tight">Task Bridge</p>
      </div>
    </div>
  );
}
