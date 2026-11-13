import React from "react";
import Link from "next/link";
import { ChevronRight, Trash2 } from "lucide-react";
import { Claim } from "@/lib/types/database";
import { formatCurrency, formatDate } from "@/lib/utils/formatters";
import { ClaimStatusBadge } from "./ClaimStatusBadge";
import { Button } from "@/components/ui/button";

interface MobileClaimListProps {
  claims: Claim[];
  baseHref?: string;
  showStep?: boolean;
  showFinanceInfo?: boolean;
  onDelete?: (claim: Claim) => void;
  selectedIds?: string[];
  selectableIds?: string[];
  onSelect?: (claimId: string) => void;
}

export function MobileClaimList({
  claims,
  baseHref = "/claims",
  showStep = false,
  showFinanceInfo = false,
  onDelete,
  selectedIds = [],
  selectableIds = [],
  onSelect,
}: MobileClaimListProps) {
  if (!claims.length) return null;

  return (
    <div className="divide-y divide-border xl:hidden">
      {claims.map((claim) => {
        const activeStep = claim.workflow_steps?.find(
          (step) => step.status === "IN_PROGRESS",
        );
        return (
          <article key={claim.id}>
            <Link
              href={`${baseHref}/${claim.id}`}
              className="block space-y-3 p-4 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">
                    {claim.claim_number || "Draft claim"}
                  </p>
                  <p className="mt-1 break-words text-sm text-muted-foreground">
                    {claim.claimant_name ||
                      claim.claimant?.full_name ||
                      "Unknown payee"}
                  </p>
                </div>
                <span className="shrink-0 whitespace-nowrap text-sm font-semibold tabular-nums">
                  {formatCurrency(claim.total_amount)}
                </span>
              </div>
              <p className="line-clamp-2 text-sm">
                {claim.purpose || "No expense details yet"}
              </p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>{claim.ministry?.name || "Team not selected"}</span>
                <time
                  className="whitespace-nowrap"
                  dateTime={
                    claim.claim_date || claim.submitted_at || claim.created_at
                  }
                >
                  {formatDate(
                    claim.claim_date || claim.submitted_at || claim.created_at,
                  )}
                </time>
                <span>
                  {claim.expenses?.length || 0} expense{" "}
                  {claim.expenses?.length === 1 ? "item" : "items"}
                </span>
                {showFinanceInfo && (
                  <span>
                    {claim.payee_payment_method === "JOMPAY"
                      ? "JomPAY"
                      : "Bank Transfer"}
                  </span>
                )}
              </div>
              {claim.disbursement_voucher && (
                <p className="text-xs text-muted-foreground">
                  Voucher {claim.disbursement_voucher}
                </p>
              )}
              <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
                <div className="min-w-0 space-y-1">
                  <ClaimStatusBadge
                    status={claim.status}
                    reimbursementStatus={claim.reimbursement_status}
                  />
                  {showStep && activeStep && (
                    <p className="text-xs text-muted-foreground">
                      {activeStep.step_name}
                    </p>
                  )}
                </div>
                <span className="inline-flex shrink-0 items-center gap-1 text-sm font-medium">
                  View <ChevronRight className="size-4" />
                </span>
              </div>
            </Link>
            {onSelect && selectableIds.includes(claim.id) && (
              <label className="flex min-h-11 cursor-pointer items-center gap-3 border-t border-border px-4 py-3 text-sm">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(claim.id)}
                  onChange={() => onSelect(claim.id)}
                  className="size-4 rounded border-input"
                />{" "}
                Select {claim.claim_number || "claim"} for{" "}
                {claim.payee_payment_method === "JOMPAY"
                  ? "JomPAY"
                  : "Bank Transfer"}{" "}
                batch
              </label>
            )}
            {onDelete &&
              !claim.recurring_schedule_id &&
              (claim.status === "DRAFT" || claim.status === "CANCELLED") && (
                <div className="flex justify-end px-4 pb-3">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => onDelete(claim)}
                    className="min-h-11 gap-2 text-red-700 hover:bg-red-50"
                    aria-label={`Delete ${claim.claim_number || "draft claim"}`}
                  >
                    <Trash2 className="size-4" /> Delete draft
                  </Button>
                </div>
              )}
          </article>
        );
      })}
    </div>
  );
}
