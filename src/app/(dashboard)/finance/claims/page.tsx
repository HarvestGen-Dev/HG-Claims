"use client";

import { Select } from "@/components/ui/select";
import React, { useState, useEffect, Suspense, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Search,
  Banknote,
  ShieldCheck,
  Download,
  FileSpreadsheet,
  CheckCircle2,
  CheckSquare,
  ArrowRight,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ClaimStatusBadge } from "@/components/claims/ClaimStatusBadge";
import { MobileClaimList } from "@/components/claims/MobileClaimList";
import { PaymentModal } from "@/components/claims/PaymentModal";
import { useAuth } from "@/lib/auth/context";
import {
  claimsClient,
  financeClient,
  masterDataClient,
  workspaceStore,
} from "@/lib/domains";
import { Claim, ReimbursementBatch } from "@/lib/types/database";
import { evaluateClaimForReimbursement } from "@/lib/banking/bank-export-adapter";
import { formatCurrency, formatDate } from "@/lib/utils/formatters";
import { generateClaimsCsv, downloadCsv } from "@/lib/utils/export-csv";
import { showToast } from "@/lib/utils/toast";

function FinanceClaimsContent() {
  const { user, canApprove } = useAuth();
  const searchParams = useSearchParams();
  const statusParam = searchParams.get("status") || "ALL";

  const [claims, setClaims] = useState<Claim[]>([]);
  const [batches, setBatches] = useState<ReimbursementBatch[]>([]);
  const [selectedStatus, setSelectedStatus] = useState(statusParam);
  const [selectedMinistry, setSelectedMinistry] = useState("ALL");
  const [search, setSearch] = useState("");

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
    return workspaceStore.subscribe(sync);
  }, [user]);

  const batchById = useMemo(() => {
    return new Map(batches.map((b) => [b.id, b]));
  }, [batches]);

  const filtered = useMemo(() => {
    return claims.filter((c) => {
      if (selectedStatus !== "ALL" && c.status !== selectedStatus) return false;
      if (selectedMinistry !== "ALL" && c.ministry_id !== selectedMinistry)
        return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          (c.claim_number && c.claim_number.toLowerCase().includes(q)) ||
          (c.claimant_name && c.claimant_name.toLowerCase().includes(q)) ||
          (c.claimant?.full_name &&
            c.claimant.full_name.toLowerCase().includes(q)) ||
          (c.submitted_by?.full_name &&
            c.submitted_by.full_name.toLowerCase().includes(q)) ||
          c.purpose.toLowerCase().includes(q) ||
          (c.payment?.payment_reference &&
            c.payment.payment_reference.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [claims, selectedStatus, selectedMinistry, search]);

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
        mark_exported: true,
        notes: "Generated Alliance Bank .xls disbursement file",
      });
      setSelectedClaimIds([]);
      await Promise.all([
        workspaceStore.refreshDomain("/api/v1/finance"),
        workspaceStore.refreshDomain("/api/v1/claims"),
      ]);
      showToast.success(
        `XLS file (${created.batch_number}.xls) created for ${ids.length} claim(s). Once bank disbursement is done, click "Mark .xls as Disbursed".`,
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

  const handleMarkBatchDisbursed = async (batch: ReimbursementBatch) => {
    if (disbursingBatchId) return;
    setDisbursingBatchId(batch.id);
    try {
      await financeClient.disburseReimbursementBatch({
        batch_id: batch.id,
        bank_reference: batch.batch_number,
      });
      await Promise.all([
        workspaceStore.refreshDomain("/api/v1/finance"),
        workspaceStore.refreshDomain("/api/v1/claims"),
      ]);
      showToast.success(
        `${batch.batch_number}.xls marked as Disbursed. All ${batch.claim_count} linked claim(s) are now marked as Disbursed!`,
        "Disbursement Complete"
      );
    } catch (err: any) {
      showToast.error(
        err?.message || "Failed to mark .xls file as disbursed.",
        "Disbursement Error"
      );
    } finally {
      setDisbursingBatchId(null);
    }
  };

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

  const activeXlsBatches = batches.filter((b) => b.status !== "VOIDED");

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-2 border-b border-zinc-200/80 dark:border-zinc-800">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            Reimbursements
          </h1>
          <p className="text-xs text-zinc-500">
            Approve claims, select or bulk-select approved claims to generate the
            Alliance Bank <code>.xls</code> file, and mark generated{" "}
            <code>.xls</code> files as Disbursed.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {selectableApprovedIds.length > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleToggleSelectAllApproved}
              className="h-8 gap-1.5 text-xs border-zinc-300"
            >
              <CheckSquare className="w-3.5 h-3.5" />
              <span>
                {allApprovedSelected
                  ? `Deselect All (${selectableApprovedIds.length})`
                  : `Select All Ready (${selectableApprovedIds.length})`}
              </span>
            </Button>
          )}

          <Button
            type="button"
            size="sm"
            loading={generatingXls}
            disabled={generatingXls || selectedClaimIds.length === 0}
            onClick={() => handleGenerateXlsForSelected()}
            className="h-8 gap-1.5 bg-zinc-900 hover:bg-zinc-800 text-white text-xs"
          >
            {!generatingXls && <FileSpreadsheet className="w-3.5 h-3.5" />}
            <span>
              Generate .xls File ({selectedClaimIds.length} Selected)
            </span>
          </Button>

          <Link href="/finance/batches">
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 border-zinc-200 text-zinc-700 hover:bg-zinc-50 text-xs"
            >
              <Banknote className="w-3.5 h-3.5" />
              <span>XLS Batches View</span>
            </Button>
          </Link>

          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            className="h-8 gap-1.5 border-zinc-200 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 text-xs"
          >
            <Download className="w-3.5 h-3.5 text-zinc-400" />
            <span>CSV</span>
          </Button>
        </div>
      </div>

      {/* Simple Workflow Pipeline Banner */}
      <div className="brand-workflow p-4 rounded-xl bg-zinc-50 border border-zinc-200/80 text-xs flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-zinc-700">
          <span className="font-semibold text-zinc-900">Simple Workflow:</span>
          <span className="px-2 py-0.5 rounded bg-card text-foreground border border-border font-medium">
            1. Claimant Submits
          </span>
          <ArrowRight className="w-3 h-3 text-zinc-400" />
          <span className="px-2 py-0.5 rounded bg-card text-foreground border border-border font-medium">
            2. Finance / Admin Approves
          </span>
          <ArrowRight className="w-3 h-3 text-zinc-400" />
          <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-900 border border-amber-200 font-medium">
            3. Select &amp; Generate .xls (&ldquo;XLS File Created&rdquo;)
          </span>
          <ArrowRight className="w-3 h-3 text-zinc-400" />
          <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-900 border border-emerald-200 font-medium">
            4. Mark .xls File as Disbursed
          </span>
        </div>
      </div>

      {/* Generated .xls Disbursement Files Section */}
      {activeXlsBatches.length > 0 && (
        <div className="rounded-xl border border-zinc-200/90 bg-white dark:border-zinc-800 dark:bg-zinc-950 shadow-2xs overflow-hidden">
          <div className="py-2.5 px-4 bg-zinc-50/80 border-b border-zinc-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-zinc-900" />
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-900">
                Generated .xls Disbursement Files ({activeXlsBatches.length})
              </span>
            </div>
            <span className="text-[11px] text-zinc-500">
              Click &ldquo;Mark .xls as Disbursed&rdquo; once bank transfer is
              completed to automatically mark all linked claims as Disbursed
            </span>
          </div>
          <div className="divide-y divide-zinc-100">
            {activeXlsBatches.map((batch) => {
              const isDisbursed = batch.status === "SETTLED";
              const linkedClaims = (batch.instructions || []).flatMap(
                (inst) => inst.claims || []
              );
              return (
                <div
                  key={batch.id}
                  className="p-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 hover:bg-zinc-50/50"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link
                        href={`/finance/batches/${batch.id}`}
                        className="font-mono font-bold text-xs text-zinc-900 hover:underline"
                      >
                        {batch.batch_number}.xls
                      </Link>
                      {isDisbursed ? (
                        <Badge className="bg-emerald-600 text-white text-[10px]">
                          Disbursed
                        </Badge>
                      ) : (
                        <Badge className="bg-amber-100 text-amber-900 border border-amber-300 text-[10px]">
                          XLS File Created
                        </Badge>
                      )}
                      <span className="text-xs font-mono font-semibold text-zinc-900">
                        {formatCurrency(batch.total_amount)}
                      </span>
                      <span className="text-[11px] text-zinc-500">
                        ({batch.claim_count} claim
                        {batch.claim_count === 1 ? "" : "s"} &rarr;{" "}
                        {batch.transfer_count} bank transfer
                        {batch.transfer_count === 1 ? "" : "s"})
                      </span>
                      <span className="text-[10px] text-zinc-400">
                        &bull; Created {formatDate(batch.created_at)}
                      </span>
                    </div>

                    {linkedClaims.length > 0 && (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] text-zinc-400 uppercase font-semibold">
                          Claims in this .xls:
                        </span>
                        {linkedClaims.map((ic) => (
                          <Link
                            key={ic.id}
                            href={`/finance/claims/${ic.claim_id}`}
                            className="px-1.5 py-0.5 rounded bg-zinc-100 hover:bg-zinc-200 font-mono text-[10px] text-zinc-800"
                          >
                            {ic.claim?.claim_number || ic.claim_id.slice(0, 8)}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        window.location.assign(
                          `/api/v1/finance/batches/${batch.id}/export`
                        )
                      }
                      className="h-7 text-xs gap-1"
                    >
                      <Download className="w-3 h-3" />
                      <span>Download .xls</span>
                    </Button>

                    {!isDisbursed && (
                      <Button
                        type="button"
                        size="sm"
                        loading={disbursingBatchId === batch.id}
                        disabled={disbursingBatchId === batch.id}
                        onClick={() => handleMarkBatchDisbursed(batch)}
                        className="h-7 text-xs bg-emerald-700 hover:bg-emerald-800 text-white gap-1 font-semibold"
                      >
                        {disbursingBatchId !== batch.id && (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        )}
                        <span>Mark .xls as Disbursed</span>
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
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
            <option value="PAID">Disbursed / Paid Out</option>
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
            <option value="ALL">All Ministries</option>
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
              placeholder="Search claimant, submitter, purpose..."
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
              claims={filtered}
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
                    <th className="py-2.5 px-4">Claimant &amp; Bank</th>
                    <th className="py-2.5 px-4">Submitter</th>
                    <th className="py-2.5 px-4">Ministry</th>
                    <th className="py-2.5 px-4">Purpose</th>
                    <th className="py-2.5 px-4 text-right">Amount (RM)</th>
                    <th className="py-2.5 px-4 text-center">
                      Status / XLS Flag
                    </th>
                    <th className="py-2.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
                  {(filtered || []).map((c) => {
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
                          <div className="text-[10px] text-zinc-400 font-mono">
                            {c.bank_code || c.bank_name || "No bank"}
                            {c.bank_account_number
                              ? ` · ${c.bank_account_number}`
                              : ""}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-zinc-600 dark:text-zinc-400">
                          {c.submitted_by?.full_name || "-"}
                        </td>
                        <td className="py-3 px-4 text-zinc-600 dark:text-zinc-400">
                          {c.ministry?.name}
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
                            {linkedBatch && (
                              <Link
                                href={`/finance/batches/${linkedBatch.id}`}
                                className="text-[10px] font-mono text-amber-800 hover:underline"
                              >
                                {linkedBatch.batch_number}.xls
                              </Link>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right space-x-1.5 whitespace-nowrap">
                          {c.status === "PENDING_FINANCE_REVIEW" &&
                            canApprove(c) && (
                              <Button
                                size="sm"
                                loading={approvingClaimId === c.id}
                                disabled={approvingClaimId === c.id}
                                onClick={() => handleQuickApprove(c)}
                                className="h-7 text-xs bg-zinc-900 hover:bg-zinc-800 text-white gap-1 shadow-2xs font-medium px-2.5"
                              >
                                {approvingClaimId !== c.id && (
                                  <CheckCircle2 className="w-3 h-3" />
                                )}
                                <span>Approve</span>
                              </Button>
                            )}

                          {isEligibleForXls && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={generatingXls}
                              onClick={() => handleGenerateXlsForSelected([c.id])}
                              className="h-7 text-xs border-zinc-300 text-zinc-900 hover:bg-zinc-100 gap-1 font-medium px-2.5"
                            >
                              <FileSpreadsheet className="w-3 h-3" />
                              <span>Generate .xls</span>
                            </Button>
                          )}

                          <Link href={`/finance/claims/${c.id}`}>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 px-2"
                            >
                              View
                            </Button>
                          </Link>
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
