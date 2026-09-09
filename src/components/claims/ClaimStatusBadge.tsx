import React from "react";
import { ClaimStatus } from "@/lib/types/database";
import { STATUS_MAP } from "@/lib/utils/formatters";
import { cn } from "@/lib/utils/cn";

interface ClaimStatusBadgeProps {
  status: ClaimStatus;
  className?: string;
}

export function ClaimStatusBadge({ status, className }: ClaimStatusBadgeProps) {
  const config = STATUS_MAP[status] || {
    label: status,
    bgClass: "bg-zinc-100 dark:bg-zinc-800",
    textClass: "text-zinc-700 dark:text-zinc-300",
    borderClass: "border-zinc-200 dark:border-zinc-700",
    dotClass: "bg-zinc-400",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium tracking-tight whitespace-nowrap",
        config.bgClass,
        config.textClass,
        config.borderClass,
        className
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", config.dotClass)} />
      <span>{config.label}</span>
    </span>
  );
}
