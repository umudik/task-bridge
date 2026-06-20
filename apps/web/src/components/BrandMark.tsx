import { Link, useLocation } from "react-router-dom";
import { Link2, Radio } from "lucide-react";
import { cn } from "@/lib/utils";

type BrandMarkProps = {
  className: string | null;
  compact: boolean;
  linkTo: string | null;
};

export function BrandMark(rawProps: Partial<BrandMarkProps> = {}) {
  let className: string | null = null;
  if ("className" in rawProps) {
    if (rawProps.className === null) {
      className = null;
    } else if (typeof rawProps.className === "string") {
      className = rawProps.className;
    }
  }
  let compact = false;
  if ("compact" in rawProps && rawProps.compact === true) {
    compact = true;
  }
  let linkTo: string | null = "/projects";
  if ("linkTo" in rawProps) {
    if (rawProps.linkTo === null) {
      linkTo = null;
    } else if (typeof rawProps.linkTo === "string") {
      linkTo = rawProps.linkTo;
    }
  }

  const location = useLocation();
  const href = linkTo;
  const inner = (
    <>
      <div
        className={cn(
          "relative flex shrink-0 items-center justify-center rounded-lg bg-primary/15 ring-1 ring-primary/25",
          compact ? "h-8 w-8" : "h-10 w-10",
        )}
      >
        <Link2 className={cn("text-primary", compact ? "h-4 w-4" : "h-5 w-5")} />
        <Radio
          className={cn(
            "absolute rounded-full bg-card p-0.5 text-primary",
            compact ? "-bottom-0.5 -right-0.5 h-3 w-3" : "-bottom-1 -right-1 h-4 w-4",
          )}
        />
      </div>
      <div className="min-w-0">
        <p className={cn("font-semibold tracking-tight", compact ? "text-sm" : "text-base")}>Task Bridge</p>
        {compact ? <p className="text-[10px] text-muted-foreground">v0.1</p> : null}
      </div>
    </>
  );

  if (!href) {
    return <div className={cn("flex items-center gap-2.5", className)}>{inner}</div>;
  }

  let linkState: { from: string } | null = null;
  if (location.pathname.startsWith("/projects/")) {
    linkState = { from: location.pathname };
  }

  return (
    <Link
      to={href}
      state={linkState}
      className={cn(
        "flex items-center gap-2.5 rounded-lg transition-colors hover:bg-white/[0.04]",
        compact ? "-mx-1 px-1 py-0.5" : "px-1 py-0.5",
        className,
      )}
    >
      {inner}
    </Link>
  );
}
