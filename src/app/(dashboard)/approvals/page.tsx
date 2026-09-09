"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { 
  CheckSquare, 
  Clock, 
  Search, 
  Filter, 
  User, 
  ArrowRight, 
  Building2, 
  Calendar,
  AlertCircle,
  CheckCircle2,
  Inbox
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ClaimStatusBadge } from "@/components/claims/ClaimStatusBadge";
import { useAuth } from "@/lib/auth/context";
import { db } from "@/lib/mock-db/repository";
import { Claim } from "@/lib/types/database";
import { formatCurrency, formatDate } from "@/lib/utils/formatters";

export default function ApprovalsInboxPage() {
  const { user, canApprove } = useAuth();
  const [claims, setClaims] = useState<Claim[]>([]);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"pending" | "history">("pending");

  useEffect(() => {
    if (!user) return;
    setClaims(db.getClaims(user));
  }, [user]);

  // Filter claims that strictly need current user's approval
  const pendingApprovals = claims.filter(c => {
    if (c.claimant_id === user?.id) return false; // Never approve own claim
    const currentStep = c.workflow_steps?.find(s => s.status === "IN_PROGRESS");
    if (!currentStep) return false;

    if (user?.roles?.includes("SYSTEM_ADMIN")) return true;
    if (currentStep.assigned_user_id === user?.id) return true;
    if (currentStep.approver_role === "MINISTRY_LEADER" && user?.roles?.includes("MINISTRY_LEADER")) return true;
    if (currentStep.approver_role === "FINAL_APPROVER" && user?.roles?.includes("FINAL_APPROVER")) return true;

    return false;
  });

  // History reviewed by current user
  const reviewedHistory = claims.filter(c => 
    (c.approval_actions || []).some(a => a.actor_id === user?.id && a.action !== "SUBMIT")
  );

  const displayedList = (activeTab === "pending" ? pendingApprovals : reviewedHistory).filter(c => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (c.claim_number && c.claim_number.toLowerCase().includes(q)) ||
      c.claimant?.full_name.toLowerCase().includes(q) ||
      c.programme_event.toLowerCase().includes(q) ||
      c.ministry?.name.toLowerCase().includes(q)
    );
  });

  const totalPendingAmount = pendingApprovals.reduce((sum, c) => sum + Number(c.total_amount), 0);

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
              <CheckSquare className="w-7 h-7 text-emerald-700" />
              Approvals Inbox
            </h1>
            <p className="text-xs text-slate-500">
              Review and endorse ministry expenses assigned to your leadership role.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-emerald-50 px-4 py-2 border border-emerald-200 text-xs">
              <span className="text-emerald-800 font-semibold">Pending Endorsements: </span>
              <strong className="text-emerald-950 font-black ml-1">{formatCurrency(totalPendingAmount)}</strong>
            </div>
          </div>
        </div>

        {/* Tab Switcher & Search Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab("pending")}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                activeTab === "pending"
                  ? "bg-emerald-700 text-white shadow-xs"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <span>Needs Your Approval</span>
              {pendingApprovals.length > 0 && (
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  activeTab === "pending" ? "bg-white text-emerald-800" : "bg-red-500 text-white"
                }`}>
                  {pendingApprovals.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab("history")}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                activeTab === "history"
                  ? "bg-emerald-700 text-white shadow-xs"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              Recently Reviewed ({reviewedHistory.length})
            </button>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search by claimant, claim #..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-full pl-9 pr-3 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>

        {/* Approval Items Table Card */}
        <Card>
          <CardContent className="p-0">
            {displayedList.length === 0 ? (
              <div className="py-16 text-center space-y-3">
                <Inbox className="w-12 h-12 text-slate-300 mx-auto" />
                <p className="text-sm font-semibold text-slate-700">
                  {activeTab === "pending" ? "All caught up! No claims waiting for your approval." : "No review history yet."}
                </p>
                <p className="text-xs text-slate-400">New submissions for your ministry will appear here automatically.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50/75 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
                      <th className="py-3 px-4">Claim #</th>
                      <th className="py-3 px-4">Claimant</th>
                      <th className="py-3 px-4">Ministry</th>
                      <th className="py-3 px-4">Programme / Purpose</th>
                      <th className="py-3 px-4">Submitted</th>
                      <th className="py-3 px-4 text-right">Amount (RM)</th>
                      <th className="py-3 px-4 text-center">Current Step</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {displayedList.map((c) => {
                      const activeStep = c.workflow_steps?.find(s => s.status === "IN_PROGRESS");
                      return (
                        <tr key={c.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-3.5 px-4 font-bold text-slate-900">
                            <Link href={`/approvals/${c.id}`} className="hover:text-emerald-700 hover:underline">
                              {c.claim_number}
                            </Link>
                          </td>
                          <td className="py-3.5 px-4">
                            <span className="font-semibold text-slate-800 block">{c.claimant?.full_name}</span>
                            <span className="text-[10px] text-slate-400">{c.claimant?.email}</span>
                          </td>
                          <td className="py-3.5 px-4 font-medium text-slate-700">{c.ministry?.name}</td>
                          <td className="py-3.5 px-4 max-w-xs">
                            <span className="font-semibold text-slate-800 block truncate">{c.programme_event}</span>
                            <span className="text-[10px] text-slate-500 truncate block">{c.purpose}</span>
                          </td>
                          <td className="py-3.5 px-4 text-slate-500">{formatDate(c.submitted_at)}</td>
                          <td className="py-3.5 px-4 text-right font-black text-slate-900">
                            {formatCurrency(c.total_amount)}
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <span className="inline-block px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-bold">
                              {activeStep?.step_name || c.status.replace(/_/g, " ")}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <Link href={`/approvals/${c.id}`}>
                              <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs gap-1 shadow-2xs">
                                <span>Review</span>
                                <ArrowRight className="w-3.5 h-3.5" />
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
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
