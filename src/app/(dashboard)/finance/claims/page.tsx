"use client";

import { Select } from "@/components/ui/select";
import React, { useState, useEffect, Suspense, useMemo, useDeferredValue } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import {
  Search,
  Banknote,
  Download,
  FileSpreadsheet,
  CheckCircle2,
  CheckSquare,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button, buttonVariants } from "@/components/ui/button";
import { ClaimStatusBadge } from "@/components/claims/ClaimStatusBadge";
import { MobileClaimList } from "@/components/claims/MobileClaimList";

const PaymentModal = dynamic(
  () => import("@/components/claims/PaymentModal").then((m) => m.PaymentModal),
  { ssr: false }
);
import { useAuth } from "@/lib/auth/context";
import {
  claimsClient,
  financeClient,
  masterDataClient,
  workspaceStore,
} from "@/lib/domains";
import { Claim, ReimbursementBatch } from "@/lib/types/database";
import { evaluateClaimForReimbursement } from "@/lib/banking/reimbursement-preview";
import { formatCurrency, formatDate } from "@/lib/utils/formatters";
import { generateClaimsCsv, downloadCsv } from "@/lib/utils/export-csv";
import { showToast } from "@/lib/utils/toast";

function FinanceClaimsContent() {
  const { user, canApprove } = useAuth();
  const searchParams = useSearchParams();
  const statusParam = searchParams.get("status") || "ALL";

  const [view, setView] = useState<"claims" | "disbursed">("claims");
  const [claims, setClaims] = useState<Claim[]>([]);
  const [batches, setBatches] = useState<ReimbursementBatch[]>([]);
  const [selectedStatus, setSelectedStatus] = useState(statusParam);
  const [selectedMinistry, setSelectedMinistry] = useState("ALL");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [page, setPage] = useState(1);

  const [selectedClaimIds, setSelectedClaimIds] = useState<string[]>([]);
  const [paymentClaim, setPaymentClaim] = useState<Claim | null>(null);
  const [loadingAction, setLoadingAction] = useState(false);
  const [generatingXls, setGeneratingXls] = useState(false);
  const [disbursingBatchId, setDisbursingBatchId] = useState<string | null>(
    null
  );
  const [approvingClaimId, setApprovingClaimId] = useState<string | null>(null);

  const ministries = masterDataClient.getMinistries();

  useEffect(() => {
    if (!user) return;
    const sync = () => {
      const nextClaims = claimsClient.getClaims(user);
      setClaims(nextClaims);
      setBatches(financeClient.getReimbursementBatches());
      setSelectedClaimIds((prev) =>
        prev.filter((id) =>
          nextClaims.some(
            (c) =>
              c.id === id &&
              c.status === "APPROVED_FOR_PAYMENT" &&
              !c.active_batch_id
          )
        )
      );
    };
    sync();
    return workspaceStore.subscribeDomains(
      ["claims", "finance", "master-data", "iam"],
      sync
    );
  }, [user]);

  const batchById = useMemo(() => {
    return new Map(batches.map((b) => [b.id, b]));
  }, [batches]);

  const filtered = useMemo(() => {
    return claims.filter((c) => {
      if (selectedStatus !== "ALL" && c.status !== selectedStatus) return false;
      if (selectedMinistry !== "ALL" && c.ministry_id !== selectedMinistry)
        return false;
      if (deferredSearch.trim()) {
        const q = deferredSearch.toLowerCase();
        return (
          (c.claim_number && c.claim_number.toLowerCase().includes(q)) ||
          (c.claimant_name && c.claimant_name.toLowerCase().includes(q)) ||
          (c.claimant?.full_name &&
            c.claimant.full_name.toLowerCase().includes(q)) ||
          (c.submitted_by?.full_name &&
            c.submitted_by.full_name.toLowerCase().includes(q)) ||
          c.purpose.toLowerCase().includes(q) ||
          (c.payment?.payment_reference &&
            c.payment.payment_reference.toLowerCase().includes(q)) ||
          (c.payment?.notes &&
            c.payment.notes.toLowerCase().includes(q)) ||
          (c.disbursement_voucher &&
            c.disbursement_voucher.toLowerCase().includes(q)) ||
          (c.batch_number &&
            c.batch_number.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [claims, selectedStatus, selectedMinistry, deferredSearch]);

  useEffect(() => {
    setPage(1);
  }, [selectedStatus, selectedMinistry, deferredSearch]);

  const pageSize = 25;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visibleClaims = useMemo(
    () => filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [filtered, currentPage, pageSize]
  );

  const selectableApprovedIds = useMemo(() => {
    return filtered
      .filter(
        (c) =>
          c.status === "APPROVED_FOR_PAYMENT" &&
          !c.active_batch_id &&
          !c.payment &&
          evaluateClaimForReimbursement(c).eligible
      )
      .map((c) => c.id);
  }, [filtered]);

  const allApprovedSelected =
    selectableApprovedIds.length > 0 &&
    selectableApprovedIds.every((id) => selectedClaimIds.includes(id));

  const handleToggleSelectAllApproved = () => {
    if (allApprovedSelected) {
      setSelectedClaimIds((prev) =>
        prev.filter((id) => !selectableApprovedIds.includes(id))
      );
    } else {
      setSelectedClaimIds((prev) =>
        Array.from(new Set([...prev, ...selectableApprovedIds]))
      );
    }
  };

  const handleToggleClaimSelection = (claimId: string) => {
    setSelectedClaimIds((prev) =>
      prev.includes(claimId)
        ? prev.filter((id) => id !== claimId)
        : [...prev, claimId]
    );
  };

  const handleQuickApprove = async (claim: Claim) => {
    if (!user || !canApprove(claim) || approvingClaimId) return;
    try {
      setApprovingClaimId(claim.id);
      await financeClient.approveStep(
        claim.id,
        user,
        "Approved for XLS disbursement."
      );
      await workspaceStore.refreshDomain("/api/v1/claims");
      showToast.success(
        `${claim.claim_number} approved and ready for XLS selection.`,
        "Claim Approved"
      );
    } catch (err: any) {
      showToast.error(
        err?.message || "Failed to approve claim.",
        "Approval Error"
      );
    } finally {
      setApprovingClaimId(null);
    }
  };

  const handleGenerateXlsForSelected = async (claimIdsToBatch?: string[]) => {
    const ids = claimIdsToBatch || selectedClaimIds;
    if (ids.length === 0) {
      showToast.error(
        "Select at least one approved claim to generate the .xls disbursement file.",
        "No Claims Selected"
      );
      return;
    }

    setGeneratingXls(true);
    try {
      const created = await financeClient.finalizeReimbursementBatch({
        claim_ids: ids,
        mark_exported: false,
        notes: "Generated Alliance Bank .xls disbursement file",
      });
      setSelectedClaimIds([]);
      await Promise.all([
        workspaceStore.refreshDomain("/api/v1/finance"),
        workspaceStore.refreshDomain("/api/v1/claims"),
      ]);
      showToast.success(
        `XLS file (${created.batch_number}.xls) created for ${ids.length} claim(s). Once bank disbursement is done, click "Mark .xls as Processed".`,
        "XLS File Created"
      );
      window.location.assign(`/api/v1/finance/batches/${created.id}/export`);
    } catch (err: any) {
      showToast.error(
        err?.message || "Unable to generate .xls file.",
        "XLS Generation Error"
      );
    } finally {
      setGeneratingXls(false);
    }
  };

  const handleMarkBatchProcessed = async (batch: ReimbursementBatch) => { window.location.assign(`/finance/batches/${batch.id}`); };

  const handleExport = () => {
    const csv = generateClaimsCsv(filtered);
    downloadCsv(
      `finance_vouchers_${new Date().toISOString().split("T")[0]}.csv`,
      csv
    );
  };

  const handlePaymentConfirm = async (paymentData: any) => {
    if (!user || !paymentClaim) return;
    try {
      setLoadingAction(true);
      await financeClient.recordPayment({
        ...paymentData,
        claim_id: paymentClaim.id,
        processor: user,
      });
      setPaymentClaim(null);
      await workspaceStore.refreshDomain("/api/v1/claims");
    } catch (err: any) {
      alert(err.message || "Failed to record payment");
    } finally {
      setLoadingAction(false);
    }
  };

  const isHistory = view === "disbursed";
  const visibleBatches = batches.filter((batch) => {
    const matchesStatus = isHistory
      ? batch.status === "SETTLED"
      : batch.status !== "SETTLED" && batch.status !== "VOIDED" && batch.status !== "REJECTED";
    if (!matchesStatus) return false;
    if (deferredSearch.trim()) {
      const q = deferredSearch.toLowerCase();
      const matchesBatchNumber = batch.batch_number.toLowerCase().includes(q);
      const matchesInstruction = batch.instructions?.some((inst) =>
        inst.payment_description.toLowerCase().includes(q) ||
        inst.beneficiary_name.toLowerCase().includes(q) ||
        inst.claims?.some((ic) => ic.claim?.claim_number?.toLowerCase().includes(q))
      );
      return matchesBatchNumber || Boolean(matchesInstruction);
    }
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-2 border-b border-zinc-200/80 dark:border-zinc-800">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            Reimbursements
          </h1>
        </div>
        {!isHistory && (
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/finance/batches" className={buttonVariants({ variant: "outline", className: "min-h-11 gap-2" })}>
              <Banknote className="size-4" /> Bank batches
            </Link>
            <Button variant="outline" onClick={handleExport} className="min-h-11 gap-2">
              <Download className="size-4" /> Export CSV
            </Button>
          </div>
        )}
      </div>

      <div role="group" aria-label="Reimbursements view" className="flex gap-4 border-b border-border">
        <button type="button" aria-pressed={!isHistory} onClick={() => setView("claims")} className="min-h-11 border-b-2 border-transparent px-1 text-sm text-muted-foreground aria-pressed:border-primary aria-pressed:font-semibold aria-pressed:text-foreground">
          Claims
        </button>
        <button type="button" aria-pressed={isHistory} onClick={() => setView("disbursed")} className="min-h-11 border-b-2 border-transparent px-1 text-sm text-muted-foreground aria-pressed:border-primary aria-pressed:font-semibold aria-pressed:text-foreground">
          Processed files
        </button>
      </div>

      {isHistory && (
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none w-3.5 h-3.5 text-zinc-400" />
          <input
            type="text"
            placeholder="Search voucher (e.g. P260001), batch #, beneficiary..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-full pl-8 pr-2.5 text-xs rounded-lg border border-zinc-200 bg-zinc-50/70 focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:border-zinc-800 dark:bg-zinc-900"
          />
        </div>
      )}

      {(isHistory || visibleBatches.length > 0) && (
        <section className="rounded-xl border border-border bg-card" aria-label={isHistory ? "Processed files" : "Files awaiting disbursement"}>
          {!isHistory && (
            <h2 className="border-b border-border px-4 py-3 text-sm font-semibold">Files awaiting disbursement</h2>
          )}
          {visibleBatches.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No disbursed files yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {visibleBatches.map((batch) => (
                <li key={batch.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <Link href={`/finance/batches/${batch.id}`} className="break-words text-sm font-semibold hover:underline">
                      {batch.batch_number}.xls
                    </Link>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {formatCurrency(batch.total_amount)} · {batch.claim_count} {batch.claim_count === 1 ? "claim" : "claims"} · {formatDate((isHistory && batch.settled_at) || batch.created_at)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <a href={`/api/v1/finance/batches/${batch.id}/export`} className={buttonVariants({ variant: "outline", className: "min-h-11 gap-2" })}>
                      <Download className="size-4" /> Download .xls
                    </a>
                    {!isHistory && (
                      <Button
                        type="button"
                        variant="secondary"
                        loading={disbursingBatchId === batch.id}
                        onClick={() => handleMarkBatchProcessed(batch)}
                        className="min-h-11"
                      >
                        Mark disbursed
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {!isHistory && <>
        {selectableApprovedIds.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" onClick={handleToggleSelectAllApproved} className="min-h-11 gap-2">
              <CheckSquare className="size-4" />
              {allApprovedSelected ? "Clear selection" : `Select ready claims (${selectableApprovedIds.length})`}
            </Button>
            <Button
              type="button"
              loading={generatingXls}
              disabled={generatingXls || selectedClaimIds.length === 0}
              onClick={() => handleGenerateXlsForSelected()}
              className="min-h-11 gap-2"
            >
              {!generatingXls && <FileSpreadsheet className="size-4" />}
              Generate .xls{selectedClaimIds.length > 0 ? ` (${selectedClaimIds.length})` : ""}
            </Button>
          </div>
        )}

        {/* Filter Controls */}
        <div className="filter-bar grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <div className="space-y-1">
            <label htmlFor="finance-status" className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider">
              Status
            </label>
            <Select
              id="finance-status"
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full"
            >
              <option value="ALL">All Statuses</option>
              <option value="PENDING_FINANCE_REVIEW">
                Pending Finance Approval
              </option>
              <option value="APPROVED_FOR_PAYMENT">
                Approved (Ready for XLS / XLS Created)
              </option>
              <option value="PAID">Processed / Processed</option>
            </Select>
          </div>

          <div className="space-y-1">
            <label htmlFor="finance-ministry" className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider">
              Ministry
            </label>
            <Select
              id="finance-ministry"
              value={selectedMinistry}
              onChange={(e) => setSelectedMinistry(e.target.value)}
              className="w-full"
            >
              <option value="ALL">All Teams</option>
              {ministries.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-1">
            <label htmlFor="finance-search" className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider">
              Search
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none w-3.5 h-3.5 text-zinc-400" />
              <input
                type="text"
                id="finance-search"
                placeholder="Search voucher (e.g. P260001), claim #, claimant, purpose..."
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
            <>
              <MobileClaimList
                claims={visibleClaims}
                baseHref="/finance/claims"
                showFinanceInfo={true}
              />
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-zinc-50/50 border-b border-zinc-100 dark:bg-zinc-900/50 dark:border-zinc-800 text-zinc-400 text-[10px] font-semibold uppercase tracking-wider">
                      <th className="py-2.5 px-3 w-10 text-center">
                        <input
                          type="checkbox"
                          aria-label="Select all approved claims for XLS generation"
                          checked={allApprovedSelected}
                          disabled={selectableApprovedIds.length === 0}
                          onChange={handleToggleSelectAllApproved}
                          className="rounded border-zinc-300"
                        />
                      </th>
                      <th className="py-2.5 px-4">Claim #</th>
                      <th className="py-2.5 px-4">Claimant</th>
                      <th className="py-2.5 px-4">Team</th>
                      <th className="py-2.5 px-4">Disbursement Voucher</th>
                      <th className="py-2.5 px-4">Purpose</th>
                      <th className="py-2.5 px-4 text-right">Amount (RM)</th>
                      <th className="py-2.5 px-4 text-center">
                        Status
                      </th>
                      <th className="py-2.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
                    {(visibleClaims || []).map((c) => {
                      const isEligibleForXls =
                        c.status === "APPROVED_FOR_PAYMENT" &&
                        !c.active_batch_id &&
                        !c.payment &&
                        evaluateClaimForReimbursement(c).eligible;
                      const isSelected = selectedClaimIds.includes(c.id);
                      const linkedBatch = c.active_batch_id
                        ? batchById.get(c.active_batch_id)
                        : null;

                      return (
                        <tr
                          key={c.id}
                          className={`hover:bg-zinc-50/70 dark:hover:bg-zinc-900/50 transition-colors ${
                            isSelected ? "bg-zinc-50" : ""
                          }`}
                        >
                          <td className="py-3 px-3 text-center">
                            {c.status === "APPROVED_FOR_PAYMENT" &&
                            !c.active_batch_id ? (
                              <input
                                type="checkbox"
                                checked={isSelected}
                                disabled={!isEligibleForXls}
                                onChange={() => handleToggleClaimSelection(c.id)}
                                title={
                                  isEligibleForXls
                                    ? "Select for .xls disbursement file"
                                    : "Missing bank details on claim"
                                }
                                className="rounded border-zinc-300"
                              />
                            ) : null}
                          </td>
                          <td className="py-3 px-4 font-mono font-medium text-zinc-900 dark:text-zinc-100">
                            <Link
                              href={`/finance/claims/${c.id}`}
                              className="hover:underline hover:text-emerald-700 dark:hover:text-emerald-400"
                            >
                              {c.claim_number}
                            </Link>
                          </td>
                          <td className="py-3 px-4 font-medium text-zinc-800 dark:text-zinc-200">
                            <div>
                              {c.claimant_name || c.claimant?.full_name || "-"}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-zinc-600 dark:text-zinc-400">
                            {c.ministry?.name}
                          </td>
                          <td className="py-3 px-4">
                            {c.disbursement_voucher ? (
                              <div className="flex flex-col">
                                <span className="font-mono text-xs font-semibold text-indigo-700 dark:text-indigo-400">
                                  {c.disbursement_voucher}
                                </span>
                                {c.disbursement_line_order ? (
                                  <span className="text-[10px] text-zinc-500">
                                    Row #{c.disbursement_line_order} in XLS
                                  </span>
                                ) : null}
                                {c.batch_number ? (
                                  <span className="text-[10px] font-mono text-zinc-400 truncate max-w-[120px]">
                                    {c.batch_number}
                                  </span>
                                ) : null}
                              </div>
                            ) : (
                              <span className="text-zinc-400 text-[11px]">-</span>
                            )}
                          </td>
                          <td className="py-3 px-4 max-w-xs">
                            <span className="font-medium text-zinc-800 dark:text-zinc-200 block truncate">
                              {c.purpose}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums">
                            {formatCurrency(c.total_amount)}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <div className="flex flex-col items-center gap-1">
                              <ClaimStatusBadge
                                status={c.status}
                                reimbursementStatus={c.reimbursement_status}
                              />
                              {linkedBatch && linkedBatch.status !== "SETTLED" && (
                                <Link
                                  href={`/finance/batches/${linkedBatch.id}`}
                                  className="text-[10px] font-mono text-amber-800 hover:underline"
                                >
                                  {linkedBatch.batch_number}.xls
                                </Link>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right w-px">
                            <div className="table-actions">
                              {c.status === "PENDING_FINANCE_REVIEW" &&
                                canApprove(c) && (
                                  <Button
                                    loading={approvingClaimId === c.id}
                                    disabled={approvingClaimId === c.id}
                                    onClick={() => handleQuickApprove(c)}
                                    className="min-h-11 gap-2"
                                  >
                                    {approvingClaimId !== c.id && (
                                      <CheckCircle2 className="w-3 h-3" />
                                    )}
                                    <span>Approve</span>
                                  </Button>
                                )}

                              {isEligibleForXls && (
                                <Button
                                  variant="outline"
                                  disabled={generatingXls}
                                  onClick={() => handleGenerateXlsForSelected([c.id])}
                                  className="min-h-11 gap-2"
                                >
                                  <FileSpreadsheet className="w-3 h-3" />
                                  <span>Generate .xls</span>
                                </Button>
                              )}

                              <Link href={`/finance/claims/${c.id}`} className={buttonVariants({ variant: "ghost", className: "min-h-11" })}>View
                              </Link>
                            </div>
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

        {pageCount > 1 && (
          <nav
            aria-label="Finance claims pages"
            className="flex items-center justify-between gap-3 text-sm text-zinc-600"
          >
            <span>
              Showing {(currentPage - 1) * pageSize + 1}–
              {Math.min(currentPage * pageSize, filtered.length)} of{" "}
              {filtered.length} claims (Page {currentPage} of {pageCount})
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={currentPage === 1}
                onClick={() => setPage(currentPage - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                disabled={currentPage === pageCount}
                onClick={() => setPage(currentPage + 1)}
              >
                Next
              </Button>
            </div>
          </nav>
        )}

      </>}

      {paymentClaim && (
        <PaymentModal
          open={!!paymentClaim}
          claim={paymentClaim}
          onConfirm={handlePaymentConfirm}
          onCancel={() => setPaymentClaim(null)}
          loading={loadingAction}
        />
      )}
    </div>
  );
}

export default function FinanceClaimsPage() {
  return (
    <AppLayout>
      <Suspense
        fallback={
          <div className="p-8 text-center text-xs">
            Loading finance claims...
          </div>
        }
      >
        <FinanceClaimsContent />
      </Suspense>
    </AppLayout>
  );
}
