import React from "react";
import { CheckCircle2, Circle, Clock, XCircle, RotateCcw } from "lucide-react";
import { ClaimWorkflowStep, ApprovalAction } from "@/lib/types/database";
import { formatDateTime } from "@/lib/utils/formatters";
import { cn } from "@/lib/utils/cn";

interface ClaimTimelineProps {
  steps: ClaimWorkflowStep[];
  actions?: ApprovalAction[];
  claimStatus: string;
}

export function ClaimTimeline({ steps }: ClaimTimelineProps) {
  if (!steps || steps.length === 0) {
    return (
      <div className="py-4 text-center text-xs text-zinc-400">
        Workflow will be generated upon submission.
      </div>
    );
  }

  const sortedSteps = [...steps].sort((a, b) => a.sequence - b.sequence);

  return (
    <div className="relative pl-5 space-y-4 before:absolute before:left-[9px] before:top-2 before:bottom-2 before:w-[1.5px] before:bg-zinc-200 dark:before:bg-zinc-800">
      {sortedSteps.map((step, idx) => {
        const isCompleted = step.status === "COMPLETED";
        const isInProgress = step.status === "IN_PROGRESS";
        const isReturned = step.status === "RETURNED";
        const isRejected = step.status === "REJECTED";

        return (
          <div key={step.id || idx} className="relative flex items-start gap-3 text-xs">
            {/* Dot / Icon Marker */}
            <div
              className={cn(
                "absolute -left-5 flex h-5 w-5 items-center justify-center rounded-full bg-white dark:bg-zinc-950 ring-3 ring-white dark:ring-zinc-950",
                isCompleted && "text-emerald-700",
                isInProgress && "text-amber-600",
                isReturned && "text-rose-600",
                isRejected && "text-red-600",
                !isCompleted && !isInProgress && !isReturned && !isRejected && "text-zinc-300 dark:text-zinc-700"
              )}
            >
              {isCompleted && <CheckCircle2 className="w-4 h-4" />}
              {isInProgress && <Clock className="w-4 h-4 animate-spin-slow" />}
              {isReturned && <RotateCcw className="w-4 h-4" />}
              {isRejected && <XCircle className="w-4 h-4" />}
              {!isCompleted && !isInProgress && !isReturned && !isRejected && <Circle className="w-3 h-3" />}
            </div>

            {/* Step Content */}
            <div className="flex-1 rounded-lg border border-zinc-200/80 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900/40 shadow-2xs">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] text-zinc-400 font-semibold">0{step.sequence}</span>
                  <h4 className="font-medium text-zinc-900 dark:text-zinc-100 text-xs">
                    {step.step_name}
                  </h4>
                </div>
                <span
                  className={cn(
                    "text-[10px] font-medium px-1.5 py-0.5 rounded",
                    isCompleted && "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
                    isInProgress && "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
                    isReturned && "bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300",
                    isRejected && "bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300",
                    !isCompleted && !isInProgress && !isReturned && !isRejected && "bg-zinc-100 text-zinc-500 dark:bg-zinc-800"
                  )}
                >
                  {step.status.replace(/_/g, " ")}
                </span>
              </div>

              <div className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                {step.assigned_user ? (
                  <span>Assigned: <strong className="text-zinc-700 dark:text-zinc-300">{step.assigned_user.full_name}</strong></span>
                ) : (
                  <span>Role: <strong className="text-zinc-700 dark:text-zinc-300">{step.approver_role.replace(/_/g, " ")}</strong></span>
                )}

                {step.completed_at && (
                  <span className="font-mono text-[10px] text-zinc-400">
                    {formatDateTime(step.completed_at)} • {step.completed_by_user?.full_name || "Approver"}
                  </span>
                )}
              </div>

              {step.comments && (
                <div className="mt-2 rounded bg-zinc-50 p-2 text-xs text-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-300 border border-zinc-100 dark:border-zinc-800/80">
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">Note: </span>
                  {step.comments}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
