import { createContext, useCallback, useContext, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type ConfirmOptions = {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
};

type ConfirmContextValue = {
  confirmDestructive: (message: string, options?: Omit<ConfirmOptions, "message">) => Promise<boolean>;
};

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function ConfirmDialogProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions>({ message: "" });
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirmDestructive = useCallback(
    (message: string, extra?: Omit<ConfirmOptions, "message">) => {
      return new Promise<boolean>((resolve) => {
        resolveRef.current = resolve;
        setOptions({ message, ...extra });
        setOpen(true);
      });
    },
    [],
  );

  function finish(result: boolean) {
    setOpen(false);
    resolveRef.current?.(result);
    resolveRef.current = null;
  }

  return (
    <ConfirmContext.Provider value={{ confirmDestructive }}>
      {children}
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) finish(false);
        }}
      >
        <DialogContent className="max-w-md border-white/[0.1] bg-[#111] sm:rounded-xl [&>button]:hidden">
          <DialogHeader>
            <DialogTitle>{options.title ?? "Delete?"}</DialogTitle>
            <DialogDescription>{options.message}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={() => finish(false)}>
              {options.cancelLabel ?? "Cancel"}
            </Button>
            <Button type="button" variant="destructive" onClick={() => finish(true)}>
              {options.confirmLabel ?? "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error("useConfirm must be used within ConfirmDialogProvider");
  }
  return context;
}
