"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { 
  PlusCircle, 
  FileText, 
  Clock, 
  RotateCcw, 
  CheckCircle2, 
  Banknote, 
  ArrowRight,
  TrendingUp,
  Search,
  Layers,
  Building2,
  AlertCircle
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ClaimStatusBadge } from "@/components/claims/ClaimStatusBadge";
import { useAuth } from "@/lib/auth/context";
import { db } from "@/lib/mock-db/repository";
import { Claim } from "@/lib/types/database";
import { formatCurrency, formatDate } from "@/lib/utils/formatters";

export default function DashboardPage() {
  const { user, hasRole } = useAuth();
  const [claims, setClaims] = useState<Claim[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!user) return;
    setClaims(db.getClaims(user));
  }, [user]);

  // Status counts for claimant
  const myClaims = claims.filter(c => c.claimant_id === user?.id);
  const draftCount = myClaims.filter(c => c.status === "DRAFT").length;
  const pendingCount = myClaims.filter(c => 
    c.status.startsWith("PENDING_") || c.status === "SUBMITTED"
  ).length;
  const returnedCount = myClaims.filter(c => c.status === "RETURNED_FOR_CLARIFICATION").length;
  const approvedCount = myClaims.filter(c => c.status === "APPROVED" || c.status === "APPROVED_FOR_PAYMENT").length;
  const paidCount = myClaims.filter(c => c.status === "PAID").length;
  const totalPaidAmount = myClaims
    .filter(c => c.status === "PAID")
    .reduce((sum, c) => sum + Number(c.total_amount), 0);

  const filteredRecent = myClaims
    .filter(c => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        (c.claim_number && c.claim_number.toLowerCase().includes(q)) ||
        c.programme_event.toLowerCase().includes(q) ||
        c.purpose.toLowerCase().includes(q)
      );
    })
    .slice(0, 8);

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Welcome Banner */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-gradient-to-r from-emerald-900 to-emerald-800 text-white p-6 rounded-3xl shadow-md">
          <div className="space-y-1">
            <span className="text-xs font-semibold tracking-wider text-emerald-300 uppercase">
              Welcome back,
            </span>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
              {user?.full_name}
            </h1>
            <p className="text-xs sm:text-sm text-emerald-100 max-w-xl">
              Track your ministry expense claims, respond to clarification requests, and check reimbursement payouts.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link href="/claims/new">
              <Button className="bg-white text-emerald-900 hover:bg-emerald-50 font-bold shadow-lg gap-2 text-sm">
                <PlusCircle className="w-4 h-4 text-emerald-700" />
                <span>+ New Expense Claim</span>
              </Button>
            </Link>
          </div>
        </div>

        {/* Action Required: Returned for Clarification Banner */}
        {returnedCount > 0 && (
          <div className="flex items-center justify-between p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 shadow-2xs">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                <RotateCcw className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-bold">Action Required ({returnedCount} Claim{returnedCount > 1 ? "s" : ""})</p>
                <p className="text-xs text-rose-700">An approver requested clarification or missing receipts on your claim.</p>
              </div>
            </div>
            <Link href="/claims?status=RETURNED_FOR_CLARIFICATION">
              <Button size="sm" className="bg-rose-600 hover:bg-rose-700 text-white text-xs">
                Review & Fix
              </Button>
            </Link>
          </div>
        )}

        {/* Summary Stat Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
          <Link href="/claims?status=DRAFT" className="group">
            <Card className="hover:border-slate-300 transition-all hover:shadow-sm">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Drafts</span>
                  <FileText className="w-4 h-4 text-slate-400 group-hover:text-slate-700" />
                </div>
                <p className="text-2xl font-black text-slate-800">{draftCount}</p>
                <span className="text-[11px] text-slate-500 block">Not yet submitted</span>
              </CardContent>
            </Card>
          </Link>

          <Link href="/claims?status=PENDING_MINISTRY_APPROVAL" className="group">
            <Card className="hover:border-amber-300 transition-all hover:shadow-sm">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-600 uppercase tracking-wider">In Review</span>
                  <Clock className="w-4 h-4 text-amber-500" />
                </div>
                <p className="text-2xl font-black text-amber-900">{pendingCount}</p>
                <span className="text-[11px] text-amber-600/80 block">Awaiting approvals</span>
              </CardContent>
            </Card>
          </Link>

          <Link href="/claims?status=RETURNED_FOR_CLARIFICATION" className="group">
            <Card className="hover:border-rose-300 transition-all hover:shadow-sm">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-rose-600 uppercase tracking-wider">Returned</span>
                  <RotateCcw className="w-4 h-4 text-rose-500" />
                </div>
                <p className="text-2xl font-black text-rose-900">{returnedCount}</p>
                <span className="text-[11px] text-rose-600/80 block">Needs your edit</span>
              </CardContent>
            </Card>
          </Link>

          <Link href="/claims?status=APPROVED_FOR_PAYMENT" className="group">
            <Card className="hover:border-teal-300 transition-all hover:shadow-sm">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-teal-600 uppercase tracking-wider">Approved</span>
                  <CheckCircle2 className="w-4 h-4 text-teal-500" />
                </div>
                <p className="text-2xl font-black text-teal-900">{approvedCount}</p>
                <span className="text-[11px] text-teal-600/80 block">Queued for payment</span>
              </CardContent>
            </Card>
          </Link>

          <Link href="/claims?status=PAID" className="group col-span-2 sm:col-span-1">
            <Card className="hover:border-emerald-300 bg-emerald-50/40 transition-all hover:shadow-sm border-emerald-200">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider">Reimbursed</span>
                  <Banknote className="w-4 h-4 text-emerald-600" />
                </div>
                <p className="text-2xl font-black text-emerald-950">{paidCount}</p>
                <span className="text-[11px] font-semibold text-emerald-700 block">{formatCurrency(totalPaidAmount)}</span>
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* Recent Claims Section */}
        <Card>
          <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div>
              <CardTitle className="text-base font-bold text-slate-900 dark:text-slate-100">
                Recent Expense Claims
              </CardTitle>
              <p className="text-xs text-slate-500">
                Summary of your recent submissions and active claim statuses.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter claims..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-8 pl-8 pr-3 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
              <Link href="/claims">
                <Button variant="outline" size="sm" className="text-xs gap-1">
                  <span>View All</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </Link>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {filteredRecent.length === 0 ? (
              <div className="py-12 text-center space-y-3">
                <FileText className="w-10 h-10 text-slate-300 mx-auto" />
                <p className="text-sm font-semibold text-slate-700">No claims found</p>
                <p className="text-xs text-slate-400">Click "+ New Expense Claim" to submit your first claim.</p>
                <Link href="/claims/new" className="inline-block mt-2">
                  <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs">
                    Create Claim
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50/75 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
                      <th className="py-3 px-4">Claim Number</th>
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4">Ministry & Programme</th>
                      <th className="py-3 px-4">Purpose</th>
                      <th className="py-3 px-4 text-right">Amount (RM)</th>
                      <th className="py-3 px-4 text-center">Status</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredRecent.map((c) => (
                      <tr key={c.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3.5 px-4 font-bold text-slate-900">
                          <Link href={`/claims/${c.id}`} className="hover:text-emerald-700 hover:underline">
                            {c.claim_number || "DRAFT"}
                          </Link>
                        </td>
                        <td className="py-3.5 px-4 text-slate-500">{formatDate(c.claim_date)}</td>
                        <td className="py-3.5 px-4">
                          <span className="font-semibold text-slate-800 block">{c.programme_event}</span>
                          <span className="text-[10px] text-slate-400">{c.ministry?.name}</span>
                        </td>
                        <td className="py-3.5 px-4 text-slate-600 max-w-xs truncate">{c.purpose}</td>
                        <td className="py-3.5 px-4 text-right font-black text-slate-900">
                          {formatCurrency(c.total_amount)}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <ClaimStatusBadge status={c.status} />
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <Link href={`/claims/${c.id}`}>
                            <Button variant="ghost" size="sm" className="text-emerald-700 hover:bg-emerald-50 text-xs">
                              View
                            </Button>
                          </Link>
                        </td>
                      </tr>
                    ))}
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
