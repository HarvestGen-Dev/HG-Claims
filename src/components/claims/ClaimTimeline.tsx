import React from "react";
import { CheckCircle2, Circle, Clock, AlertCircle, XCircle, RotateCcw } from "lucide-react";
import { ClaimWorkflowStep, ApprovalAction } from "@/lib/types/database";
import { formatDateTime } from "@/lib/utils/formatters";
import { cn } from "@/lib/utils/cn";

interface ClaimTimelineProps {
  steps: ClaimWorkflowStep[];
  actions?: ApprovalAction[];
  claimStatus: string;
}

export function ClaimTimeline({ steps, actions, claimStatus }: ClaimTimelineProps) {
  if (!steps || steps.length === 0) {
    return (
      <div className="py-4 text-center text-xs text-slate-500">
        Workflow will be generated automatically upon submission.
      </div>
    );
  }

  const sortedSteps = [...steps].sort((a, b) => a.sequence - b.sequence);

  return (
    <div className="space-y-6">
      <div className="relative pl-6 space-y-6 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-[2px] before:bg-slate-200 dark:before:bg-slate-800">
        {sortedSteps.map((step, idx) => {
          const isCompleted = step.status === "COMPLETED";
          const isInProgress = step.status === "IN_PROGRESS";
          const isReturned = step.status === "RETURNED";
          const isRejected = step.status === "REJECTED";

          return (
            <div key={step.id || idx} className="relative flex items-start gap-3">
              {/* Icon Marker */}
              <div
                className={cn(
                  "absolute -left-6 flex h-6 w-6 items-center justify-center rounded-full bg-white dark:bg-slate-900 ring-4 ring-white dark:ring-slate-900",
                  isCompleted && "text-emerald-700",
                  isInProgress && "text-amber-700 animate-pulse",
                  isReturned && "text-rose-700",
                  isRejected && "text-red-700",
                  !isCompleted && !isInProgress && !isReturned && !isRejected && "text-slate-300"
                )}
              >
                {isCompleted && <CheckCircle2 className="w-5 h-5 fill-emerald-100 dark:fill-emerald-950" />}
                {isInProgress && <Clock className="w-5 h-5 fill-amber-100 dark:fill-amber-950" />}
                {isReturned && <RotateCcw className="w-5 h-5 fill-rose-100 dark:fill-rose-950" />}
                {isRejected && <XCircle className="w-5 h-5 fill-red-100 dark:fill-red-950" />}
                {!isCompleted && !isInProgress && !isReturned && !isRejected && <Circle className="w-4 h-4" />}
              </div>

              {/* Step Details */}
              <div className="flex-1 rounded-xl border border-slate-200 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-500">Step {step.sequence}</span>
                    <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {step.step_name}
                    </h4>
                  </div>
                  <span
                    className={cn(
                      "text-[11px] font-semibold px-2 py-0.5 rounded-md",
                      isCompleted && "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
                      isInProgress && "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
                      isReturned && "bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300",
                      isRejected && "bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300",
                      !isCompleted && !isInProgress && !isReturned && !isRejected && "bg-slate-100 text-slate-500"
                    )}
                  >
                    {step.status.replace(/_/g, " ")}
                  </span>
                </div>

                <div className="mt-2 text-xs text-slate-600 dark:text-slate-400 flex flex-wrap items-center gap-x-4 gap-y-1">
                  {step.assigned_user ? (
                    <span>Assigned: <strong className="text-slate-800 dark:text-slate-200">{step.assigned_user.full_name}</strong></span>
                  ) : (
                    <span>Role: <strong className="text-slate-800 dark:text-slate-200">{step.approver_role.replace(/_/g, " ")}</strong></span>
                  )}

                  {step.completed_at && (
                    <span>Completed: <strong>{formatDateTime(step.completed_at)}</strong> by <strong>{step.completed_by_user?.full_name || "Approver"}</strong></span>
                  )}
                </div>

                {step.comments && (
                  <div className="mt-2.5 rounded-lg bg-slate-50 p-2.5 text-xs text-slate-700 dark:bg-slate-800/60 dark:text-slate-300 border border-slate-100 dark:border-slate-800">
                    <span className="font-semibold text-slate-900 dark:text-slate-100">Comment: </span>
                    {step.comments}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
