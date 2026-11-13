"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

export function Dialog({ open, onOpenChange, children }: DialogProps) {
  const panel = React.useRef<HTMLDivElement>(null);
  const close = React.useRef(onOpenChange);
  close.current = onOpenChange;
  const titleId = React.useId();
  React.useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        (event.target instanceof Element && event.target.closest("[data-themed-select-content]"))
      ) return;
      if (event.key === "Escape") close.current(false);
      if (event.key !== "Tab") return;
      const elements = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]') || []).filter(element => element.tabIndex >= 0 && element.getClientRects().length);
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (!first) { event.preventDefault(); return; }
      const focusOutsideControls = document.activeElement === panel.current || !panel.current?.contains(document.activeElement);
      if (event.shiftKey && (document.activeElement === first || focusOutsideControls)) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || focusOutsideControls)) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener("keydown", keydown);
    return () => { document.body.style.overflow = overflow; document.removeEventListener("keydown", keydown); previous?.focus(); };
  }, [open]);
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <div
        className="fixed inset-0 bg-zinc-950/45 transition-opacity"
        onClick={() => onOpenChange(false)}
      />
      <div ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId} className="relative z-50 w-full max-w-lg max-h-[calc(100dvh-1.5rem)] overflow-y-auto overscroll-contain rounded-xl border border-border bg-card p-4 sm:max-h-[88dvh] text-card-foreground shadow-xl sm:p-6">
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="absolute right-3 top-3 sm:right-4 sm:top-4 p-1 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center touch-manipulation"
          aria-label="Close dialog"
        >
          <X className="h-5 w-5" />
          <span className="sr-only">Close</span>
        </button>
        <DialogTitleContext.Provider value={titleId}>{children}</DialogTitleContext.Provider>
      </div>
    </div>
  );
}

const DialogTitleContext = React.createContext<string | undefined>(undefined);

export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col space-y-1.5 text-left mb-4", className)} {...props} />;
}

export function DialogTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  const id = React.useContext(DialogTitleContext);
  return <h2 id={id} className={cn("text-xl font-semibold leading-snug pr-9 text-foreground", className)} {...props} />;
}

export function DialogDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-muted-foreground", className)} {...props} />;
}

export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mt-6 flex flex-wrap justify-end gap-2", className)} {...props} />;
}
