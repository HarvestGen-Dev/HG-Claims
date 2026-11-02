import React from "react";
import { cn } from "@/lib/utils/cn";

export function BrandLogo({
  className,
  compact = false,
}: {
  className?: string;
  priority?: boolean;
  compact?: boolean;
}) {
  return (
    <div
      role="img"
      aria-label="Harvest Generation"
      className={cn("inline-flex items-center gap-2.5 shrink-0 select-none", className)}
    >
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-900 text-white font-bold text-xs tracking-tight shadow-2xs dark:bg-zinc-100 dark:text-zinc-900 shrink-0">
        HG
      </span>
      {!compact && (
        <span className="font-bold text-sm tracking-tight text-zinc-900 dark:text-zinc-100 leading-tight">
          Harvest Generation
        </span>
      )}
    </div>
  );
}
