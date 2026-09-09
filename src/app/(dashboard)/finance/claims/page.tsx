"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { 
  Search, 
  Banknote, 
  ShieldCheck, 
  Download
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { ClaimStatusBadge } from "@/components/claims/ClaimStatusBadge";
import { PaymentModal } from "@/components/claims/PaymentModal";
import { useAuth } from "@/lib/auth/context";
import { db } from "@/lib/mock-db/repository";
import { Claim } from "@/lib/types/database";
import { formatCurrency } from "@/lib/utils/formatters";
import { generateClaimsCsv, downloadCsv } from "@/lib/utils/export-csv";

function FinanceClaimsContent() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const statusParam = searchParams.get("status") || "ALL";

  const [claims, setClaims] = useState<Claim[]>([]);
  const [selectedStatus, setSelectedStatus] = useState(statusParam);
  const [selectedMinistry, setSelectedMinistry] = useState("ALL");
  const [search, setSearch] = useState("");

  const [paymentClaim, setPaymentClaim] = useState<Claim | null>(null);
  const [loadingAction, setLoadingAction] = useState(false);

  const ministries = db.getMinistries();

  const loadData = () => {
    if (!user) return;
    setClaims(db.getClaims(user));
  };

  useEffect(() => {
    loadData();
  }, [user]);

  const filtered = claims.filter((c) => {
    if (selectedStatus !== "ALL" && c.status !== selectedStatus) return false;
    if (selectedMinistry !== "ALL" && c.ministry_id !== selectedMinistry) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        (c.claim_number && c.claim_number.toLowerCase().includes(q)) ||
        c.claimant?.full_name.toLowerCase().includes(q) ||
        c.programme_event.toLowerCase().includes(q) ||
        (c.payment?.payment_reference && c.payment.payment_reference.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const handleExport = () => {
    const csv = generateClaimsCsv(filtered);
    downloadCsv(`finance_vouchers_${new Date().toISOString().split("T")[0]}.csv`, csv);
  };

  const handlePaymentConfirm = async (paymentData: any) => {
    if (!user || !paymentClaim) return;
    try {
      setLoadingAction(true);
      db.recordPayment({
        ...paymentData,
        claim_id: paymentClaim.id,
        processor: user,
      });
      setPaymentClaim(null);
      loadData();
    } catch (err: any) {
      alert(err.message || "Failed to record payment");
    } finally {
      setLoadingAction(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-2 border-b border-zinc-200/80 dark:border-zinc-800">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            Process & Disburse
          </h1>
          <p className="text-xs text-zinc-500">
            Audit receipts, verify ministry cost centres, and record official EFT payment settlements.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={handleExport}
          className="h-8 gap-1.5 border-zinc-200 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 text-xs"
        >
          <Download className="w-3.5 h-3.5 text-zinc-400" />
          <span>Export Vouchers</span>
        </Button>
      </div>

      {/* Filter Controls */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <div className="space-y-1">
          <label className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider">
            Status
          </label>
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="h-8 w-full rounded-lg border border-zinc-200 bg-white px-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
          >
            <option value="ALL">All Statuses</option>
            <option value="PENDING_FINANCE_REVIEW">Pending Finance Review</option>
            <option value="APPROVED_FOR_PAYMENT">Ready for Payment</option>
            <option value="PAID">Paid Out</option>
            <option value="PENDING_MINISTRY_APPROVAL">Pending Leader</option>
            <option value="PENDING_FINAL_APPROVAL">Pending Final Approver</option>
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider">
            Ministry
          </label>
          <select
            value={selectedMinistry}
            onChange={(e) => setSelectedMinistry(e.target.value)}
            className="h-8 w-full rounded-lg border border-zinc-200 bg-white px-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
          >
            <option value="ALL">All Ministries</option>
            {ministries.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider">
            Search
          </label>
          <div className="relative">
            <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-zinc-400" />
            <input
              type="text"
              placeholder="Search claimant, claim #..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-full pl-8 pr-2.5 text-xs rounded-lg border border-zinc-200 bg-zinc-50/70 focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:border-zinc-800 dark:bg-zinc-900"
            />
          </div>
        </div>
      </div>

      {/* Claims Table */}
      <div className="rounded-xl border border-zinc-200/80 bg-white dark:border-zinc-800 dark:bg-zinc-950 shadow-2xs overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-16 text-center text-xs text-zinc-400">
            No claims match the selected finance criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-zinc-50/50 border-b border-zinc-100 dark:bg-zinc-900/50 dark:border-zinc-800 text-zinc-400 text-[10px] font-semibold uppercase tracking-wider">
                  <th className="py-2.5 px-4">Claim #</th>
                  <th className="py-2.5 px-4">Claimant</th>
                  <th className="py-2.5 px-4">Ministry</th>
                  <th className="py-2.5 px-4">Cost Centre</th>
                  <th className="py-2.5 px-4 text-right">Amount (RM)</th>
                  <th className="py-2.5 px-4 text-center">Status</th>
                  <th className="py-2.5 px-4 text-center">Receipts</th>
                  <th className="py-2.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
                {filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-zinc-50/70 dark:hover:bg-zinc-900/50 transition-colors">
                    <td className="py-3 px-4 font-mono font-medium text-zinc-900 dark:text-zinc-100">
                      <Link href={`/finance/claims/${c.id}`} className="hover:underline hover:text-emerald-700 dark:hover:text-emerald-400">
                        {c.claim_number}
                      </Link>
                    </td>
                    <td className="py-3 px-4 font-medium text-zinc-800 dark:text-zinc-200">
                      {c.claimant?.full_name}
                    </td>
                    <td className="py-3 px-4 text-zinc-600 dark:text-zinc-400">{c.ministry?.name}</td>
                    <td className="py-3 px-4 font-mono text-[11px] text-zinc-500">{c.cost_centre?.code}</td>
                    <td className="py-3 px-4 text-right font-mono font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums">
                      {formatCurrency(c.total_amount)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <ClaimStatusBadge status={c.status} />
                    </td>
                    <td className="py-3 px-4 text-center">
                      {c.finance_review?.receipts_verified ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200/60 dark:bg-emerald-950/40 dark:text-emerald-300">
                          <ShieldCheck className="w-3 h-3" />
                          Verified
                        </span>
                      ) : (
                        <span className="text-[10px] text-zinc-400">Pending</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right space-x-1.5">
                      {c.status === "APPROVED_FOR_PAYMENT" && (
                        <Button
                          size="sm"
                          onClick={() => setPaymentClaim(c)}
                          className="h-7 text-xs bg-emerald-700 hover:bg-emerald-800 text-white gap-1 shadow-2xs font-medium px-2.5"
                        >
                          <Banknote className="w-3 h-3" />
                          <span>Pay</span>
                        </Button>
                      )}
                      <Link href={`/finance/claims/${c.id}`}>
                        <Button variant="ghost" size="sm" className="h-7 text-xs text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 px-2">
                          Review
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <PaymentModal
        open={!!paymentClaim}
        claim={paymentClaim}
        onConfirm={handlePaymentConfirm}
        onCancel={() => setPaymentClaim(null)}
        loading={loadingAction}
      />
    </div>
  );
}

export default function FinanceClaimsPage() {
  return (
    <AppLayout>
      <Suspense fallback={<div className="p-8 text-center text-xs">Loading finance claims...</div>}>
        <FinanceClaimsContent />
      </Suspense>
    </AppLayout>
  );
}
