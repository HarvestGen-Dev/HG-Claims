"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { PlusCircle, Search, Filter, FileText, ArrowUpDown, Download } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ClaimStatusBadge } from "@/components/claims/ClaimStatusBadge";
import { useAuth } from "@/lib/auth/context";
import { db } from "@/lib/mock-db/repository";
import { Claim, ClaimStatus } from "@/lib/types/database";
import { formatCurrency, formatDate } from "@/lib/utils/formatters";
import { generateClaimsCsv, downloadCsv } from "@/lib/utils/export-csv";

function ClaimsContent() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const initialStatus = searchParams.get("status") as ClaimStatus | null;
  const initialSearch = searchParams.get("search") || "";

  const [claims, setClaims] = useState<Claim[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<string>(initialStatus || "ALL");
  const [search, setSearch] = useState(initialSearch);

  useEffect(() => {
    if (!user) return;
    setClaims(db.getClaims(user));
  }, [user]);

  const filteredClaims = claims.filter((c) => {
    if (selectedStatus !== "ALL" && c.status !== selectedStatus) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        (c.claim_number && c.claim_number.toLowerCase().includes(q)) ||
        c.programme_event.toLowerCase().includes(q) ||
        c.purpose.toLowerCase().includes(q) ||
        c.ministry?.name.toLowerCase().includes(q) ||
        c.claimant?.full_name.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleExport = () => {
    const csv = generateClaimsCsv(filteredClaims);
    downloadCsv(`claims_export_${new Date().toISOString().split("T")[0]}.csv`, csv);
  };

  const statuses = [
    { label: "All Claims", value: "ALL" },
    { label: "Drafts", value: "DRAFT" },
    { label: "Pending Approval", value: "PENDING_MINISTRY_APPROVAL" },
    { label: "Finance Review", value: "PENDING_FINANCE_REVIEW" },
    { label: "Returned", value: "RETURNED_FOR_CLARIFICATION" },
    { label: "Approved for Payment", value: "APPROVED_FOR_PAYMENT" },
    { label: "Paid", value: "PAID" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            Expense Claims Registry
          </h1>
          <p className="text-xs text-slate-500">
            Browse, filter, and track status across all your church expense vouchers.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            className="gap-1.5 text-xs border-slate-300"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </Button>
          <Link href="/claims/new">
            <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white gap-1.5">
              <PlusCircle className="w-4 h-4" />
              <span>+ New Claim</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200">
        {/* Status Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 md:pb-0">
          {statuses.map((s) => (
            <button
              key={s.value}
              onClick={() => setSelectedStatus(s.value)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
                selectedStatus === s.value
                  ? "bg-emerald-700 text-white shadow-xs"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Search Box */}
        <div className="relative w-full md:w-64">
          <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search claim, event, purpose..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 w-full pl-9 pr-3 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      </div>

      {/* Claims Table Card */}
      <Card>
        <CardContent className="p-0">
          {filteredClaims.length === 0 ? (
            <div className="py-16 text-center space-y-3">
              <FileText className="w-12 h-12 text-slate-300 mx-auto" />
              <p className="text-sm font-semibold text-slate-700">No claims match the filter</p>
              <p className="text-xs text-slate-400">Try changing status filter or clearing your search term.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50/75 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
                    <th className="py-3 px-4">Claim #</th>
                    <th className="py-3 px-4">Claimant</th>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Ministry & Programme</th>
                    <th className="py-3 px-4">Cost Centre</th>
                    <th className="py-3 px-4 text-right">Amount (RM)</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredClaims.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3.5 px-4 font-bold text-slate-900">
                        <Link href={`/claims/${c.id}`} className="hover:text-emerald-700 hover:underline">
                          {c.claim_number || "DRAFT"}
                        </Link>
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-slate-800">
                        {c.claimant?.full_name}
                      </td>
                      <td className="py-3.5 px-4 text-slate-500">{formatDate(c.claim_date)}</td>
                      <td className="py-3.5 px-4">
                        <span className="font-semibold text-slate-800 block">{c.programme_event}</span>
                        <span className="text-[10px] text-slate-400">{c.ministry?.name}</span>
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 font-mono text-[11px]">
                        {c.cost_centre?.code}
                      </td>
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
  );
}

export default function MyClaimsPage() {
  return (
    <AppLayout>
      <Suspense fallback={<div className="p-8 text-center text-xs">Loading claims...</div>}>
        <ClaimsContent />
      </Suspense>
    </AppLayout>
  );
}
