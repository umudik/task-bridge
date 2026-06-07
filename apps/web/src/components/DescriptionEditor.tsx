import { useState } from "react";
import { MarkdownView } from "@/components/MarkdownView";
import { cn } from "@/lib/utils";

type DescriptionEditorProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minRows?: number;
  className?: string;
};

export function DescriptionEditor({
  value,
  onChange,
  placeholder = "Write in markdown…",
  minRows = 10,
  className,
}: DescriptionEditorProps) {
  const [mode, setMode] = useState<"write" | "preview">("write");
  const trimmed = value.trim();

  return (
    <div className={cn("overflow-hidden rounded-lg border border-white/[0.08] bg-[#0f0f0f]", className)}>
      <div className="flex items-center justify-between border-b border-white/[0.06] px-2 py-1.5">
        <div className="flex gap-0.5">
          <TabButton active={mode === "write"} onClick={() => setMode("write")}>
            Write
          </TabButton>
          <TabButton active={mode === "preview"} onClick={() => setMode("preview")}>
            Preview
          </TabButton>
        </div>
        <span className="text-[10px] text-muted-foreground">Markdown</span>
      </div>
      {mode === "write" ? (
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          rows={minRows}
          className="w-full resize-y border-0 bg-transparent px-3 py-2.5 text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/60"
        />
      ) : (
        <div className="min-h-[8rem] px-3 py-2.5">
          {trimmed ? (
            <MarkdownView content={value} />
          ) : (
            <p className="text-sm italic text-muted-foreground">Nothing to preview yet.</p>
          )}
        </div>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors",
        active
          ? "bg-white/[0.08] text-foreground"
          : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
