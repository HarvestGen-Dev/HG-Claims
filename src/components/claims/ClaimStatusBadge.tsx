import React from "react";
import { ClaimStatus, ReimbursementStatus } from "@/lib/types/database";
import { STATUS_MAP } from "@/lib/utils/formatters";
import { cn } from "@/lib/utils/cn";

interface ClaimStatusBadgeProps {
  status: ClaimStatus;
  reimbursementStatus?: ReimbursementStatus | null;
  className?: string;
}

const REIMBURSEMENT_BADGE_MAP: Record<
  ReimbursementStatus,
  { label: string; classes: string }
> = {
  ELIGIBLE: {
    label: "Ready for XLS",
    classes: "bg-emerald-50 text-emerald-800 border-emerald-200",
  },
  RESERVED_IN_BATCH: {
    label: "XLS File Created",
    classes: "bg-amber-50 text-amber-800 border-amber-200",
  },
  EXPORTED_PENDING_CONFIRMATION: {
    label: "XLS File Created",
    classes: "bg-amber-50 text-amber-800 border-amber-200",
  },
  SUBMITTED_TO_BANK: {
    label: "XLS File Created",
    classes: "bg-amber-50 text-amber-800 border-amber-200",
  },
  PAID: {
    label: "Disbursed",
    classes: "bg-emerald-50 text-emerald-800 border-emerald-200",
  },
  FAILED: {
    label: "Bank Transfer Failed",
    classes: "bg-rose-50 text-rose-800 border-rose-200",
  },
  RELEASED: {
    label: "Released (Re-queueable)",
    classes: "bg-zinc-100 text-zinc-700 border-zinc-300",
  },
};

export function ClaimStatusBadge({
  status,
  reimbursementStatus,
  className,
}: ClaimStatusBadgeProps) {
  const config = STATUS_MAP[status] || {
    label: status,
    bgClass: "bg-zinc-100 dark:bg-zinc-800",
    textClass: "text-zinc-700 dark:text-zinc-300",
    borderClass: "border-zinc-200 dark:border-zinc-700",
    dotClass: "bg-zinc-400",
  };

  const reimbConfig =
    status === "APPROVED_FOR_PAYMENT" &&
    reimbursementStatus &&
    reimbursementStatus !== "ELIGIBLE"
      ? REIMBURSEMENT_BADGE_MAP[reimbursementStatus]
      : status === "PAID" && reimbursementStatus === "PAID"
      ? REIMBURSEMENT_BADGE_MAP.PAID
      : null;

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium tracking-tight whitespace-nowrap",
          config.bgClass,
          config.textClass,
          config.borderClass,
          className
        )}
      >
        <span
          className={cn("h-1.5 w-1.5 rounded-full shrink-0", config.dotClass)}
        />
        <span>{config.label}</span>
      </span>
      {reimbConfig && (
        <span
          className={cn(
            "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold tracking-tight whitespace-nowrap",
            reimbConfig.classes
          )}
        >
          {reimbConfig.label}
        </span>
      )}
    </span>
  );
}
