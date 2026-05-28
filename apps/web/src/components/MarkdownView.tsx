import { useMemo } from "react";
import { marked } from "marked";
import { cn } from "@/lib/utils";

marked.setOptions({
  gfm: true,
  breaks: true,
});

type MarkdownViewProps = {
  content: string | null | undefined;
  className?: string;
  variant?: "default" | "comment";
};

export function MarkdownView({ content, className, variant = "default" }: MarkdownViewProps) {
  const html = useMemo(() => {
    if (!content?.trim()) return "";
    return marked.parse(content) as string;
  }, [content]);

  if (!html) return null;

  const isComment = variant === "comment";

  return (
    <div
      className={cn(
        "markdown-body w-full max-w-none text-foreground",
        isComment
          ? "text-sm leading-normal [&_h1]:mb-1 [&_h1]:mt-2 [&_h1]:text-sm [&_h1]:font-semibold [&_h2]:mb-1 [&_h2]:mt-2 [&_h2]:text-sm [&_h2]:font-semibold [&_h3]:mb-0.5 [&_h3]:mt-2 [&_h3]:text-sm [&_h3]:font-medium [&_p]:my-1 [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-4 [&_li]:my-0.5"
          : "text-sm leading-relaxed [&_h1]:mb-3 [&_h1]:mt-4 [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:mb-2 [&_h3]:mt-3 [&_h3]:text-sm [&_h3]:font-semibold [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1",
        "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.85em]",
        "[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-muted [&_pre]:p-2 [&_pre]:text-xs",
        className,
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
