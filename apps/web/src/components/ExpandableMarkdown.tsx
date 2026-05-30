import { useLayoutEffect, useRef, useState } from "react";
import { MarkdownView } from "@/components/MarkdownView";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ExpandableMarkdownProps = {
  content: string;
  collapsedMaxHeight?: number;
  className?: string;
};

export function ExpandableMarkdown({
  content,
  collapsedMaxHeight = 168,
  className,
}: ExpandableMarkdownProps) {
  const [expanded, setExpanded] = useState(false);
  const [canExpand, setCanExpand] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const node = bodyRef.current;
    if (!node) return;
    setCanExpand(node.scrollHeight > collapsedMaxHeight + 1);
  }, [content, collapsedMaxHeight]);

  return (
    <div className={className}>
      <div
        ref={bodyRef}
        className={cn(!expanded && canExpand && "overflow-hidden")}
        style={!expanded && canExpand ? { maxHeight: collapsedMaxHeight } : undefined}
      >
        <MarkdownView content={content} />
      </div>
      {canExpand ? (
        <Button
          type="button"
          variant="link"
          className="mt-1 h-auto px-0 text-sm"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "Show less" : "Show more"}
        </Button>
      ) : null}
    </div>
  );
}
