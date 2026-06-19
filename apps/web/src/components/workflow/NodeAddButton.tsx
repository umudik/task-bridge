import type { ButtonHTMLAttributes } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type NodeAddButtonProps = {
  title: string;
  onClick: () => void;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "title" | "children">;

export function NodeAddButton({ title, onClick, className, ...props }: NodeAddButtonProps) {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      title={title}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={cn(
        "pointer-events-auto relative z-10 h-7 w-7 shrink-0 rounded-md border-white/[0.12] bg-[#111111] p-0 text-muted-foreground shadow-sm hover:border-primary/40 hover:bg-primary/10 hover:text-primary",
        className,
      )}
      {...props}
    >
      <Plus className="h-3.5 w-3.5" />
    </Button>
  );
}
