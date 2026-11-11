"use client";

import { Select } from "@/components/ui/select";
import React, {
  useState,
  useEffect,
  useMemo,
  useDeferredValue,
  Suspense,
} from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Plus, Search, FileText, Download, Trash2 } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { ClaimLink } from "@/components/claims/ClaimLink";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ClaimStatusBadge } from "@/components/claims/ClaimStatusBadge";
import { MobileClaimList } from "@/components/claims/MobileClaimList";
import { useAuth } from "@/lib/auth/context";
import { claimsClient, workspaceStore } from "@/lib/domains";
import { Claim, ClaimStatus } from "@/lib/types/database";
import { formatCurrency, formatDate } from "@/lib/utils/formatters";
import { generateClaimsCsv, downloadCsv } from "@/lib/utils/export-csv";
import { showToast } from "@/lib/utils/toast";

function ClaimsContent() {
  const { user, canCreateClaim } = useAuth();
  const searchParams = useSearchParams();
  const initialStatus = searchParams.get("status") as ClaimStatus | null;
  const initialSearch = searchParams.get("search") || "";

  const [claims, setClaims] = useState<Claim[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<string>(
    initialStatus || "ALL",
  );
  const [search, setSearch] = useState(initialSearch);
  const [sort, setSort] = useState<
    "newest" | "oldest" | "amount-high" | "amount-low"
  >("newest");
  const [page, setPage] = useState(1);
  const [deletingClaim, setDeletingClaim] = useState<Claim | null>(null);
  const [isDeletingClaim, setIsDeletingClaim] = useState(false);

  useEffect(() => {
    setSearch(initialSearch);
    setSelectedStatus(initialStatus || "ALL");
  }, [initialSearch, initialStatus]);

  useEffect(() => {
    if (!user) return;
    const sync = () => {
      setClaims(
        claimsClient
          .getClaims(user)
          .filter(
            (claim) =>
              claim.submitted_by_user_id === user.id ||
              claim.claimant_id === user.id,
          ),
      );
    };
    sync();
    return workspaceStore.subscribeDomains(
      ["claims", "master-data", "iam"],
      sync,
    );
  }, [user]);

  const deferredSearch = useDeferredValue(search);

  const handleConfirmDelete = async () => {
    if (!deletingClaim) return;
    try {
      setIsDeletingClaim(true);
      await claimsClient.deleteClaim(deletingClaim.id);
      if (user) {
        setClaims(
          claimsClient
            .getClaims(user)
            .filter(
              (claim) =>
                claim.submitted_by_user_id === user.id ||
                claim.claimant_id === user.id,
            ),
        );
      }
      showToast.success("Claim deleted successfully.", "Claim Deleted");
      setDeletingClaim(null);
    } catch (err: any) {
      showToast.error(err.message || "Failed to delete claim", "Delete Error");
    } finally {
      setIsDeletingClaim(false);
    }
  };

  const filteredClaims = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    return claims.filter((c) => {
      if (selectedStatus === "IN_REVIEW") {
        if (!c.status.startsWith("PENDING_") && c.status !== "SUBMITTED")
          return false;
      } else if (selectedStatus === "APPROVED") {
        if (c.status !== "APPROVED" && c.status !== "APPROVED_FOR_PAYMENT")
          return false;
      } else if (selectedStatus !== "ALL" && c.status !== selectedStatus)
        return false;
      if (q) {
        return (
          (c.claim_number && c.claim_number.toLowerCase().includes(q)) ||
          (c.claimant_name && c.claimant_name.toLowerCase().includes(q)) ||
          (c.claimant?.full_name &&
            c.claimant.full_name.toLowerCase().includes(q)) ||
          (c.submitted_by?.full_name &&
            c.submitted_by.full_name.toLowerCase().includes(q)) ||
          c.purpose.toLowerCase().includes(q) ||
          (c.ministry?.name && c.ministry.name.toLowerCase().includes(q)) ||
          (c.disbursement_voucher &&
            c.disbursement_voucher.toLowerCase().includes(q)) ||
          (c.batch_number && c.batch_number.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [claims, selectedStatus, deferredSearch]);

  useEffect(() => {
    setPage(1);
  }, [selectedStatus, deferredSearch, sort]);

  const sortedClaims = useMemo(
    () =>
      [...filteredClaims].sort((a, b) => {
        if (sort === "amount-high")
          return Number(b.total_amount) - Number(a.total_amount);
        if (sort === "amount-low")
          return Number(a.total_amount) - Number(b.total_amount);
        const dateA = a.submitted_at || a.created_at;
        const dateB = b.submitted_at || b.created_at;
        return sort === "oldest"
          ? dateA.localeCompare(dateB)
          : dateB.localeCompare(dateA);
      }),
    [filteredClaims, sort],
  );
  const pageSize = 25;
  const pageCount = Math.max(1, Math.ceil(sortedClaims.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visibleClaims = sortedClaims.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  const handleExport = () => {
    const csv = generateClaimsCsv(sortedClaims);
    downloadCsv(
      `claims_export_${new Date().toISOString().split("T")[0]}.csv`,
      csv,
    );
  };

  const statuses = [
    { label: "All", value: "ALL" },
    { label: "Drafts", value: "DRAFT" },
    { label: "In review", value: "IN_REVIEW" },
    { label: "Finance", value: "PENDING_FINANCE_REVIEW" },
    { label: "Returned", value: "RETURNED_FOR_CLARIFICATION" },
    { label: "Approved", value: "APPROVED" },
    { label: "Processed", value: "PAID" },
    { label: "Rejected", value: "REJECTED" },
    { label: "Cancelled", value: "CANCELLED" },
  ];

  return (
    <div className="claim-page mx-auto w-full max-w-6xl space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-zinc-200/80 dark:border-zinc-800">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            My Claims
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {filteredClaims.length} claim
            {filteredClaims.length === 1 ? "" : "s"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 [&>*]:flex-1 sm:[&>*]:flex-none">
          <Button
            variant="outline"
            onClick={handleExport}
            className="gap-2"
            disabled={!sortedClaims.length}
          >
            <Download className="size-4" /> Export CSV
          </Button>
          {canCreateClaim() && (
            <ClaimLink href="/claims/new" variant="default">
              <Plus className="size-4" /> Submit Claim
            </ClaimLink>
          )}
        </div>
      </div>

      <div className="filter-bar grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-[1fr_2fr_1fr]">
        <div>
          <label htmlFor="claims-status">Status</label>
          <Select
            id="claims-status"
            value={selectedStatus}
            onChange={(event) => setSelectedStatus(event.target.value)}
            className="w-full"
          >
            {statuses.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="sm:col-span-2 sm:row-start-1 xl:col-span-1 xl:row-auto">
          <label htmlFor="claims-search">Search claims</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              id="claims-search"
              type="search"
              aria-label="Filter my claims"
              placeholder="Claim number, payee, team or purpose"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-11 w-full rounded-lg border border-input pl-10 pr-3"
            />
          </div>
        </div>
        <div>
          <label htmlFor="claims-sort">Sort by</label>
          <Select
            id="claims-sort"
            aria-label="Sort claims"
            value={sort}
            onChange={(event) => setSort(event.target.value as typeof sort)}
            className="w-full"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="amount-high">Highest amount</option>
            <option value="amount-low">Lowest amount</option>
          </Select>
        </div>
      </div>

      {/* Claims Table Container */}
      <div className="rounded-xl border border-zinc-200/80 bg-white dark:border-zinc-800 dark:bg-zinc-950 shadow-2xs overflow-hidden">
        {(filteredClaims || []).length === 0 ? (
          <div className="py-16 text-center space-y-2.5">
            <FileText className="w-8 h-8 text-zinc-300 mx-auto" />
            <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
              No claims match the filter
            </p>
            <p className="text-[11px] text-zinc-400">
              Try changing status filter or clearing your search query.
            </p>
            <Button
              variant="outline"
              onClick={() => {
                setSearch("");
                setSelectedStatus("ALL");
              }}
            >
              Clear filters
            </Button>
          </div>
        ) : (
          <>
            <MobileClaimList
              claims={visibleClaims}
              onDelete={setDeletingClaim}
            />
            <div className="hidden xl:block overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-zinc-50/50 border-b border-zinc-100 dark:bg-zinc-900/50 dark:border-zinc-800 text-zinc-400 text-[10px] font-semibold uppercase tracking-wider">
                    <th className="py-2.5 px-4">Claim #</th>
                    <th className="py-2.5 px-4">Pay to</th>
                    <th className="py-2.5 px-4">Team & Purpose</th>
                    <th className="py-2.5 px-4 text-right">Amount</th>
                    <th className="py-2.5 px-4 text-center">Status</th>
                    <th className="py-2.5 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
                  {visibleClaims.map((c) => (
                    <tr
                      key={c.id}
                      className="hover:bg-zinc-50/70 dark:hover:bg-zinc-900/50 transition-colors"
                    >
                      <td className="py-3 px-4 font-mono font-medium text-zinc-900 dark:text-zinc-100">
                        <Link
                          href={`/claims/${c.id}`}
                          className="hover:underline hover:text-emerald-700 dark:hover:text-emerald-400"
                        >
                          {c.claim_number || "DRAFT"}
                        </Link>
                        <p className="mt-1 text-xs font-normal text-muted-foreground">
                          {formatDate(c.claim_date)}
                        </p>
                        {c.disbursement_voucher && (
                          <p className="mt-1 text-xs font-normal text-muted-foreground">
                            Voucher {c.disbursement_voucher}
                            {c.disbursement_line_order
                              ? ` · Row ${c.disbursement_line_order}`
                              : ""}
                          </p>
                        )}
                        {c.batch_number && (
                          <p className="mt-1 text-xs font-normal text-muted-foreground">
                            {c.batch_number}
                          </p>
                        )}
                      </td>
                      <td className="py-3 px-4 font-medium text-zinc-800 dark:text-zinc-200">
                        <div>
                          {c.claimant_name || c.claimant?.full_name || "-"}
                        </div>
                        {c.submitted_by?.full_name && (
                          <div className="mt-1 text-xs font-normal text-muted-foreground">
                            Submitted by {c.submitted_by.full_name}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 max-w-xs">
                        <span className="font-medium text-zinc-800 dark:text-zinc-200 block truncate">
                          {c.purpose}
                        </span>
                        <span className="text-[10px] text-zinc-400">
                          {c.ministry?.name}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums">
                        {formatCurrency(c.total_amount)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <ClaimStatusBadge
                          status={c.status}
                          reimbursementStatus={c.reimbursement_status}
                        />
                      </td>
                      <td className="py-3 px-4 text-right w-px">
                        <div className="table-actions">
                          <ClaimLink href={`/claims/${c.id}`} variant="outline">
                            View
                          </ClaimLink>
                          {!c.recurring_schedule_id &&
                            (c.status === "DRAFT" ||
                              c.status === "CANCELLED") && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setDeletingClaim(c)}
                                className="w-11 px-0 text-red-600 hover:bg-red-50 hover:text-red-700"
                                aria-label={`Delete ${c.claim_number || "draft claim"}`}
                                title="Delete claim"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {pageCount > 1 && (
        <nav
          aria-label="Claims pages"
          className="flex items-center justify-between gap-3 text-sm text-zinc-600"
        >
          <span>
            Page {currentPage} of {pageCount}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage === 1}
              onClick={() => setPage(currentPage - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage === pageCount}
              onClick={() => setPage(currentPage + 1)}
            >
              Next
            </Button>
          </div>
        </nav>
      )}

      {/* Delete Claim Confirmation Dialog */}
      <Dialog
        open={!!deletingClaim}
        onOpenChange={(open) =>
          !open && !isDeletingClaim && setDeletingClaim(null)
        }
      >
        <DialogHeader>
          <DialogTitle className="text-red-700 flex items-center gap-2">
            <Trash2 className="w-5 h-5 text-red-600" />
            Delete {deletingClaim?.status === "DRAFT" ? "Draft" : "Claim"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 my-2 text-sm text-slate-600">
          <p>
            Are you sure you want to permanently delete{" "}
            {deletingClaim?.claim_number ? (
              <strong className="font-mono text-slate-900">
                {deletingClaim.claim_number}
              </strong>
            ) : (
              "this draft"
            )}
            ?
          </p>
          <p className="text-xs text-red-600 bg-red-50 p-2.5 rounded border border-red-200">
            This action cannot be undone. This claim and its expense items will
            be removed. Other claims are not affected.
          </p>
        </div>
        <DialogFooter className="mt-4">
          <Button
            variant="outline"
            onClick={() => setDeletingClaim(null)}
            disabled={isDeletingClaim}
          >
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
      <Suspense
        fallback={
          <div className="p-8 text-center text-xs">Loading claims...</div>
        }
      >
        <ClaimsContent />
      </Suspense>
    </AppLayout>
  );
}
