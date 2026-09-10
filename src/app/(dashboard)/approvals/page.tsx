"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  CheckSquare,
  Search,
  ArrowRight,
  Inbox
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/context";
import { db } from "@/lib/data/repository";
import { Claim } from "@/lib/types/database";
import { formatCurrency, formatDate } from "@/lib/utils/formatters";

export default function ApprovalsInboxPage() {
  const { user } = useAuth();
  const [claims, setClaims] = useState<Claim[]>([]);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"pending" | "history">("pending");

  useEffect(() => {
    if (!user) return;
    setClaims(db.getClaims(user));
  }, [user]);

  const pendingApprovals = claims.filter(c => {
    if (c.submitted_by_user_id === user?.id || c.claimant_id === user?.id) return false;
    const currentStep = c.workflow_steps?.find(s => s.status === "IN_PROGRESS");
    if (!currentStep) return false;

    if (user?.roles?.includes("SYSTEM_ADMIN")) return true;
    if (user?.roles?.includes("FINANCE_OFFICER") && currentStep.approver_role === "FINANCE_OFFICER") return true;

    return false;
  });

  const reviewedHistory = claims.filter(c =>
    (c.approval_actions || []).some(a => a.actor_id === user?.id && a.action !== "SUBMIT")
  );

  const displayedList = (activeTab === "pending" ? pendingApprovals : reviewedHistory).filter(c => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (c.claim_number && c.claim_number.toLowerCase().includes(q)) ||
      (c.claimant_name && c.claimant_name.toLowerCase().includes(q)) ||
      (c.claimant?.full_name && c.claimant.full_name.toLowerCase().includes(q)) ||
      (c.submitted_by?.full_name && c.submitted_by.full_name.toLowerCase().includes(q)) ||
      c.purpose.toLowerCase().includes(q) ||
      (c.ministry?.name && c.ministry.name.toLowerCase().includes(q))
    );
  });

  const totalPendingAmount = pendingApprovals.reduce((sum, c) => sum + Number(c.total_amount), 0);

  return (
    <AppLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-2 border-b border-zinc-200/80 dark:border-zinc-800">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
              Approvals Inbox
            </h1>
            <p className="text-xs text-zinc-500">
              Review and endorse ministry expense claims assigned to your role.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-zinc-100 dark:bg-zinc-900 px-3 py-1.5 text-xs text-zinc-600 dark:text-zinc-400">
              <span>Pending Total: </span>
              <strong className="text-zinc-900 dark:text-zinc-100 font-mono font-bold ml-1">{formatCurrency(totalPendingAmount)}</strong>
            </div>
          </div>
        </div>

        {/* Tab Switcher & Search Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-1 p-1 rounded-lg bg-zinc-100 dark:bg-zinc-900">
            <button
              onClick={() => setActiveTab("pending")}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                activeTab === "pending"
                  ? "bg-white text-zinc-900 shadow-2xs font-semibold dark:bg-zinc-800 dark:text-zinc-100"
                  : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400"
              }`}
            >
              <span>Needs Approval</span>
              {pendingApprovals.length > 0 && (
                <span className="px-1.5 py-0.2 text-[10px] font-semibold tabular-nums rounded bg-rose-500 text-white">
                  {pendingApprovals.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab("history")}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                activeTab === "history"
                  ? "bg-white text-zinc-900 shadow-2xs font-semibold dark:bg-zinc-800 dark:text-zinc-100"
                  : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400"
              }`}
            >
              Reviewed History ({reviewedHistory.length})
            </button>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-zinc-400" />
            <input
              type="text"
              placeholder="Search claimant, claim #..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-7 w-full pl-8 pr-2.5 text-xs rounded-lg border border-zinc-200 bg-zinc-50/70 focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:border-zinc-800 dark:bg-zinc-900"
            />
          </div>
        </div>

        {/* Approval Items Table */}
        <div className="rounded-xl border border-zinc-200/80 bg-white dark:border-zinc-800 dark:bg-zinc-950 shadow-2xs overflow-hidden">
          {displayedList.length === 0 ? (
            <div className="py-16 text-center space-y-2.5">
              <Inbox className="w-8 h-8 text-zinc-300 mx-auto" />
              <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                {activeTab === "pending" ? "All caught up! No claims waiting for approval." : "No review history yet."}
              </p>
              <p className="text-[11px] text-zinc-400">New submissions for your ministry will appear here automatically.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-zinc-50/50 border-b border-zinc-100 dark:bg-zinc-900/50 dark:border-zinc-800 text-zinc-400 text-[10px] font-semibold uppercase tracking-wider">
                    <th className="py-2.5 px-4">Claim #</th>
                    <th className="py-2.5 px-4">Claimant</th>
                    <th className="py-2.5 px-4">Submitter</th>
                    <th className="py-2.5 px-4">Ministry</th>
                    <th className="py-2.5 px-4">Purpose</th>
                    <th className="py-2.5 px-4">Submitted</th>
                    <th className="py-2.5 px-4 text-right">Amount (RM)</th>
                    <th className="py-2.5 px-4 text-center">Step</th>
                    <th className="py-2.5 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
                  {displayedList.map((c) => {
                    const activeStep = c.workflow_steps?.find(s => s.status === "IN_PROGRESS");
                    return (
                      <tr key={c.id} className="hover:bg-zinc-50/70 dark:hover:bg-zinc-900/50 transition-colors">
                        <td className="py-3 px-4 font-mono font-medium text-zinc-900 dark:text-zinc-100">
                          <Link href={`/approvals/${c.id}`} className="hover:underline hover:text-emerald-700 dark:hover:text-emerald-400">
                            {c.claim_number}
                          </Link>
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-medium text-zinc-800 dark:text-zinc-200 block">{c.claimant_name || c.claimant?.full_name}</span>
                          <span className="text-[10px] text-zinc-400">{c.claimant_email || c.claimant?.email}</span>
                        </td>
                        <td className="py-3 px-4 text-zinc-600 dark:text-zinc-400">
                          {c.submitted_by?.full_name || "-"}
                        </td>
                        <td className="py-3 px-4 text-zinc-600 dark:text-zinc-400">{c.ministry?.name}</td>
                        <td className="py-3 px-4 max-w-xs">
                          <span className="font-medium text-zinc-800 dark:text-zinc-200 block truncate">{c.purpose}</span>
                        </td>
                        <td className="py-3 px-4 text-zinc-500 font-mono text-[11px]">{formatDate(c.submitted_at)}</td>
                        <td className="py-3 px-4 text-right font-mono font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums">
                          {formatCurrency(c.total_amount)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className="inline-block px-2 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-800 border border-amber-200/70 dark:bg-amber-950/30 dark:text-amber-300">
                            {activeStep?.step_name || c.status.replace(/_/g, " ")}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <Link href={`/approvals/${c.id}`}>
                            <Button size="sm" className="h-7 text-xs bg-emerald-700 hover:bg-emerald-800 text-white gap-1 shadow-2xs font-medium px-2.5">
                              <span>Review</span>
                              <ArrowRight className="w-3 h-3" />
                            </Button>
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
