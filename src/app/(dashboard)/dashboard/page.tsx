"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  Plus,
  FileText,
  Clock,
  RotateCcw,
  CheckCircle2,
  Banknote,
  ArrowUpRight,
  Search,
  AlertCircle
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ClaimStatusBadge } from "@/components/claims/ClaimStatusBadge";
import { MobileClaimList } from "@/components/claims/MobileClaimList";
import { useAuth } from "@/lib/auth/context";
import { claimsClient, masterDataClient, workspaceStore } from "@/lib/domains";
import { Claim, Ministry } from "@/lib/types/database";
import { formatCurrency, formatDate } from "@/lib/utils/formatters";
import { moneyToCents } from "@/lib/utils/calculations";

export default function DashboardPage() {
  const { user, canCreateClaim, hasRole } = useAuth();
  const [claims, setClaims] = useState<Claim[]>([]);
  const [ministries, setMinistries] = useState<Ministry[]>(masterDataClient.getMinistries());
  const [search, setSearch] = useState("");
  const isFinanceOrAdmin = hasRole("FINANCE_OFFICER") || hasRole("SYSTEM_ADMIN");

  useEffect(() => {
    if (!user) return;
    setClaims(claimsClient.getClaims(user));
    setMinistries(masterDataClient.getMinistries());
    return workspaceStore.subscribeDomains(["claims", "master-data", "iam"], () => {
      setClaims(claimsClient.getClaims(user));
      setMinistries(masterDataClient.getMinistries());
    });
  }, [user]);

  const currentCalendarYear = new Date().getFullYear();
  const visibleBudgetMinistries = useMemo(() => {
    if (isFinanceOrAdmin) {
      return ministries.filter((m) => m.is_active && (m.budgets?.length || m.team_lead_ids?.length));
    }
    return hasRole("TEAM_LEAD") ? ministries.filter((m) => m.is_active && m.team_lead_ids?.includes(user?.id || "")) : [];
  }, [ministries, isFinanceOrAdmin, user, hasRole]);

  // Memoize user's claims and single-pass status aggregations
  const {
    myClaims,
    draftCount,
    pendingCount,
    returnedCount,
    approvedCount,
    paidCount,
    totalPaidAmount,
    approverActionCount,
    awaitingPayoutCount,
  } = useMemo(() => {
    const mine = claims.filter(c => (c.submitted_by_user_id || c.claimant_id) === user?.id);
    let drafts = 0;
    let pending = 0;
    let returned = 0;
    let approved = 0;
    let paid = 0;
    let paidAmount = 0;
    let approverNeedsAction = 0;
    let awaitingPayout = 0;

    for (const c of mine) {
      if (c.status === "DRAFT") drafts++;
      else if (c.status.startsWith("PENDING_") || c.status === "SUBMITTED") pending++;
      else if (c.status === "RETURNED_FOR_CLARIFICATION") returned++;
      else if (c.status === "APPROVED" || c.status === "APPROVED_FOR_PAYMENT") approved++;
      else if (c.status === "PAID") {
        paid++;
        paidAmount += moneyToCents(c.total_amount) ?? 0;
      }
    }

    if (isFinanceOrAdmin) {
      for (const c of claims) {
        if (c.status === "PENDING_FINANCE_REVIEW") {
          approverNeedsAction++;
        } else if (c.status === "APPROVED_FOR_PAYMENT") {
          awaitingPayout++;
        }
      }
    }

    return {
      myClaims: mine,
      draftCount: drafts,
      pendingCount: pending,
      returnedCount: returned,
      approvedCount: approved,
      paidCount: paid,
      totalPaidAmount: paidAmount / 100,
      approverActionCount: approverNeedsAction,
      awaitingPayoutCount: awaitingPayout,
    };
  }, [claims, user?.id, isFinanceOrAdmin]);

  const filteredRecent = useMemo(() => {
    const trimmed = search.trim().toLowerCase();
    if (!trimmed) return myClaims.slice(0, 8);
    return myClaims
      .filter(c =>
        (c.claim_number && c.claim_number.toLowerCase().includes(trimmed)) ||
        (c.claimant_name && c.claimant_name.toLowerCase().includes(trimmed)) ||
        (c.claimant?.full_name && c.claimant.full_name.toLowerCase().includes(trimmed)) ||
        (c.submitted_by?.full_name && c.submitted_by.full_name.toLowerCase().includes(trimmed)) ||
        c.purpose.toLowerCase().includes(trimmed) ||
        (c.ministry?.name && c.ministry.name.toLowerCase().includes(trimmed))
      )
      .slice(0, 8);
  }, [myClaims, search]);

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
              My Overview
            </h1>
            <p className="text-xs text-zinc-500 mt-0.5">
              Track your claims and their current status.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            {canCreateClaim() && <Link href="/claims/new">
              <Button size="sm" className="bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-medium shadow-2xs gap-1.5 h-8">
                <Plus className="w-3.5 h-3.5" />
                <span>Submit Claim</span>
              </Button>
            </Link>}
          </div>
        </div>

        {/* Action Required: Returned for Clarification */}
        {returnedCount > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-rose-50/70 border border-rose-200/80 text-rose-950 dark:bg-rose-950/20 dark:border-rose-900/50">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-rose-100 dark:bg-rose-900/50 text-rose-700 dark:text-rose-300 flex items-center justify-center shrink-0">
                <RotateCcw className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-semibold text-rose-900 dark:text-rose-200">
                  {returnedCount} claim{returnedCount > 1 ? "s" : ""} returned for clarification
                </p>
                <p className="text-[11px] text-rose-700 dark:text-rose-400">
                  An approver requested notes or updated receipts before approving.
                </p>
              </div>
            </div>
            <Link href="/claims?status=RETURNED_FOR_CLARIFICATION" className="self-start sm:self-auto">
              <Button size="sm" variant="outline" className="h-7 text-xs bg-white text-rose-700 border-rose-200 hover:bg-rose-50 dark:bg-zinc-900 dark:border-rose-900">
                Review Claims
              </Button>
            </Link>
          </div>
        )}

        {/* Role Action Queue: Finance & Approvals */}
        {isFinanceOrAdmin && (approverActionCount > 0 || awaitingPayoutCount > 0) && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-amber-50/60 border border-amber-200/80 text-amber-950 dark:bg-amber-950/20 dark:border-amber-900/50">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300 flex items-center justify-center shrink-0">
                <Banknote className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                  Finance &amp; Approval Queue: {approverActionCount} awaiting approval, {awaitingPayoutCount} ready for reimbursement
                </p>
                <p className="text-[11px] text-zinc-600 dark:text-zinc-400">
                  Verify receipts, approve submitted ministry claims, or prepare an Alliance Bank .xls batch.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {approverActionCount > 0 && (
                <Link href="/approvals">
                  <Button size="sm" className="h-7 text-xs bg-zinc-900 hover:bg-zinc-800 text-white">
                    Review Approvals ({approverActionCount})
                  </Button>
                </Link>
              )}
              {awaitingPayoutCount > 0 && (
                <Link href="/finance/batches">
                  <Button size="sm" variant="outline" className="h-7 text-xs bg-white border-zinc-200 text-zinc-800 hover:bg-zinc-50">
                    Prepare Bank Batch ({awaitingPayoutCount})
                  </Button>
                </Link>
              )}
            </div>
          </div>
        )}

        {/* Summary Stat Cards */}
        <div className="claim-summary grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <Link href="/claims?status=DRAFT" className="group">
            <div className="p-3.5 rounded-xl border border-zinc-200/80 bg-white hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900/80 transition-all shadow-2xs">
              <div className="flex items-center justify-between text-zinc-400 mb-1.5">
                <span className="text-[11px] font-medium tracking-wide text-zinc-500">Drafts</span>
                <span className="h-1.5 w-1.5 rounded-full bg-zinc-300 group-hover:bg-zinc-500 transition-colors" />
              </div>
              <p className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 tabular-nums">{draftCount}</p>
              <span className="text-[10px] text-zinc-400 block mt-0.5">Unsubmitted</span>
            </div>
          </Link>

          <Link href="/claims?status=IN_REVIEW" className="group">
            <div className="p-3.5 rounded-xl border border-zinc-200/80 bg-white hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900/80 transition-all shadow-2xs">
              <div className="flex items-center justify-between text-zinc-400 mb-1.5">
                <span className="text-[11px] font-medium tracking-wide text-zinc-500">In Review</span>
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
              </div>
              <p className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 tabular-nums">{pendingCount}</p>
              <span className="text-[10px] text-zinc-400 block mt-0.5">Awaiting approvals</span>
            </div>
          </Link>

          <Link href="/claims?status=RETURNED_FOR_CLARIFICATION" className="group">
            <div className="p-3.5 rounded-xl border border-zinc-200/80 bg-white hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900/80 transition-all shadow-2xs">
              <div className="flex items-center justify-between text-zinc-400 mb-1.5">
                <span className="text-[11px] font-medium tracking-wide text-zinc-500">Returned</span>
                <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
              </div>
              <p className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 tabular-nums">{returnedCount}</p>
              <span className="text-[10px] text-zinc-400 block mt-0.5">Action required</span>
            </div>
          </Link>

          <Link href="/claims?status=APPROVED" className="group">
            <div className="p-3.5 rounded-xl border border-zinc-200/80 bg-white hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900/80 transition-all shadow-2xs">
              <div className="flex items-center justify-between text-zinc-400 mb-1.5">
                <span className="text-[11px] font-medium tracking-wide text-zinc-500">Approved</span>
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              </div>
              <p className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 tabular-nums">{approvedCount}</p>
              <span className="text-[10px] text-zinc-400 block mt-0.5">Queued for payment</span>
            </div>
          </Link>

          <Link href="/claims?status=PAID" className="group col-span-2 sm:col-span-1">
            <div className="p-3.5 rounded-xl border border-zinc-200/80 bg-white hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900/80 transition-all shadow-2xs">
              <div className="flex items-center justify-between text-zinc-400 mb-1.5">
                <span className="text-[11px] font-medium tracking-wide text-zinc-500">Processed</span>
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
              </div>
              <p className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 tabular-nums">{paidCount}</p>
              <span className="text-[10px] font-medium text-emerald-700 dark:text-emerald-400 block mt-0.5 font-mono">{formatCurrency(totalPaidAmount)}</span>
            </div>
          </Link>
        </div>

        {/* Ministry Budgets Overview (For Team Leads & Finance/Admin) */}
        {visibleBudgetMinistries.length > 0 && (
          <div className="rounded-xl border border-zinc-200/80 bg-white dark:border-zinc-800 dark:bg-zinc-950 p-4 shadow-2xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                  <Banknote className="w-4 h-4 text-emerald-600" />
                  <span>Team annual budgets ({currentCalendarYear})</span>
                </h2>
                <p className="text-[11px] text-zinc-500">
                  Track annual spending against claims dated within calendar year {currentCalendarYear}.
                </p>
              </div>
              {isFinanceOrAdmin && (
                <Link href="/admin/ministries">
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                    Manage Budgets
                  </Button>
                </Link>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {visibleBudgetMinistries.map((m) => {
                const b = (m.budgets || []).find((b) => b.year === currentCalendarYear);
                const ministryClaims = claims.filter(
                  (c) =>
                    c.ministry_id === m.id &&
                    c.status !== "REJECTED" &&
                    c.status !== "CANCELLED" &&
                    c.status !== "DRAFT" &&
                    c.claim_date &&
                    new Date(c.claim_date).getFullYear() === currentCalendarYear
                );
                const spent = ministryClaims.reduce(
                  (sum, c) => sum + (Number(c.total_amount) || 0),
                  0
                );
                const budgetAmount = b ? Number(b.amount) : 0;
                const remaining = budgetAmount - spent;
                const pct = budgetAmount > 0 ? Math.min(100, Math.round((spent / budgetAmount) * 100)) : null;

                return (
                  <div
                    key={m.id}
                    className="p-3 rounded-lg border border-zinc-200/70 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/40 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-1">
                      <div>
                        <div className="font-semibold text-xs text-zinc-900 dark:text-zinc-100">
                          {m.name}
                        </div>
                        <span className="font-mono text-[10px] font-bold text-zinc-500">
                          {m.code}
                        </span>
                      </div>
                      <span className="font-mono text-xs font-bold text-zinc-900 dark:text-zinc-100">
                        {budgetAmount > 0 ? formatCurrency(budgetAmount) : "No budget set"}
                      </span>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px] text-zinc-500">
                        <span>Spent: {formatCurrency(spent)}</span>
                        {budgetAmount > 0 && (
                          <span className={remaining < 0 ? "text-red-600 font-semibold" : "text-emerald-700"}>
                            Remaining: {formatCurrency(remaining)}
                          </span>
                        )}
                      </div>
                      {pct !== null ? (
                        <div className="w-full bg-zinc-200 dark:bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                          <div
                            className={`h-1.5 rounded-full ${
                              pct > 90 ? "bg-red-500" : pct > 75 ? "bg-amber-500" : "bg-emerald-500"
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Recent Claims Section */}
        <div className="rounded-xl border border-zinc-200/80 bg-white dark:border-zinc-800 dark:bg-zinc-950 shadow-2xs overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 border-b border-zinc-100 dark:border-zinc-800">
            <div>
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Recent Claims
              </h2>
              <p className="text-[11px] text-zinc-400">
                Your submitted and draft expense reimbursement records.
              </p>
            </div>

            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              <div className="relative min-w-0 flex-1 sm:flex-none">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none w-3.5 h-3.5 text-zinc-400" />
                <input
                  type="text"
                  aria-label="Filter recent claims"
                  placeholder="Filter claims..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-10 w-full sm:w-40 pl-7 pr-2.5 text-sm rounded-lg border border-zinc-200 bg-zinc-50/70 focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:border-zinc-800 dark:bg-zinc-900"
                />
              </div>
              <Link href="/claims" className="self-start sm:self-auto">
                <Button variant="ghost" size="sm" className="h-7 text-xs text-zinc-600 hover:text-zinc-900 gap-1 px-2">
                  <span>View All</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </Button>
              </Link>
            </div>
          </div>

          <div>
            {filteredRecent.length === 0 ? (
              <div className="py-12 text-center space-y-2.5">
                <FileText className="w-8 h-8 text-zinc-300 mx-auto" />
                <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">No claims found</p>
                <p className="text-[11px] text-zinc-400">Submit a new expense claim to get started.</p>
                {canCreateClaim() && <Link href="/claims/new" className="inline-block mt-2">
                  <Button size="sm" className="bg-zinc-900 hover:bg-zinc-800 text-white text-xs h-7">
                    Submit Claim
                  </Button>
                </Link>}
              </div>
            ) : (
              <><MobileClaimList claims={filteredRecent} /><div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-zinc-50/50 border-b border-zinc-100 dark:bg-zinc-900/50 dark:border-zinc-800 text-zinc-400 text-[10px] font-semibold uppercase tracking-wider">
                      <th className="py-2.5 px-4">Claim #</th>
                      <th className="py-2.5 px-4">Claimant</th>
                      <th className="py-2.5 px-4">Date</th>
                      <th className="py-2.5 px-4">Team & Purpose</th>
                      <th className="py-2.5 px-4 text-right">Amount (RM)</th>
                      <th className="py-2.5 px-4 text-center">Status</th>
                      <th className="py-2.5 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
                    {(filteredRecent || []).map((c) => (
                      <tr key={c.id} className="hover:bg-zinc-50/70 dark:hover:bg-zinc-900/50 transition-colors">
                        <td className="py-3 px-4 font-mono font-medium text-zinc-900 dark:text-zinc-100">
                          <Link href={`/claims/${c.id}`} className="hover:underline hover:text-zinc-700 dark:hover:text-zinc-300">
                            {c.claim_number || "DRAFT"}
                          </Link>
                        </td>
                        <td className="py-3 px-4 font-medium text-zinc-800 dark:text-zinc-200">
                          {c.claimant_name || c.claimant?.full_name || "-"}
                        </td>
                        <td className="py-3 px-4 text-zinc-500 font-mono text-[11px]">{formatDate(c.claim_date)}</td>
                        <td className="py-3 px-4 max-w-xs">
                          <span className="font-medium text-zinc-800 dark:text-zinc-200 block truncate">{c.purpose}</span>
                          <span className="text-[10px] text-zinc-400">{c.ministry?.name}</span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums">
                          {formatCurrency(c.total_amount)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <ClaimStatusBadge status={c.status} />
                        </td>
                        <td className="py-3 px-4 text-right">
                          <Link href={`/claims/${c.id}`}>
                            <Button variant="ghost" size="sm" className="h-7 text-xs text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 px-2.5">
                              View
                            </Button>
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div></>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
