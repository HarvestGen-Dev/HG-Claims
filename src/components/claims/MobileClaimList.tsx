import React from "react";
import Link from "next/link";
import { ShieldCheck, Clock, Trash2 } from "lucide-react";
import { Claim } from "@/lib/types/database";
import { formatCurrency, formatDate } from "@/lib/utils/formatters";
import { ClaimStatusBadge } from "./ClaimStatusBadge";

interface MobileClaimListProps {
  claims: Claim[];
  baseHref?: string;
  showStep?: boolean;
  showFinanceInfo?: boolean;
  onDelete?: (claim: Claim) => void;
}

export function MobileClaimList({
  claims,
  baseHref = "/claims",
  showStep = false,
  showFinanceInfo = false,
  onDelete,
}: MobileClaimListProps) {
  if (!claims || claims.length === 0) return null;

  return (
    <div className="sm:hidden divide-y divide-zinc-200/80 dark:divide-zinc-800">
      {claims.map((claim) => {
        const activeStep = claim.workflow_steps?.find((s) => s.status === "IN_PROGRESS");
        const targetHref = `${baseHref}/${claim.id}`;

        return (
          <Link
            key={claim.id}
            href={targetHref}
            className="block p-3.5 hover:bg-zinc-50 dark:hover:bg-zinc-900 active:bg-zinc-100/70 transition-colors touch-manipulation"
          >
            <div className="flex items-start justify-between gap-2.5">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-mono text-xs font-bold text-zinc-900 dark:text-zinc-100">
                    {claim.claim_number || "DRAFT"}
                  </span>
                  <span className="text-[10px] text-zinc-400">&bull;</span>
                  <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 truncate">
                    {claim.claimant_name || claim.claimant?.full_name || "Unknown"}
                  </span>
                </div>
                <p className="text-xs text-zinc-600 dark:text-zinc-400 line-clamp-1 mt-0.5">
                  {claim.purpose}
                </p>
              </div>

              <div className="text-right shrink-0">
                <span className="text-sm font-mono font-bold text-zinc-900 dark:text-zinc-100 tabular-nums whitespace-nowrap block">
                  {formatCurrency(claim.total_amount)}
                </span>
                <span className="text-[10px] text-zinc-400 font-mono">
                  {claim.expenses?.length || 0} receipt{(claim.expenses?.length || 0) === 1 ? "" : "s"}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] text-zinc-500 font-mono mt-2 pt-2 border-t border-zinc-100 dark:border-zinc-850">
              <span className="truncate max-w-[180px]">
                {claim.ministry?.name || "Church"} &middot; {formatDate(claim.claim_date || claim.submitted_at || claim.created_at)}
              </span>

              <div className="flex items-center gap-2">
                {showStep && activeStep ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-800 border border-amber-200/70 dark:bg-amber-950/30 dark:text-amber-300">
                    <Clock className="w-2.5 h-2.5" />
                    {activeStep.step_name}
                  </span>
                ) : (
                  <ClaimStatusBadge
                    status={claim.status}
                    reimbursementStatus={claim.reimbursement_status}
                  />
                )}

                {onDelete && (claim.status === "DRAFT" || claim.status === "CANCELLED") && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onDelete(claim);
                    }}
                    className="p-1 rounded text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                    title="Delete Draft"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
