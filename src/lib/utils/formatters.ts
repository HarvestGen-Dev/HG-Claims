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
}

export const STATUS_MAP: Record<ClaimStatus, StatusConfig> = {
  DRAFT: {
    label: "Draft",
    variant: "secondary",
    bgClass: "bg-slate-100 dark:bg-slate-800",
    textClass: "text-slate-700 dark:text-slate-300",
    borderClass: "border-slate-300 dark:border-slate-700",
  },
  SUBMITTED: {
    label: "Submitted",
    variant: "info",
    bgClass: "bg-sky-50 dark:bg-sky-950/40",
    textClass: "text-sky-700 dark:text-sky-400",
    borderClass: "border-sky-200 dark:border-sky-800",
  },
  PENDING_MINISTRY_APPROVAL: {
    label: "Pending Leader Approval",
    variant: "warning",
    bgClass: "bg-amber-50 dark:bg-amber-950/40",
    textClass: "text-amber-800 dark:text-amber-400",
    borderClass: "border-amber-200 dark:border-amber-800",
  },
  PENDING_FINANCE_REVIEW: {
    label: "Pending Finance Review",
    variant: "purple",
    bgClass: "bg-indigo-50 dark:bg-indigo-950/40",
    textClass: "text-indigo-700 dark:text-indigo-400",
    borderClass: "border-indigo-200 dark:border-indigo-800",
  },
  PENDING_FINAL_APPROVAL: {
    label: "Pending Final Approval",
    variant: "warning",
    bgClass: "bg-purple-50 dark:bg-purple-950/40",
    textClass: "text-purple-700 dark:text-purple-400",
    borderClass: "border-purple-200 dark:border-purple-800",
  },
  RETURNED_FOR_CLARIFICATION: {
    label: "Returned for Clarification",
    variant: "destructive",
    bgClass: "bg-rose-50 dark:bg-rose-950/40",
    textClass: "text-rose-700 dark:text-rose-400",
    borderClass: "border-rose-200 dark:border-rose-800",
  },
  REJECTED: {
    label: "Rejected",
    variant: "destructive",
    bgClass: "bg-red-100 dark:bg-red-950/60",
    textClass: "text-red-800 dark:text-red-300",
    borderClass: "border-red-300 dark:border-red-800",
  },
  APPROVED: {
    label: "Approved",
    variant: "success",
    bgClass: "bg-emerald-50 dark:bg-emerald-950/40",
    textClass: "text-emerald-700 dark:text-emerald-400",
    borderClass: "border-emerald-200 dark:border-emerald-800",
  },
  APPROVED_FOR_PAYMENT: {
    label: "Approved for Payment",
    variant: "success",
    bgClass: "bg-teal-50 dark:bg-teal-950/40",
    textClass: "text-teal-700 dark:text-teal-400",
    borderClass: "border-teal-200 dark:border-teal-800",
  },
  PAID: {
    label: "Paid",
    variant: "success",
    bgClass: "bg-emerald-100 dark:bg-emerald-900/60",
    textClass: "text-emerald-900 dark:text-emerald-200",
    borderClass: "border-emerald-300 dark:border-emerald-700",
  },
  CANCELLED: {
    label: "Cancelled",
    variant: "secondary",
    bgClass: "bg-gray-100 dark:bg-gray-800",
    textClass: "text-gray-600 dark:text-gray-400",
    borderClass: "border-gray-300 dark:border-gray-700",
  },
};
