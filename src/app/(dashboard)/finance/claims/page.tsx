"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { 
  Wallet, 
  Search, 
  Filter, 
  Banknote, 
  ShieldCheck, 
  Download, 
  ArrowRight,
  RotateCcw,
  CheckCircle2,
  Calendar,
  Building2
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ClaimStatusBadge } from "@/components/claims/ClaimStatusBadge";
import { PaymentModal } from "@/components/claims/PaymentModal";
import { useAuth } from "@/lib/auth/context";
import { db } from "@/lib/mock-db/repository";
import { Claim } from "@/lib/types/database";
import { formatCurrency, formatDate } from "@/lib/utils/formatters";
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
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            Finance Claim Review & Payment Execution
          </h1>
          <p className="text-xs text-slate-500">
            Audit receipts, verify ministry cost centres, and record official payment transaction references.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={handleExport}
          className="gap-1.5 border-slate-300 text-xs"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export Filtered Vouchers</span>
        </Button>
      </div>

      {/* Filter Controls */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-white p-3 rounded-2xl border border-slate-200">
        <div className="space-y-1">
          <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            Status Filter
          </label>
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="ALL">All Statuses</option>
            <option value="PENDING_FINANCE_REVIEW">Pending Finance Review</option>
            <option value="APPROVED_FOR_PAYMENT">Approved for Payment</option>
            <option value="PAID">Paid</option>
            <option value="PENDING_MINISTRY_APPROVAL">Pending Leader Approval</option>
            <option value="PENDING_FINAL_APPROVAL">Pending Final Approval</option>
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            Ministry Filter
          </label>
          <select
            value={selectedMinistry}
            onChange={(e) => setSelectedMinistry(e.target.value)}
            className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
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
          <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            Search
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search claimant, claim #, ref..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-full pl-9 pr-3 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
        </div>
      </div>

      {/* Claims Table */}
      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="py-16 text-center text-xs text-slate-400">
              No claims match the selected finance criteria.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50/75 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
                    <th className="py-3 px-4">Claim #</th>
                    <th className="py-3 px-4">Claimant</th>
                    <th className="py-3 px-4">Ministry</th>
                    <th className="py-3 px-4">Cost Centre</th>
                    <th className="py-3 px-4 text-right">Amount (RM)</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-center">Receipts Verified</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3.5 px-4 font-bold text-slate-900">
                        <Link href={`/finance/claims/${c.id}`} className="hover:text-emerald-700 hover:underline">
                          {c.claim_number}
                        </Link>
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-slate-800">
                        {c.claimant?.full_name}
                      </td>
                      <td className="py-3.5 px-4 font-medium text-slate-700">{c.ministry?.name}</td>
                      <td className="py-3.5 px-4 font-mono text-[11px] text-slate-600">{c.cost_centre?.code}</td>
                      <td className="py-3.5 px-4 text-right font-black text-slate-900">
                        {formatCurrency(c.total_amount)}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <ClaimStatusBadge status={c.status} />
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        {c.finance_review?.receipts_verified ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                            <ShieldCheck className="w-3 h-3" />
                            Verified
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-400">Pending Check</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right space-x-1.5">
                        {c.status === "APPROVED_FOR_PAYMENT" && (
                          <Button
                            size="sm"
                            onClick={() => setPaymentClaim(c)}
                            className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs gap-1 shadow-2xs"
                          >
                            <Banknote className="w-3.5 h-3.5" />
                            <span>Pay</span>
                          </Button>
                        )}
                        <Link href={`/finance/claims/${c.id}`}>
                          <Button variant="ghost" size="sm" className="text-emerald-700 hover:bg-emerald-50 text-xs">
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
        </CardContent>
      </Card>

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
