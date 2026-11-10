import { format, parseISO } from "date-fns";
import { ClaimStatus } from "@/lib/types/database";

export function formatCurrency(amount: number | string | null | undefined, currency = "RM"): string {
  if (amount === null || amount === undefined || isNaN(Number(amount))) {
    return `${currency} 0.00`;
  }
  const numericVal = typeof amount === "string" ? parseFloat(amount) : amount;
  return `${currency} ${numericVal.toLocaleString("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatDate(dateString: string | null | undefined, formatPattern = "dd MMM yyyy"): string {
  if (!dateString) return "-";
  try {
    const d = typeof dateString === "string" && dateString.includes("T") ? parseISO(dateString) : new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    return format(d, formatPattern);
  } catch (err) {
    return dateString || "-";
  }
}

export function formatDateTime(dateString: string | null | undefined): string {
  return formatDate(dateString, "dd MMM yyyy, h:mm a");
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export interface StatusConfig {
  label: string;
  variant: "default" | "secondary" | "success" | "warning" | "destructive" | "outline" | "info" | "purple";
  bgClass: string;
  textClass: string;
  borderClass: string;
  dotClass: string;
}

export const STATUS_MAP: Record<ClaimStatus, StatusConfig> = {
  DRAFT: {
    label: "Draft",
    variant: "secondary",
    bgClass: "bg-zinc-100 dark:bg-zinc-800/80",
    textClass: "text-zinc-600 dark:text-zinc-400",
    borderClass: "border-zinc-200/80 dark:border-zinc-700/80",
    dotClass: "bg-zinc-400",
  },
  SUBMITTED: {
    label: "Submitted",
    variant: "info",
    bgClass: "bg-blue-50/70 dark:bg-blue-950/30",
    textClass: "text-blue-700 dark:text-blue-400",
    borderClass: "border-blue-200/60 dark:border-blue-800/50",
    dotClass: "bg-blue-500",
  },
  PENDING_MINISTRY_APPROVAL: {
    label: "Submitted",
    variant: "warning",
    bgClass: "bg-amber-50/80 dark:bg-amber-950/30",
    textClass: "text-amber-800 dark:text-amber-300",
    borderClass: "border-amber-200/70 dark:border-amber-800/50",
    dotClass: "bg-amber-500",
  },
  PENDING_FINANCE_REVIEW: {
    label: "Submitted",
    variant: "purple",
    bgClass: "bg-violet-50/70 dark:bg-violet-950/30",
    textClass: "text-violet-700 dark:text-violet-300",
    borderClass: "border-violet-200/60 dark:border-violet-800/50",
    dotClass: "bg-violet-500",
  },
  PENDING_FINAL_APPROVAL: {
    label: "Submitted",
    variant: "warning",
    bgClass: "bg-indigo-50/70 dark:bg-indigo-950/30",
    textClass: "text-indigo-700 dark:text-indigo-300",
    borderClass: "border-indigo-200/60 dark:border-indigo-800/50",
    dotClass: "bg-indigo-500",
  },
  RETURNED_FOR_CLARIFICATION: {
    label: "Returned",
    variant: "destructive",
    bgClass: "bg-rose-50/80 dark:bg-rose-950/30",
    textClass: "text-rose-700 dark:text-rose-400",
    borderClass: "border-rose-200/70 dark:border-rose-800/50",
    dotClass: "bg-rose-500 animate-pulse",
  },
  REJECTED: {
    label: "Rejected",
    variant: "destructive",
    bgClass: "bg-red-50/60 dark:bg-red-950/30",
    textClass: "text-red-700 dark:text-red-400",
    borderClass: "border-red-200/60 dark:border-red-800/50",
    dotClass: "bg-red-500",
  },
  APPROVED: {
    label: "Approved",
    variant: "success",
    bgClass: "bg-emerald-50/70 dark:bg-emerald-950/30",
    textClass: "text-emerald-700 dark:text-emerald-400",
    borderClass: "border-emerald-200/60 dark:border-emerald-800/50",
    dotClass: "bg-emerald-500",
  },
  APPROVED_FOR_PAYMENT: {
    label: "Approved",
    variant: "success",
    bgClass: "bg-emerald-50/90 dark:bg-emerald-950/40",
    textClass: "text-emerald-800 dark:text-emerald-300",
    borderClass: "border-emerald-200/80 dark:border-emerald-800/60",
    dotClass: "bg-emerald-600",
  },
  PAID: {
    label: "Processed",
    variant: "success",
    bgClass: "bg-emerald-100/60 dark:bg-emerald-900/40",
    textClass: "text-emerald-900 dark:text-emerald-200",
    borderClass: "border-emerald-300/70 dark:border-emerald-700/60",
    dotClass: "bg-emerald-600",
  },
  CANCELLED: {
    label: "Cancelled",
    variant: "secondary",
    bgClass: "bg-zinc-100 dark:bg-zinc-800/60",
    textClass: "text-zinc-500 dark:text-zinc-400",
    borderClass: "border-zinc-200 dark:border-zinc-700",
    dotClass: "bg-zinc-400",
  },
};
