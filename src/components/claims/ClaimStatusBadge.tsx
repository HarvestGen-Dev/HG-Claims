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
    bgClass: "bg-slate-100",
    textClass: "text-slate-800",
    borderClass: "border-slate-300",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold tracking-tight shadow-2xs",
        config.bgClass,
        config.textClass,
        config.borderClass,
        className
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-75" />
      {config.label}
    </span>
  );
}
