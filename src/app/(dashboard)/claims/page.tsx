"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Plus, Search, FileText, Download, Trash2 } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ClaimStatusBadge } from "@/components/claims/ClaimStatusBadge";
import { MobileClaimList } from "@/components/claims/MobileClaimList";
import { useAuth } from "@/lib/auth/context";
import { claimsClient, workspaceStore } from "@/lib/domains";
import { Claim, ClaimStatus } from "@/lib/types/database";
import { formatCurrency, formatDate } from "@/lib/utils/formatters";
import { generateClaimsCsv, downloadCsv } from "@/lib/utils/export-csv";
import { showToast } from "@/lib/utils/toast";

function ClaimsContent() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const initialStatus = searchParams.get("status") as ClaimStatus | null;
  const initialSearch = searchParams.get("search") || "";

  const [claims, setClaims] = useState<Claim[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<string>(initialStatus || "ALL");
  const [search, setSearch] = useState(initialSearch);
  const [deletingClaim, setDeletingClaim] = useState<Claim | null>(null);
  const [isDeletingClaim, setIsDeletingClaim] = useState(false);

  useEffect(() => {
    setSearch(initialSearch);
    setSelectedStatus(initialStatus || "ALL");
  }, [initialSearch, initialStatus]);

  useEffect(() => {
    if (!user) return;
    setClaims(claimsClient.getClaims(user).filter(claim => claim.submitted_by_user_id === user.id || claim.claimant_id === user.id));
    const unsub = workspaceStore.subscribe(() => {
      setClaims(claimsClient.getClaims(user).filter(claim => claim.submitted_by_user_id === user.id || claim.claimant_id === user.id));
    });
    return unsub;
  }, [user]);

  const handleConfirmDelete = async () => {
    if (!deletingClaim) return;
    try {
      setIsDeletingClaim(true);
      await claimsClient.deleteClaim(deletingClaim.id);
      if (user) {
        setClaims(claimsClient.getClaims(user).filter(claim => claim.submitted_by_user_id === user.id || claim.claimant_id === user.id));
      }
      showToast.success("Claim deleted successfully.", "Claim Deleted");
      setDeletingClaim(null);
    } catch (err: any) {
      showToast.error(err.message || "Failed to delete claim", "Delete Error");
    } finally {
      setIsDeletingClaim(false);
    }
  };

  const filteredClaims = claims.filter((c) => {
    if (selectedStatus === "IN_REVIEW") {
      if (!c.status.startsWith("PENDING_") && c.status !== "SUBMITTED") return false;
    } else if (selectedStatus === "APPROVED") {
      if (c.status !== "APPROVED" && c.status !== "APPROVED_FOR_PAYMENT") return false;
    } else if (selectedStatus !== "ALL" && c.status !== selectedStatus) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        (c.claim_number && c.claim_number.toLowerCase().includes(q)) ||
        (c.claimant_name && c.claimant_name.toLowerCase().includes(q)) ||
        (c.claimant?.full_name && c.claimant.full_name.toLowerCase().includes(q)) ||
        (c.submitted_by?.full_name && c.submitted_by.full_name.toLowerCase().includes(q)) ||
        c.purpose.toLowerCase().includes(q) ||
        (c.ministry?.name && c.ministry.name.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const handleExport = () => {
    const csv = generateClaimsCsv(filteredClaims);
    downloadCsv(`claims_export_${new Date().toISOString().split("T")[0]}.csv`, csv);
  };

  const statuses = [
    { label: "All", value: "ALL" },
    { label: "Drafts", value: "DRAFT" },
    { label: "In review", value: "IN_REVIEW" },
    { label: "Finance", value: "PENDING_FINANCE_REVIEW" },
    { label: "Returned", value: "RETURNED_FOR_CLARIFICATION" },
    { label: "Approved", value: "APPROVED" },
    { label: "Paid", value: "PAID" },
    { label: "Rejected", value: "REJECTED" },
    { label: "Cancelled", value: "CANCELLED" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-2 border-b border-zinc-200/80 dark:border-zinc-800">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            My Claims
          </h1>
          <p className="text-xs text-zinc-500">
            {filteredClaims.length} claim{filteredClaims.length === 1 ? "" : "s"}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            className="h-8 gap-1.5 text-xs border-zinc-200 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300"
          >
            <Download className="w-3.5 h-3.5 text-zinc-400" />
            <span>Export CSV</span>
          </Button>
          <Link href="/claims/new">
            <Button size="sm" className="h-8 bg-emerald-700 hover:bg-emerald-800 text-white gap-1.5 text-xs shadow-2xs font-medium">
              <Plus className="w-3.5 h-3.5" />
              <span>New Claim</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5">
        {/* Status Tabs Segmented */}
        <div className="flex items-center gap-1 p-1 rounded-lg bg-zinc-100 dark:bg-zinc-900 overflow-x-auto">
          {statuses.map((s) => (
            <button
              key={s.value}
              aria-pressed={selectedStatus === s.value}
              onClick={() => setSelectedStatus(s.value)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-all ${
                selectedStatus === s.value
                  ? "bg-white text-zinc-900 shadow-2xs font-semibold dark:bg-zinc-800 dark:text-zinc-100"
                  : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Search Box */}
        <div className="relative w-full md:w-64">
          <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-zinc-400" />
          <input
            type="text"
            aria-label="Filter my claims"
            placeholder="Search voucher, claimant, purpose..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-7 w-full pl-8 pr-2.5 text-xs rounded-lg border border-zinc-200 bg-zinc-50/70 focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:border-zinc-800 dark:bg-zinc-900"
          />
        </div>
      </div>

      {/* Claims Table Container */}
      <div className="rounded-xl border border-zinc-200/80 bg-white dark:border-zinc-800 dark:bg-zinc-950 shadow-2xs overflow-hidden">
        {(filteredClaims || []).length === 0 ? (
          <div className="py-16 text-center space-y-2.5">
            <FileText className="w-8 h-8 text-zinc-300 mx-auto" />
            <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">No claims match the filter</p>
            <p className="text-[11px] text-zinc-400">Try changing status filter or clearing your search query.</p>
            <Button variant="outline" onClick={() => { setSearch(""); setSelectedStatus("ALL"); }}>Clear filters</Button>
          </div>
        ) : (
          <>
            <MobileClaimList claims={filteredClaims || []} onDelete={setDeletingClaim} />
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-zinc-50/50 border-b border-zinc-100 dark:bg-zinc-900/50 dark:border-zinc-800 text-zinc-400 text-[10px] font-semibold uppercase tracking-wider">
                    <th className="py-2.5 px-4">Claim #</th>
                    <th className="py-2.5 px-4">Claimant</th>
                    <th className="py-2.5 px-4">Submitter</th>
                    <th className="py-2.5 px-4">Date</th>
                    <th className="py-2.5 px-4">Ministry & Purpose</th>
                    <th className="py-2.5 px-4 text-center">Receipts</th>
                    <th className="py-2.5 px-4 text-right">Amount (RM)</th>
                    <th className="py-2.5 px-4 text-center">Status</th>
                    <th className="py-2.5 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
                  {(filteredClaims || []).map((c) => (
                    <tr key={c.id} className="hover:bg-zinc-50/70 dark:hover:bg-zinc-900/50 transition-colors">
                      <td className="py-3 px-4 font-mono font-medium text-zinc-900 dark:text-zinc-100">
                        <Link href={`/claims/${c.id}`} className="hover:underline hover:text-emerald-700 dark:hover:text-emerald-400">
                          {c.claim_number || "DRAFT"}
                        </Link>
                      </td>
                      <td className="py-3 px-4 font-medium text-zinc-800 dark:text-zinc-200">
                        <div>{c.claimant_name || c.claimant?.full_name || "-"}</div>
                        {c.claimant_email && <div className="text-[10px] text-zinc-400">{c.claimant_email}</div>}
                      </td>
                      <td className="py-3 px-4 text-zinc-600 dark:text-zinc-400">
                        {c.submitted_by?.full_name || "-"}
                      </td>
                      <td className="py-3 px-4 text-zinc-500 font-mono text-[11px]">{formatDate(c.claim_date)}</td>
                      <td className="py-3 px-4 max-w-xs">
                        <span className="font-medium text-zinc-800 dark:text-zinc-200 block truncate">{c.purpose}</span>
                        <span className="text-[10px] text-zinc-400">{c.ministry?.name}</span>
                      </td>
                      <td className="py-3 px-4 text-center text-zinc-600 dark:text-zinc-400 font-mono text-[11px]">
                        {c.expenses?.length || 0} item{c.expenses?.length === 1 ? "" : "s"}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums">
                        {formatCurrency(c.total_amount)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <ClaimStatusBadge status={c.status} />
                      </td>
                      <td className="py-3 px-4 text-right space-x-1">
                        <Link href={`/claims/${c.id}`}>
                          <Button variant="ghost" size="sm" className="h-7 text-xs text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 px-2.5">
                            View
                          </Button>
                        </Link>
                        {(c.status === "DRAFT" || c.status === "CANCELLED") && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeletingClaim(c)}
                            className="h-7 text-xs text-red-600 hover:bg-red-50 hover:text-red-700 px-2"
                            title="Delete Claim"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Delete Claim Confirmation Dialog */}
      <Dialog open={!!deletingClaim} onOpenChange={(open) => !open && !isDeletingClaim && setDeletingClaim(null)}>
        <DialogHeader>
          <DialogTitle className="text-red-700 flex items-center gap-2">
            <Trash2 className="w-5 h-5 text-red-600" />
            Delete {deletingClaim?.status === "DRAFT" ? "Draft" : "Claim"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 my-2 text-sm text-slate-600">
          <p>
            Are you sure you want to permanently delete {deletingClaim?.claim_number ? <strong className="font-mono text-slate-900">{deletingClaim.claim_number}</strong> : "this draft"}?
          </p>
          <p className="text-xs text-red-600 bg-red-50 p-2.5 rounded border border-red-200">
            This action cannot be undone. All expense items and receipts attached to this claim will be permanently removed.
          </p>
        </div>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => setDeletingClaim(null)} disabled={isDeletingClaim}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirmDelete}
            loading={isDeletingClaim}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            Delete Permanently
          </Button>
        </DialogFooter>
      </Dialog>
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
