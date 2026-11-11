"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Search, ArrowRight, Inbox } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { ClaimLink } from "@/components/claims/ClaimLink";
import { ClaimStatusBadge } from "@/components/claims/ClaimStatusBadge";
import { MobileClaimList } from "@/components/claims/MobileClaimList";
import { canUserApproveClaim } from "@/lib/auth/permissions";
import { useAuth } from "@/lib/auth/context";
import { claimsClient, workspaceStore } from "@/lib/domains";
import { Claim } from "@/lib/types/database";
import { formatCurrency, formatDate } from "@/lib/utils/formatters";
import { calculateTotalAmount } from "@/lib/utils/calculations";

export default function ApprovalsInboxPage() {
  const { user } = useAuth();
  const [claims, setClaims] = useState<Claim[]>([]);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"pending" | "history" | "team">(
    "pending",
  );

  useEffect(() => {
    if (!user) return;
    setClaims(claimsClient.getClaims(user));
    return workspaceStore.subscribeDomains(
      ["claims", "master-data", "iam"],
      () => {
        setClaims(claimsClient.getClaims(user));
      },
    );
  }, [user]);

  const pendingApprovals = claims.filter((c) => canUserApproveClaim(user, c));

  const reviewedHistory = claims.filter((c) =>
    (c.approval_actions || []).some(
      (a) => a.actor_id === user?.id && a.action !== "SUBMIT",
    ),
  );

  const displayedList = (
    activeTab === "pending"
      ? pendingApprovals
      : activeTab === "team"
        ? claims.filter(
            (c) =>
              c.ministry?.team_lead_ids?.includes(user?.id || "") &&
              c.status !== "DRAFT",
          )
        : reviewedHistory
  ).filter((c) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (c.claim_number && c.claim_number.toLowerCase().includes(q)) ||
      (c.claimant_name && c.claimant_name.toLowerCase().includes(q)) ||
      (c.claimant?.full_name &&
        c.claimant.full_name.toLowerCase().includes(q)) ||
      (c.submitted_by?.full_name &&
        c.submitted_by.full_name.toLowerCase().includes(q)) ||
      c.purpose.toLowerCase().includes(q) ||
      (c.ministry?.name && c.ministry.name.toLowerCase().includes(q))
    );
  });

  const totalPendingAmount = calculateTotalAmount(
    pendingApprovals.map((c) => ({ amount: c.total_amount })),
  );

  return (
    <AppLayout>
      <div className="claim-page mx-auto w-full max-w-6xl space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-zinc-200/80 dark:border-zinc-800">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
              Pending Approval
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Review claims awaiting your decision and track claims from your
              teams.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-zinc-100 dark:bg-zinc-900 px-3 py-1.5 text-xs text-zinc-600 dark:text-zinc-400">
              <span>Pending Total: </span>
              <strong className="text-zinc-900 dark:text-zinc-100 font-mono font-bold ml-1">
                {formatCurrency(totalPendingAmount)}
              </strong>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div role="group" aria-label="Approval views" className="claim-tabs">
            <button
              type="button"
              aria-pressed={activeTab === "pending"}
              onClick={() => setActiveTab("pending")}
            >
              Needs Approval ({pendingApprovals.length})
            </button>
            <button
              type="button"
              aria-pressed={activeTab === "team"}
              onClick={() => setActiveTab("team")}
            >
              Team claims
            </button>
            <button
              type="button"
              aria-pressed={activeTab === "history"}
              onClick={() => setActiveTab("history")}
            >
              Reviewed History ({reviewedHistory.length})
            </button>
          </div>
          <div className="relative w-full sm:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              aria-label="Search approval claims"
              placeholder="Claim number, payee, team or purpose"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-11 w-full rounded-lg border border-input bg-card pl-10 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </div>

        {/* Approval Items Table */}
        <div className="rounded-xl border border-zinc-200/80 bg-white dark:border-zinc-800 dark:bg-zinc-950 shadow-2xs overflow-hidden">
          {displayedList.length === 0 ? (
            <div className="py-16 text-center space-y-2.5">
              <Inbox className="w-8 h-8 text-zinc-300 mx-auto" />
              <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                {search.trim()
                  ? "No claims match your search."
                  : activeTab === "pending"
                    ? "No claims waiting for approval."
                    : activeTab === "team"
                      ? "No submitted claims for your teams yet."
                      : "No review history yet."}
              </p>
              <p className="text-[11px] text-zinc-400">
                Claims for your assigned teams appear here automatically.
              </p>
            </div>
          ) : (
            <>
              <MobileClaimList
                claims={displayedList}
                baseHref="/approvals"
                showStep={true}
              />
              <div className="hidden xl:block overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-zinc-50/50 border-b border-zinc-100 dark:bg-zinc-900/50 dark:border-zinc-800 text-zinc-400 text-[10px] font-semibold uppercase tracking-wider">
                      <th className="py-2.5 px-4">Claim #</th>
                      <th className="py-2.5 px-4">Claimant</th>
                      <th className="py-2.5 px-4">Team & Purpose</th>
                      <th className="py-2.5 px-4">Submitted</th>
                      <th className="py-2.5 px-4 text-right">Amount</th>
                      <th className="py-2.5 px-4 text-center">Status</th>
                      <th className="py-2.5 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
                    {(displayedList || []).map((c) => {
                      const activeStep = c.workflow_steps?.find(
                        (s) => s.status === "IN_PROGRESS",
                      );
                      return (
                        <tr
                          key={c.id}
                          className="hover:bg-zinc-50/70 dark:hover:bg-zinc-900/50 transition-colors"
                        >
                          <td className="py-3 px-4 font-mono font-medium text-zinc-900 dark:text-zinc-100">
                            <Link
                              href={`/approvals/${c.id}`}
                              className="hover:underline hover:text-emerald-700 dark:hover:text-emerald-400"
                            >
                              {c.claim_number}
                            </Link>
                          </td>
                          <td className="py-3 px-4">
                            <span className="font-medium text-zinc-800 dark:text-zinc-200 block">
                              {c.claimant_name || c.claimant?.full_name}
                            </span>
                            <span className="mt-1 block text-xs text-muted-foreground">
                              Submitted by {c.submitted_by?.full_name || "-"}
                            </span>
                          </td>
                          <td className="py-3 px-4 max-w-xs">
                            <span className="font-medium text-zinc-800 dark:text-zinc-200 block line-clamp-2">
                              {c.purpose}
                            </span>
                            <span className="mt-1 block text-xs text-muted-foreground">
                              {c.ministry?.name}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-zinc-500 font-mono text-[11px]">
                            {formatDate(c.submitted_at)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums">
                            {formatCurrency(c.total_amount)}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <ClaimStatusBadge
                              status={c.status}
                              reimbursementStatus={c.reimbursement_status}
                            />
                            {activeStep && (
                              <p className="mt-1 text-xs text-muted-foreground">
                                {activeStep.step_name}
                              </p>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <ClaimLink
                              href={`/approvals/${c.id}`}
                              variant={
                                activeTab === "pending" ? "default" : "outline"
                              }
                            >
                              {activeTab === "pending" ? "Review" : "View"}
                              <ArrowRight className="size-4" />
                            </ClaimLink>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
