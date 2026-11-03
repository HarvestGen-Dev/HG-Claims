"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FileSpreadsheet,
  Layers,
  CheckCircle2,
  AlertTriangle,
  Search,
  ChevronDown,
  ChevronRight,
  Download,
  Lock,
  ArrowRight,
  ShieldAlert,
  Landmark,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth/context";
import { financeClient, masterDataClient, workspaceStore } from "@/lib/domains";
import type { Claim, ReimbursementBatch } from "@/lib/types/database";
import {
  evaluateClaimForReimbursement,
  previewReimbursementSelection,
} from "@/lib/banking/bank-export-adapter";
import { maskBankAccountNumber } from "@/lib/constants/banks";
import { formatCurrency, formatDate } from "@/lib/utils/formatters";
import { showToast } from "@/lib/utils/toast";

export default function FinanceBatchesPage() {
  const router = useRouter();
  const { user, hasRole } = useAuth();
  const isFinanceOrAdmin = hasRole("FINANCE_OFFICER") || hasRole("SYSTEM_ADMIN");

  const [activeTab, setActiveTab] = useState<"queue" | "batches">("queue");
  const [eligibleClaims, setEligibleClaims] = useState<Claim[]>([]);
  const [batches, setBatches] = useState<ReimbursementBatch[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [initializedSelection, setInitializedSelection] = useState(false);

  const [search, setSearch] = useState("");
  const [selectedMinistry, setSelectedMinistry] = useState("ALL");
  const [expandedInstructionLines, setExpandedInstructionLines] = useState<number[]>([]);

  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [batchNotes, setBatchNotes] = useState("");
  const [finalizing, setFinalizing] = useState(false);
  const [finalizeError, setFinalizeError] = useState("");
  const [disbursingBatchId, setDisbursingBatchId] = useState<string | null>(null);

  const ministries = masterDataClient.getMinistries();

  useEffect(() => {
    if (!user) return;
    const sync = () => {
      const nextEligible = financeClient.getEligibleClaimsForReimbursement();
      setEligibleClaims(nextEligible);
      setBatches(financeClient.getReimbursementBatches());

      if (!initializedSelection && nextEligible.length > 0) {
        const defaultIds = nextEligible
          .filter((c) => evaluateClaimForReimbursement(c).eligible)
          .map((c) => c.id);
        setSelectedIds(defaultIds);
        setInitializedSelection(true);
      } else {
        setSelectedIds((prev) =>
          prev.filter((id) => nextEligible.some((c) => c.id === id))
        );
      }
    };
    sync();
    return workspaceStore.subscribe(sync);
  }, [user, initializedSelection]);

  const filteredClaims = useMemo(() => {
    return eligibleClaims.filter((c) => {
      if (selectedMinistry !== "ALL" && c.ministry_id !== selectedMinistry) {
        return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          (c.claim_number && c.claim_number.toLowerCase().includes(q)) ||
          (c.claimant_name && c.claimant_name.toLowerCase().includes(q)) ||
          (c.bank_name && c.bank_name.toLowerCase().includes(q)) ||
          c.purpose.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [eligibleClaims, selectedMinistry, search]);

  const preview = useMemo(() => {
    return previewReimbursementSelection(eligibleClaims, selectedIds);
  }, [eligibleClaims, selectedIds]);

  const evalByClaimId = useMemo(() => {
    return new Map(preview.evaluatedClaims.map((ev) => [ev.claimId, ev]));
  }, [preview.evaluatedClaims]);

  const visibleSelectableIds = useMemo(() => {
    return filteredClaims
      .filter((c) => evalByClaimId.get(c.id)?.eligible)
      .map((c) => c.id);
  }, [filteredClaims, evalByClaimId]);

  const allVisibleSelected =
    visibleSelectableIds.length > 0 &&
    visibleSelectableIds.every((id) => selectedIds.includes(id));

  const handleToggleSelectAllVisible = () => {
    if (allVisibleSelected) {
      setSelectedIds((prev) =>
        prev.filter((id) => !visibleSelectableIds.includes(id))
      );
    } else {
      setSelectedIds((prev) =>
        Array.from(new Set([...prev, ...visibleSelectableIds]))
      );
    }
  };

  const handleToggleClaim = (claimId: string) => {
    const ev = evalByClaimId.get(claimId);
    if (!ev?.eligible) return;
    setSelectedIds((prev) =>
      prev.includes(claimId)
        ? prev.filter((id) => id !== claimId)
        : [...prev, claimId]
    );
  };

  const toggleExpandLine = (lineOrder: number) => {
    setExpandedInstructionLines((prev) =>
      prev.includes(lineOrder)
        ? prev.filter((l) => l !== lineOrder)
        : [...prev, lineOrder]
    );
  };

  const handleFinalizeBatch = async () => {
    if (preview.selectedEligibleClaims.length === 0) return;
    setFinalizing(true);
    setFinalizeError("");
    try {
      const created = await financeClient.finalizeReimbursementBatch({
        claim_ids: preview.selectedEligibleClaims.map((c) => c.claimId),
        preview_digest: preview.previewDigest,
        mark_exported: true,
        notes: batchNotes.trim() || undefined,
      });
      await Promise.all([
        workspaceStore.refreshDomain("/api/v1/finance"),
        workspaceStore.refreshDomain("/api/v1/claims"),
      ]);
      setConfirmModalOpen(false);
      setBatchNotes("");
      setActiveTab("batches");
      showToast.success(
        `XLS file (${created.batch_number}.xls) created with ${preview.totalTransfers} bank transfer(s). Once disbursed, click "Mark .xls as Disbursed".`,
        "XLS File Created"
      );
      window.location.assign(`/api/v1/finance/batches/${created.id}/export`);
    } catch (err) {
      setFinalizeError(
        err instanceof Error
          ? err.message
          : "Unable to generate reimbursement XLS file. Another officer may have modified one of the claims."
      );
    } finally {
      setFinalizing(false);
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
    } catch (err) {
      showToast.error(
        err instanceof Error ? err.message : "Failed to mark .xls file as disbursed.",
        "Disbursement Error"
      );
    } finally {
      setDisbursingBatchId(null);
    }
  };

  if (!isFinanceOrAdmin) {
    return (
      <AppLayout>
        <div className="p-8 text-center text-xs text-red-600">
          Finance Officer or System Administrator access is required to manage bulk reimbursement batches.
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-zinc-200/80 dark:border-zinc-800">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-zinc-900 dark:text-zinc-100" />
              Bank Batches
            </h1>
            <p className="text-xs text-zinc-500 mt-0.5">
              Select approved claims, preview consolidated beneficiary transfers, export Alliance Bank BIFF8 (.xls) files, and reconcile bank settlements.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link href="/finance/claims">
              <Button variant="outline" size="sm" className="h-8 text-xs">
                All Claims Queue
              </Button>
            </Link>
          </div>
        </div>

        {/* Policy Banner */}
        <div className="p-3 rounded-xl bg-amber-50/90 border border-amber-200/80 text-amber-950 text-xs flex items-start gap-2.5">
          <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <strong className="font-semibold">Audit & Settlement Control:</strong>{" "}
            Creating a batch or downloading an Alliance Bank <code>.xls</code> file reserves claims and freezes their payout snapshot, but <strong>does not mark claims as Paid</strong>. Claims transition to <code>PAID</code> only after bank confirmation is recorded during batch reconciliation.
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-zinc-200">
          <button
            type="button"
            onClick={() => setActiveTab("queue")}
            className={`pb-2.5 px-4 text-xs font-semibold border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === "queue"
                ? "border-zinc-900 text-zinc-900"
                : "border-transparent text-zinc-500 hover:text-zinc-800"
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            Approved — Awaiting Reimbursement ({eligibleClaims.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("batches")}
            className={`pb-2.5 px-4 text-xs font-semibold border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === "batches"
                ? "border-zinc-900 text-zinc-900"
                : "border-transparent text-zinc-500 hover:text-zinc-800"
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Reimbursement Batches ({batches.length})
          </button>
        </div>

        {activeTab === "queue" && (
          <div className="space-y-5">
            {/* Summary Metrics Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div className="p-3 rounded-xl border border-zinc-200 bg-white">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 block">
                  Selected Claims
                </span>
                <span className="text-lg font-bold text-zinc-900 tabular-nums">
                  {preview.totalSelectedClaims}
                </span>
                <span className="text-[10px] text-zinc-400 block">
                  of {eligibleClaims.length} awaiting payout
                </span>
              </div>

              <div className="p-3 rounded-xl border border-zinc-200 bg-white">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 block">
                  Bank Transfers
                </span>
                <span className="text-lg font-bold text-zinc-900 tabular-nums">
                  {preview.totalTransfers}
                </span>
                <span className="text-[10px] text-zinc-400 block">
                  Grouped by payee + bank
                </span>
              </div>

              <div className="p-3 rounded-xl border border-zinc-200 bg-zinc-900 text-white">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 block">
                  Batch Total (MYR)
                </span>
                <span className="text-lg font-bold font-mono text-emerald-400 tabular-nums">
                  {formatCurrency(preview.totalAmount)}
                </span>
                <span className="text-[10px] text-zinc-400 block">
                  Exact cent sum
                </span>
              </div>

              <div className="p-3 rounded-xl border border-zinc-200 bg-white">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 block">
                  Excluded (Unchecked)
                </span>
                <span className="text-lg font-bold text-zinc-700 tabular-nums">
                  {preview.excludedClaimIds.length}
                </span>
                <span className="text-[10px] text-zinc-400 block">
                  Remains eligible later
                </span>
              </div>

              <div className="p-3 rounded-xl border border-zinc-200 bg-white">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 block">
                  Blocked / Invalid
                </span>
                <span className="text-lg font-bold text-rose-600 tabular-nums">
                  {preview.evaluatedClaims.filter((c) => !c.eligible).length}
                </span>
                <span className="text-[10px] text-zinc-400 block">
                  Needs bank details fix
                </span>
              </div>
            </div>

            {/* Filters + Action Bar */}
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 flex-1 max-w-xl">
                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider">
                    Filter Ministry
                  </label>
                  <select
                    value={selectedMinistry}
                    onChange={(e) => setSelectedMinistry(e.target.value)}
                    className="h-8 w-full rounded-lg border border-zinc-200 bg-white px-2.5 text-xs"
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
                    Search Eligible Claims
                  </label>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-zinc-400" />
                    <input
                      type="text"
                      placeholder="Claim #, claimant, bank, purpose..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="h-8 w-full pl-8 pr-2.5 text-xs rounded-lg border border-zinc-200 bg-white"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleToggleSelectAllVisible}
                  disabled={visibleSelectableIds.length === 0}
                  className="h-8 text-xs"
                >
                  {allVisibleSelected
                    ? `Deselect Visible (${visibleSelectableIds.length})`
                    : `Select All Visible Eligible (${visibleSelectableIds.length})`}
                </Button>

                <Button
                  type="button"
                  size="sm"
                  disabled={
                    preview.totalSelectedClaims === 0 ||
                    preview.blockedClaims.length > 0
                  }
                  onClick={() => {
                    setFinalizeError("");
                    setConfirmModalOpen(true);
                  }}
                  className="h-8 bg-zinc-900 hover:bg-zinc-800 text-white text-xs gap-1.5"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>
                    Generate &amp; Download .xls ({preview.totalSelectedClaims} Claims &rarr;{" "}
                    {preview.totalTransfers} Transfers)
                  </span>
                </Button>
              </div>
            </div>

            {/* Eligible Claims Selection Table */}
            <Card className="border-zinc-200/80 shadow-2xs overflow-hidden">
              <CardHeader className="py-2.5 px-4 bg-zinc-50/70 border-b border-zinc-100 flex flex-row items-center justify-between">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-zinc-800">
                  1. Select Approved Claims for Reimbursement
                </CardTitle>
                <span className="text-[11px] text-zinc-500">
                  Uncheck any claim to exclude it from this run
                </span>
              </CardHeader>
              <CardContent className="p-0">
                {filteredClaims.length === 0 ? (
                  <div className="py-12 text-center text-xs text-zinc-400">
                    No unbatched approved claims awaiting reimbursement match your filter.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-zinc-50/40 border-b border-zinc-100 text-zinc-400 text-[10px] font-semibold uppercase tracking-wider">
                          <th className="py-2.5 px-3 w-10 text-center">
                            <input
                              type="checkbox"
                              aria-label="Select all visible eligible claims"
                              checked={allVisibleSelected}
                              onChange={handleToggleSelectAllVisible}
                              disabled={visibleSelectableIds.length === 0}
                              className="rounded border-zinc-300"
                            />
                          </th>
                          <th className="py-2.5 px-3">Claim #</th>
                          <th className="py-2.5 px-3">Beneficiary / Claimant</th>
                          <th className="py-2.5 px-3">Bank & SWIFT Code</th>
                          <th className="py-2.5 px-3">Masked Account</th>
                          <th className="py-2.5 px-3">Ministry & Purpose</th>
                          <th className="py-2.5 px-3 text-right">Approved (RM)</th>
                          <th className="py-2.5 px-3 text-center">Eligibility</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {filteredClaims.map((claim) => {
                          const ev = evalByClaimId.get(claim.id)!;
                          const isSelected = selectedIds.includes(claim.id);
                          return (
                            <tr
                              key={claim.id}
                              onClick={() => ev.eligible && handleToggleClaim(claim.id)}
                              className={`transition-colors ${
                                !ev.eligible
                                  ? "bg-rose-50/40"
                                  : isSelected
                                  ? "bg-zinc-50/90 hover:bg-zinc-100/70 cursor-pointer"
                                  : "hover:bg-zinc-50/60 cursor-pointer opacity-70"
                              }`}
                            >
                              <td
                                className="py-2.5 px-3 text-center"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  disabled={!ev.eligible}
                                  onChange={() => handleToggleClaim(claim.id)}
                                  className="rounded border-zinc-300"
                                />
                              </td>
                              <td
                                className="py-2.5 px-3 font-mono font-medium text-zinc-900"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Link
                                  href={`/finance/claims/${claim.id}`}
                                  className="hover:underline"
                                >
                                  {claim.claim_number}
                                </Link>
                              </td>
                              <td className="py-2.5 px-3">
                                <div className="font-medium text-zinc-900">
                                  {ev.beneficiaryName || claim.claimant_name}
                                </div>
                                <div className="text-[10px] text-zinc-400">
                                  {claim.claimant_email || claim.submitted_by?.email}
                                </div>
                              </td>
                              <td className="py-2.5 px-3">
                                {ev.bankCode ? (
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-medium text-zinc-800">
                                      {ev.bankName}
                                    </span>
                                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-800 font-semibold">
                                      {ev.bankCode} &middot; {ev.paymentMode}
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-rose-600 font-medium">
                                    {ev.bankName || "Missing Bank"}
                                  </span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 font-mono text-zinc-700">
                                {ev.maskedAccountNumber}
                              </td>
                              <td className="py-2.5 px-3 max-w-xs">
                                <div className="text-[10px] font-semibold text-zinc-500">
                                  {claim.ministry?.name}
                                </div>
                                <div className="truncate text-zinc-700">
                                  {claim.purpose}
                                </div>
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-semibold text-zinc-900 tabular-nums">
                                {formatCurrency(claim.total_amount)}
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                {ev.eligible ? (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                                    <CheckCircle2 className="w-3 h-3" />
                                    Eligible
                                  </span>
                                ) : (
                                  <div className="text-left space-y-0.5">
                                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-rose-800 bg-rose-100 border border-rose-200 px-2 py-0.5 rounded-full">
                                      <AlertTriangle className="w-3 h-3" />
                                      Blocked
                                    </span>
                                    <p className="text-[10px] text-rose-700 leading-tight">
                                      {ev.blockers.join(" ")}
                                    </p>
                                  </div>
                                )}
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

            {/* Proposed Consolidated Bank Transfer Rows Preview */}
            {preview.proposedInstructions.length > 0 && (
              <Card className="border-zinc-200/80 shadow-2xs overflow-hidden">
                <CardHeader className="py-2.5 px-4 bg-zinc-900 text-white flex flex-row items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Landmark className="w-4 h-4 text-emerald-400" />
                    <CardTitle className="text-xs font-semibold uppercase tracking-wider text-white">
                      2. Proposed Alliance Bank Transfer Rows Preview ({preview.totalTransfers} Rows)
                    </CardTitle>
                  </div>
                  <span className="text-[11px] font-mono text-emerald-300">
                    Total: {formatCurrency(preview.totalAmount)}
                  </span>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-zinc-50 border-b border-zinc-200 text-zinc-500 text-[10px] font-semibold uppercase tracking-wider">
                          <th className="py-2.5 px-3 w-8" />
                          <th className="py-2.5 px-3">Mode</th>
                          <th className="py-2.5 px-3">Beneficiary Name</th>
                          <th className="py-2.5 px-3">Masked Account</th>
                          <th className="py-2.5 px-3">Bank Code (SWIFT)</th>
                          <th className="py-2.5 px-3">Payment Desc (Preview)</th>
                          <th className="py-2.5 px-3 text-center">Claims Grouped</th>
                          <th className="py-2.5 px-3 text-right">Transfer Amount (RM)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {preview.proposedInstructions.map((inst) => {
                          const isExpanded = expandedInstructionLines.includes(
                            inst.lineOrder
                          );
                          return (
                            <React.Fragment key={inst.lineOrder}>
                              <tr
                                onClick={() => toggleExpandLine(inst.lineOrder)}
                                className="hover:bg-zinc-50/80 cursor-pointer"
                              >
                                <td className="py-2.5 px-3 text-zinc-400">
                                  {isExpanded ? (
                                    <ChevronDown className="w-4 h-4" />
                                  ) : (
                                    <ChevronRight className="w-4 h-4" />
                                  )}
                                </td>
                                <td className="py-2.5 px-3">
                                  <span
                                    className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded ${
                                      inst.paymentMode === "LIP"
                                        ? "bg-blue-50 text-blue-800 border border-blue-200"
                                        : "bg-zinc-100 text-zinc-800 border border-zinc-200"
                                    }`}
                                  >
                                    {inst.paymentMode}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 font-semibold text-zinc-900">
                                  {inst.beneficiaryName}
                                </td>
                                <td className="py-2.5 px-3 font-mono text-zinc-700">
                                  {maskBankAccountNumber(
                                    inst.beneficiaryAccountNumber
                                  )}
                                </td>
                                <td className="py-2.5 px-3">
                                  <span className="font-mono font-semibold text-zinc-900">
                                    {inst.beneficiaryBankCode}
                                  </span>{" "}
                                  <span className="text-[11px] text-zinc-500">
                                    ({inst.beneficiaryBankName})
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 font-mono text-zinc-600">
                                  {inst.paymentDescription}{" "}
                                  <span className="text-[10px] text-zinc-400">
                                    (assigned on finalize)
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 text-center">
                                  <Badge className="bg-zinc-900 text-white text-[10px]">
                                    {inst.claimIds.length}{" "}
                                    {inst.claimIds.length === 1
                                      ? "Claim"
                                      : "Claims"}
                                  </Badge>
                                </td>
                                <td className="py-2.5 px-3 text-right font-mono font-bold text-zinc-900 tabular-nums">
                                  {formatCurrency(inst.amount)}
                                </td>
                              </tr>
                              {isExpanded && (
                                <tr className="bg-zinc-50/70">
                                  <td colSpan={8} className="p-3 pl-10">
                                    <div className="text-[11px] font-semibold text-zinc-600 mb-1.5">
                                      Source Claims Combined into Transfer Row #{inst.lineOrder}:
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                      {inst.claimIds.map((cid, idx) => (
                                        <Link
                                          key={cid}
                                          href={`/finance/claims/${cid}`}
                                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white border border-zinc-200 text-xs font-mono hover:border-zinc-400"
                                        >
                                          <span>{inst.claimNumbers[idx] || cid}</span>
                                          <ArrowRight className="w-3 h-3 text-zinc-400" />
                                        </Link>
                                      ))}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {activeTab === "batches" && (
          <Card className="border-zinc-200/80 shadow-2xs overflow-hidden">
            <CardContent className="p-0">
              {batches.length === 0 ? (
                <div className="py-16 text-center text-xs text-zinc-400">
                  No reimbursement batches have been finalized yet.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-zinc-50/60 border-b border-zinc-100 text-zinc-400 text-[10px] font-semibold uppercase tracking-wider">
                        <th className="py-2.5 px-4">Batch #</th>
                        <th className="py-2.5 px-4">Created</th>
                        <th className="py-2.5 px-4 text-center">Claims</th>
                        <th className="py-2.5 px-4 text-center">Bank Transfers</th>
                        <th className="py-2.5 px-4 text-right">Total (RM)</th>
                        <th className="py-2.5 px-4 text-center">Status</th>
                        <th className="py-2.5 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {batches.map((b) => (
                        <tr key={b.id} className="hover:bg-zinc-50/70">
                          <td className="py-3 px-4 font-mono font-semibold text-zinc-900">
                            <Link
                              href={`/finance/batches/${b.id}`}
                              className="hover:underline"
                            >
                              {b.batch_number}
                            </Link>
                          </td>
                          <td className="py-3 px-4 text-zinc-600">
                            <div>{formatDate(b.created_at)}</div>
                            <div className="text-[10px] text-zinc-400">
                              by {b.creator?.full_name || "Finance"}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-center font-mono">
                            {b.claim_count}
                          </td>
                          <td className="py-3 px-4 text-center font-mono">
                            {b.transfer_count}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-zinc-900 tabular-nums">
                            {formatCurrency(b.total_amount)}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <Badge
                              className={`text-[10px] ${
                                b.status === "SETTLED"
                                  ? "bg-emerald-600 text-white"
                                  : b.status === "VOIDED" || b.status === "REJECTED"
                                  ? "bg-rose-600 text-white"
                                  : "bg-amber-100 text-amber-900 border border-amber-300"
                              }`}
                            >
                              {b.status === "SETTLED"
                                ? "Disbursed"
                                : b.status === "VOIDED" || b.status === "REJECTED"
                                ? b.status
                                : "XLS File Created"}
                            </Badge>
                          </td>
                          <td className="py-3 px-4 text-right space-x-2 whitespace-nowrap">
                            {b.status !== "VOIDED" && (
                              <a
                                href={`/api/v1/finance/batches/${b.id}/export`}
                                className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md border border-zinc-200 bg-white hover:bg-zinc-50 text-xs font-medium text-zinc-800"
                              >
                                <Download className="w-3 h-3" />
                                <span>Download .xls</span>
                              </a>
                            )}
                            {!["SETTLED", "VOIDED", "REJECTED"].includes(b.status) && (
                              <Button
                                size="sm"
                                loading={disbursingBatchId === b.id}
                                disabled={disbursingBatchId === b.id}
                                onClick={() => handleMarkBatchDisbursed(b)}
                                className="h-7 text-xs bg-emerald-700 hover:bg-emerald-800 text-white gap-1 font-semibold"
                              >
                                {disbursingBatchId !== b.id && (
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                )}
                                <span>Mark .xls as Disbursed</span>
                              </Button>
                            )}
                            <Link href={`/finance/batches/${b.id}`}>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs"
                              >
                                Details
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
        )}

        {/* Finalize Confirmation Modal */}
        <Dialog open={confirmModalOpen} onOpenChange={setConfirmModalOpen}>
          <DialogHeader>
            <DialogTitle>Finalize & Freeze Reimbursement Batch</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 my-2 text-xs">
            <p className="text-zinc-600 leading-relaxed">
              You are about to reserve{" "}
              <strong>{preview.totalSelectedClaims} approved claim(s)</strong> into{" "}
              <strong>{preview.totalTransfers} consolidated bank transfer instruction(s)</strong>{" "}
              totalling <strong>{formatCurrency(preview.totalAmount)}</strong>.
            </p>
            <div className="p-3 rounded-lg bg-zinc-50 border border-zinc-200 space-y-1.5 text-[11px] text-zinc-700">
              <div>
                &bull; Allocates permanent annual running <code>Payment Description</code> IDs (e.g. <code>P260001</code>).
              </div>
              <div>
                &bull; Freezes beneficiary names, SWIFT codes, and account numbers for the BIFF8 <code>.xls</code> file.
              </div>
              <div>
                &bull; Unchecked claims ({preview.excludedClaimIds.length}) remain in the eligible queue for future runs.
              </div>
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-zinc-700 block">
                Batch Notes / Internal Reference (Optional)
              </label>
              <Input
                value={batchNotes}
                onChange={(e) => setBatchNotes(e.target.value)}
                placeholder="e.g. Weekly Ministry Reimbursement Run"
                className="h-9 text-xs"
              />
            </div>

            {finalizeError && (
              <div className="p-2.5 rounded bg-red-50 border border-red-200 text-red-700 text-xs">
                {finalizeError}
              </div>
            )}

            <DialogFooter className="mt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirmModalOpen(false)}
                disabled={finalizing}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleFinalizeBatch}
                loading={finalizing}
                disabled={finalizing}
                className="bg-zinc-900 hover:bg-zinc-800 text-white"
              >
                {finalizing ? "Generating .xls..." : "Generate & Download .xls File"}
              </Button>
            </DialogFooter>
          </div>
        </Dialog>
      </div>
    </AppLayout>
  );
}
