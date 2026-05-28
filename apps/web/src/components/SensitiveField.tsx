import { useState } from "react";
import { Copy, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SensitiveField({
  label,
  value,
  onCopy,
}: {
  label: string;
  value: string;
  onCopy?: () => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const hidden = value !== "—" && !revealed;

  return (
    <div className="rounded-lg border bg-background/60 p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-1 flex items-start justify-between gap-2">
        <div className="relative min-w-0 flex-1 overflow-hidden rounded-md">
          {revealed ? (
            <code className="break-all text-xs text-foreground">{value}</code>
          ) : (
            <code
              className={cn(
                "block break-all text-xs text-foreground",
                hidden && "select-none blur-lg brightness-75",
              )}
            >
              {hidden ? "████████████████" : value}
            </code>
          )}
          {hidden ? (
            <div className="pointer-events-none absolute inset-0 bg-background/60 backdrop-blur-sm" />
          ) : null}
        </div>
        <div className="flex shrink-0 gap-1">
          {value !== "—" ? (
            <Button variant="ghost" size="icon" onClick={() => setRevealed((current) => !current)}>
              {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          ) : null}
          {onCopy && revealed ? (
            <Button variant="ghost" size="icon" onClick={onCopy}>
              <Copy className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function SensitiveReveal({
  children,
  label = "Show",
}: {
  children: React.ReactNode;
  label?: string;
}) {
  const [revealed, setRevealed] = useState(false);

  if (revealed) return <>{children}</>;

  return (
    <div className="relative flex h-[272px] w-[272px] items-center justify-center overflow-hidden rounded-xl border bg-muted/30">
      <div className="absolute inset-0 scale-110 bg-gradient-to-br from-muted via-muted-foreground/20 to-muted blur-2xl" />
      <div className="absolute inset-0 bg-background/70 backdrop-blur-xl" />
      <Button variant="secondary" className="relative z-10" onClick={() => setRevealed(true)}>
        <Eye className="h-4 w-4" />
        {label}
      </Button>
    </div>
  );
}
