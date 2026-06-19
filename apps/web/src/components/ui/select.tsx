import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(({ className, style, ...props }, ref) => (
  <div className="relative">
    <select
      ref={ref}
      style={{ colorScheme: "dark", ...style }}
      className={cn(
        "flex h-10 w-full appearance-none rounded-xl border border-white/[0.1] bg-[#111111] px-3 py-2 pr-9 text-sm text-foreground ring-offset-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-black disabled:cursor-not-allowed disabled:opacity-50 [&>option]:bg-[#111111] [&>option]:text-foreground",
        className,
      )}
      {...props}
    />
    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
  </div>
));
Select.displayName = "Select";

export { Select };
