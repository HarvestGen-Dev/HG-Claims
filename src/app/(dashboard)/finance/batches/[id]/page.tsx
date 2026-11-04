"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Download,
  UploadCloud,
  CheckCircle2,
  XCircle,
  Ban,
  ShieldAlert,
  FileSpreadsheet,
  Hash,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth/context";
import { financeClient, workspaceStore } from "@/lib/domains";
import type {
  ReimbursementBatch,
  ReimbursementBatchInstruction,
} from "@/lib/types/database";
import { maskBankAccountNumber } from "@/lib/constants/banks";
import { formatCurrency, formatDate } from "@/lib/utils/formatters";
import { showToast } from "@/lib/utils/toast";

export default function FinanceBatchDetailPage() {
  const params = useParams<{ id: string }>();
  const batchId = params?.id || "";
  const { user, hasRole } = useAuth();
  const isFinanceOrAdmin = hasRole("FINANCE_OFFICER") || hasRole("SYSTEM_ADMIN");

  const [batch, setBatch] = useState<ReimbursementBatch | null>(null);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [bankUploadRef, setBankUploadRef] = useState("");
  const [voidModalOpen, setVoidModalOpen] = useState(false);
  const [voidReason, setVoidReason] = useState("");

  const [reconcileTarget, setReconcileTarget] = useState<{
    instruction: ReimbursementBatchInstruction;
    outcome: "PAID" | "FAILED";
  } | null>(null);
  const [bankReference, setBankReference] = useState("");
  const [paymentDate, setPaymentDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [failureReason, setFailureReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    if (!user || !batchId) return;
    const sync = () => {
      setBatch(financeClient.getReimbursementBatchById(batchId));
    };
    sync();
    return workspaceStore.subscribeDomains(["finance", "claims", "iam"], sync);
  }, [user, batchId]);

  const handleDownloadXls = async () => {
    if (!batch) return;
    window.location.assign(`/api/v1/finance/batches/${batch.id}/export`);
    setTimeout(() => {
      void workspaceStore.refreshDomain("/api/v1/finance");
    }, 1500);
  };

  const handleRecordBankUpload = async () => {
    if (!batch) return;
    setBusy(true);
    setActionError("");
    try {
      await financeClient.recordBatchBankUpload({
        batch_id: batch.id,
        bank_upload_reference: bankUploadRef.trim() || undefined,
      });
      setUploadModalOpen(false);
      setBankUploadRef("");
      showToast.success(
        "Batch marked as uploaded to Alliance Bank portal.",
        "Bank Upload Recorded"
      );
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to record bank upload."
      );
    } finally {
      setBusy(false);
    }
  };

  const handleReconcileInstruction = async () => {
    if (!reconcileTarget) return;
    setBusy(true);
    setActionError("");
    try {
      await financeClient.reconcileBatchInstruction({
        instruction_id: reconcileTarget.instruction.id,
        outcome: reconcileTarget.outcome,
        bank_reference:
          reconcileTarget.outcome === "PAID" ? bankReference.trim() : undefined,
        payment_date:
          reconcileTarget.outcome === "PAID" ? paymentDate : undefined,
        failure_reason:
          reconcileTarget.outcome === "FAILED"
            ? failureReason.trim()
            : undefined,
      });
      setReconcileTarget(null);
      setBankReference("");
      setFailureReason("");
      showToast.success(
        reconcileTarget.outcome === "PAID"
          ? `Transfer ${reconcileTarget.instruction.payment_description} confirmed PAID and linked claims settled.`
          : `Transfer ${reconcileTarget.instruction.payment_description} marked FAILED and linked claims released for correction.`,
        "Transfer Reconciled"
      );
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to reconcile transfer."
      );
    } finally {
      setBusy(false);
    }
  };

  const handleVoidBatch = async () => {
    if (!batch) return;
    setBusy(true);
    setActionError("");
    try {
      await financeClient.voidReimbursementBatch({
        batch_id: batch.id,
        void_reason: voidReason.trim(),
      });
      setVoidModalOpen(false);
      setVoidReason("");
      showToast.info(
        `Batch ${batch.batch_number} has been voided and all unpaid claims released back to the eligible queue.`,
        "Batch Voided"
      );
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to void batch."
      );
    } finally {
      setBusy(false);
    }
  };

  const handleMarkWholeBatchDisbursed = async () => {
    if (!batch || busy) return;
    setBusy(true);
    setActionError("");
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
        `${batch.batch_number}.xls marked as Disbursed. All ${batch.claim_count} linked claim(s) have been marked as Disbursed!`,
        "Disbursement Complete"
      );
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : "Failed to mark .xls file as disbursed."
      );
    } finally {
      setBusy(false);
    }
  };

  if (!isFinanceOrAdmin) {
    return (
      <AppLayout>
        <div className="p-8 text-center text-xs text-red-600">
          Finance Officer or System Administrator access is required.
        </div>
      </AppLayout>
    );
  }

  if (!batch) {
    return (
      <AppLayout>
        <div className="p-8 text-center text-xs text-zinc-500">
          Loading reimbursement batch details...
        </div>
      </AppLayout>
    );
  }

  const hasPaidRows = (batch.instructions || []).some(
    (inst) => inst.status === "PAID"
  );

  return (
    <AppLayout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-zinc-200/80 dark:border-zinc-800">
          <div className="flex items-center gap-3">
            <Link href="/finance/batches">
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold font-mono tracking-tight text-zinc-900 dark:text-zinc-100">
                  {batch.batch_number}
                </h1>
                <Badge
                  className={`text-[10px] ${
                    batch.status === "SETTLED"
                      ? "bg-emerald-600 text-white"
                      : batch.status === "VOIDED" || batch.status === "REJECTED"
                      ? "bg-rose-600 text-white"
                      : "bg-amber-100 text-amber-900 border border-amber-300"
                  }`}
                >
                  {batch.status === "SETTLED"
                    ? "Disbursed"
                    : batch.status === "VOIDED" || batch.status === "REJECTED"
                    ? batch.status
                    : "XLS File Created"}
                </Badge>
              </div>
              <p className="text-xs text-zinc-500 mt-0.5">
                Created {formatDate(batch.created_at)} by{" "}
                {batch.creator?.full_name || "Finance"} &middot; Template{" "}
                <code>{batch.template_version}</code>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {batch.status !== "VOIDED" && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadXls}
                className="h-8 text-xs gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Alliance Bank .xls (BIFF8)</span>
              </Button>
            )}

            {!["SETTLED", "VOIDED", "REJECTED"].includes(batch.status) && (
              <Button
                size="sm"
                loading={busy}
                disabled={busy}
                onClick={handleMarkWholeBatchDisbursed}
                className="h-8 bg-emerald-700 hover:bg-emerald-800 text-white text-xs gap-1.5 font-semibold"
              >
                {!busy && <CheckCircle2 className="w-3.5 h-3.5" />}
                <span>Mark .xls File as Disbursed</span>
              </Button>
            )}

            {["FINALIZED", "EXPORTED"].includes(batch.status) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setActionError("");
                  setUploadModalOpen(true);
                }}
                className="h-8 text-xs gap-1.5"
              >
                <UploadCloud className="w-3.5 h-3.5" />
                <span>Record Bank Upload</span>
              </Button>
            )}

            {!["SETTLED", "VOIDED"].includes(batch.status) && !hasPaidRows && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setActionError("");
                  setVoidModalOpen(true);
                }}
                className="h-8 text-xs text-rose-600 border-rose-200 hover:bg-rose-50 gap-1.5"
              >
                <Ban className="w-3.5 h-3.5" />
                <span>Void & Release Claims</span>
              </Button>
            )}
          </div>
        </div>

        {/* Warning Banner */}
        <div className="p-3 rounded-xl bg-amber-50/90 border border-amber-200/80 text-amber-950 text-xs flex items-start gap-2.5">
          <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <strong>Export Is Not Proof of Payment:</strong> Re-downloading the{" "}
            <code>.xls</code> file always returns the identical frozen binary snapshot and never regenerates <code>P26xxxx</code> references. Confirm each transfer row below as <strong>Paid</strong> (with the bank reference) or <strong>Failed</strong> (to release its claims for re-queueing).
          </div>
        </div>

        {/* Batch Metadata Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-xl border border-zinc-200 bg-white">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 block">
              Source Claims
            </span>
            <span className="text-lg font-bold text-zinc-900 tabular-nums">
              {batch.claim_count}
            </span>
          </div>

          <div className="p-3.5 rounded-xl border border-zinc-200 bg-white">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 block">
              Bank Transfer Rows
            </span>
            <span className="text-lg font-bold text-zinc-900 tabular-nums">
              {batch.transfer_count}
            </span>
          </div>

          <div className="p-3.5 rounded-xl border border-zinc-200 bg-zinc-900 text-white">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 block">
              Frozen Total (MYR)
            </span>
            <span className="text-lg font-bold font-mono text-emerald-400 tabular-nums">
              {formatCurrency(batch.total_amount)}
            </span>
          </div>

          <div className="p-3.5 rounded-xl border border-zinc-200 bg-white">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 block">
              Export SHA-256 / Bank Ref
            </span>
            <span className="text-[11px] font-mono text-zinc-700 block truncate">
              {batch.exported_file_hash_sha256
                ? `SHA256: ${batch.exported_file_hash_sha256.slice(0, 16)}...`
                : "Not exported yet"}
            </span>
            {batch.bank_upload_reference && (
              <span className="text-[10px] font-mono text-emerald-700 block truncate mt-0.5">
                Bank Portal Ref: {batch.bank_upload_reference}
              </span>
            )}
          </div>
        </div>

        {/* Payment Instructions & Reconciliation Table */}
        <Card className="border-zinc-200/80 shadow-2xs overflow-hidden">
          <CardHeader className="py-3 px-4 bg-zinc-50 border-b border-zinc-100 flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-zinc-700" />
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-zinc-900">
                Frozen Payment Instructions (Sheet1 Rows)
              </CardTitle>
            </div>
            <span className="text-[11px] text-zinc-500">
              Reconcile individual transfer outcomes below
            </span>
          </CardHeader>
          <CardContent className="p-0">
            {/* Mobile Card View for Frozen Instructions */}
            <div className="sm:hidden divide-y divide-zinc-200/80">
              {(batch.instructions || []).map((inst) => (
                <div key={inst.id} className="p-3.5 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono text-xs text-zinc-400">#{inst.line_order}</span>
                        <span className="inline-flex items-center gap-1 bg-zinc-100 px-2 py-0.5 rounded font-mono font-bold text-xs text-zinc-900">
                          <Hash className="w-3 h-3 text-zinc-400" />
                          {inst.payment_description}
                        </span>
                        <span
                          className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded ${
                            inst.payment_mode === "LIP"
                              ? "bg-blue-50 text-blue-800 border border-blue-200"
                              : "bg-zinc-100 text-zinc-800 border border-zinc-200"
                          }`}
                        >
                          {inst.payment_mode}
                        </span>
                      </div>
                      <p className="font-semibold text-xs text-zinc-900">{inst.beneficiary_name}</p>
                      <p className="font-mono text-[11px] text-zinc-600">
                        {inst.beneficiary_bank_code} &middot; {maskBankAccountNumber(inst.beneficiary_account_number)}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="font-mono font-bold text-sm text-zinc-900 tabular-nums block">
                        {formatCurrency(inst.amount)}
                      </span>
                      <Badge
                        className={`text-[10px] mt-0.5 ${
                          inst.status === "PAID"
                            ? "bg-emerald-600 text-white"
                            : inst.status === "FAILED" || inst.status === "VOIDED"
                            ? "bg-rose-600 text-white"
                            : "bg-zinc-800 text-white"
                        }`}
                      >
                        {inst.status}
                      </Badge>
                    </div>
                  </div>

                  {(inst.claims || []).length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      {(inst.claims || []).map((ic) => (
                        <Link
                          key={ic.id}
                          href={`/finance/claims/${ic.claim_id}`}
                          className="inline-flex items-center px-1.5 py-0.5 rounded bg-zinc-100 hover:bg-zinc-200 font-mono text-[10px] text-zinc-800"
                        >
                          {ic.claim?.claim_number || ic.claim_id.slice(0, 8)}
                        </Link>
                      ))}
                    </div>
                  )}

                  {!["PAID", "FAILED", "VOIDED"].includes(inst.status) && batch.status !== "VOIDED" && (
                    <div className="flex items-center gap-2 pt-2 border-t border-zinc-100">
                      <Button
                        size="sm"
                        onClick={() => {
                          setActionError("");
                          setBankReference("");
                          setReconcileTarget({
                            instruction: inst,
                            outcome: "PAID",
                          });
                        }}
                        className="flex-1 h-8 text-xs bg-emerald-700 hover:bg-emerald-800 text-white gap-1"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Mark Paid</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setActionError("");
                          setFailureReason("");
                          setReconcileTarget({
                            instruction: inst,
                            outcome: "FAILED",
                          });
                        }}
                        className="flex-1 h-8 text-xs text-rose-600 border-rose-200 hover:bg-rose-50 gap-1"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Failed</span>
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Desktop Table View for Frozen Instructions */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-zinc-50/40 border-b border-zinc-100 text-zinc-400 text-[10px] font-semibold uppercase tracking-wider">
                    <th className="py-2.5 px-3">#</th>
                    <th className="py-2.5 px-3">Payment Desc</th>
                    <th className="py-2.5 px-3">Mode</th>
                    <th className="py-2.5 px-3">Beneficiary Name</th>
                    <th className="py-2.5 px-3">Masked Account</th>
                    <th className="py-2.5 px-3">Bank Code</th>
                    <th className="py-2.5 px-3">Linked Claims</th>
                    <th className="py-2.5 px-3 text-right">Amount (RM)</th>
                    <th className="py-2.5 px-3 text-center">Status</th>
                    <th className="py-2.5 px-3 text-right">Reconciliation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {(batch.instructions || []).map((inst) => (
                    <tr key={inst.id} className="hover:bg-zinc-50/60">
                      <td className="py-3 px-3 font-mono text-zinc-400">
                        {inst.line_order}
                      </td>
                      <td className="py-3 px-3 font-mono font-bold text-zinc-900">
                        <span className="inline-flex items-center gap-1 bg-zinc-100 px-2 py-0.5 rounded">
                          <Hash className="w-3 h-3 text-zinc-400" />
                          {inst.payment_description}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded ${
                            inst.payment_mode === "LIP"
                              ? "bg-blue-50 text-blue-800 border border-blue-200"
                              : "bg-zinc-100 text-zinc-800 border border-zinc-200"
                          }`}
                        >
                          {inst.payment_mode}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-medium text-zinc-900">
                        {inst.beneficiary_name}
                      </td>
                      <td className="py-3 px-3 font-mono text-zinc-700">
                        {maskBankAccountNumber(inst.beneficiary_account_number)}
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-mono font-semibold text-zinc-900">
                          {inst.beneficiary_bank_code}
                        </div>
                        <div className="text-[10px] text-zinc-400">
                          {inst.beneficiary_bank_name}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex flex-wrap gap-1">
                          {(inst.claims || []).map((ic) => (
                            <Link
                              key={ic.id}
                              href={`/finance/claims/${ic.claim_id}`}
                              className="inline-flex items-center px-1.5 py-0.5 rounded bg-zinc-100 hover:bg-zinc-200 font-mono text-[10px] text-zinc-800"
                            >
                              {ic.claim?.claim_number ||
                                ic.claim_id.slice(0, 8)}
                            </Link>
                          ))}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-zinc-900 tabular-nums">
                        {formatCurrency(inst.amount)}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <div>
                          <Badge
                            className={`text-[10px] ${
                              inst.status === "PAID"
                                ? "bg-emerald-600 text-white"
                                : inst.status === "FAILED" ||
                                  inst.status === "VOIDED"
                                ? "bg-rose-600 text-white"
                                : "bg-zinc-800 text-white"
                            }`}
                          >
                            {inst.status}
                          </Badge>
                        </div>
                        {inst.bank_reference && (
                          <div className="text-[10px] font-mono text-emerald-700 mt-0.5">
                            Ref: {inst.bank_reference}
                          </div>
                        )}
                        {inst.failure_reason && (
                          <div className="text-[10px] text-rose-600 mt-0.5 max-w-[160px] mx-auto truncate">
                            {inst.failure_reason}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right w-px">
                        <div className="table-actions">
                          {!["PAID", "FAILED", "VOIDED"].includes(inst.status) &&
                            batch.status !== "VOIDED" && (
                              <>
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    setActionError("");
                                    setBankReference("");
                                    setReconcileTarget({
                                      instruction: inst,
                                      outcome: "PAID",
                                    });
                                  }}
                                  className="h-7 text-[11px] bg-emerald-700 hover:bg-emerald-800 text-white gap-1 px-2"
                                >
                                  <CheckCircle2 className="w-3 h-3" />
                                  <span>Mark Paid</span>
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setActionError("");
                                    setFailureReason("");
                                    setReconcileTarget({
                                      instruction: inst,
                                      outcome: "FAILED",
                                    });
                                  }}
                                  className="h-7 text-[11px] text-rose-600 border-rose-200 hover:bg-rose-50 gap-1 px-2"
                                >
                                  <XCircle className="w-3 h-3" />
                                  <span>Failed</span>
                                </Button>
                              </>
                            )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Record Bank Portal Upload Modal */}
        <Dialog open={uploadModalOpen} onOpenChange={setUploadModalOpen}>
          <DialogHeader>
            <DialogTitle>Record Alliance Bank Portal Upload</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 my-2 text-xs">
            <p className="text-zinc-600">
              Record that the exported BIFF8 <code>.xls</code> file for{" "}
              <strong>{batch.batch_number}</strong> has been manually uploaded to
              the Alliance Bank BizSmart / bulk payment portal.
            </p>
            <div className="space-y-1">
              <label className="font-semibold text-zinc-700 block">
                Bank Portal Batch / Upload Reference
              </label>
              <Input
                value={bankUploadRef}
                onChange={(e) => setBankUploadRef(e.target.value)}
                placeholder="e.g. ABMB-BULK-20261103-01"
                className="h-9 text-xs font-mono"
              />
            </div>
            {actionError && (
              <div className="p-2.5 bg-red-50 border border-red-200 rounded text-red-700">
                {actionError}
              </div>
            )}
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setUploadModalOpen(false)}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button
                onClick={handleRecordBankUpload}
                loading={busy}
                disabled={busy}
                className="bg-zinc-900 hover:bg-zinc-800 text-white"
              >
                Save Upload Status
              </Button>
            </DialogFooter>
          </div>
        </Dialog>

        {/* Reconcile Transfer Instruction Modal */}
        <Dialog
          open={!!reconcileTarget}
          onOpenChange={(open) => !open && setReconcileTarget(null)}
        >
          <DialogHeader>
            <DialogTitle>
              {reconcileTarget?.outcome === "PAID"
                ? `Confirm Bank Payout (${reconcileTarget.instruction.payment_description})`
                : `Mark Transfer Failed (${reconcileTarget?.instruction.payment_description})`}
            </DialogTitle>
          </DialogHeader>
          {reconcileTarget && (
            <div className="space-y-4 my-2 text-xs">
              <div className="p-3 rounded-lg bg-zinc-50 border border-zinc-200 space-y-1">
                <div className="flex justify-between">
                  <span className="text-zinc-500">Beneficiary:</span>
                  <strong className="text-zinc-900">
                    {reconcileTarget.instruction.beneficiary_name}
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Bank / Mode:</span>
                  <span className="font-mono">
                    {reconcileTarget.instruction.beneficiary_bank_code} (
                    {reconcileTarget.instruction.payment_mode})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Transfer Amount:</span>
                  <strong className="font-mono text-zinc-900">
                    {formatCurrency(reconcileTarget.instruction.amount)}
                  </strong>
                </div>
              </div>

              {reconcileTarget.outcome === "PAID" ? (
                <>
                  <div className="space-y-1">
                    <label className="font-semibold text-zinc-700 block">
                      Bank Confirmation / Transaction Reference{" "}
                      <span className="text-red-500">*</span>
                    </label>
                    <Input
                      value={bankReference}
                      onChange={(e) => setBankReference(e.target.value)}
                      placeholder="e.g. ABMB-TXN-9988123"
                      className="h-9 text-xs font-mono"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="font-semibold text-zinc-700 block">
                      Settlement Date <span className="text-red-500">*</span>
                    </label>
                    <Input
                      type="date"
                      value={paymentDate}
                      onChange={(e) => setPaymentDate(e.target.value)}
                      className="h-9 text-xs"
                      required
                    />
                  </div>
                </>
              ) : (
                <div className="space-y-1">
                  <label className="font-semibold text-zinc-700 block">
                    Bank Rejection / Failure Reason{" "}
                    <span className="text-red-500">*</span>
                  </label>
                  <Input
                    value={failureReason}
                    onChange={(e) => setFailureReason(e.target.value)}
                    placeholder="e.g. Account number closed / Beneficiary name mismatch"
                    className="h-9 text-xs"
                    required
                  />
                  <p className="text-[11px] text-zinc-500 pt-1">
                    Marking this transfer failed will release its{" "}
                    {reconcileTarget.instruction.claim_count} linked claim(s)
                    from this batch so their banking details can be corrected
                    and included in a future reimbursement batch.
                  </p>
                </div>
              )}

              {actionError && (
                <div className="p-2.5 bg-red-50 border border-red-200 rounded text-red-700">
                  {actionError}
                </div>
              )}

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setReconcileTarget(null)}
                  disabled={busy}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleReconcileInstruction}
                  loading={busy}
                  disabled={busy}
                  className={
                    reconcileTarget.outcome === "PAID"
                      ? "bg-emerald-700 hover:bg-emerald-800 text-white"
                      : "bg-rose-600 hover:bg-rose-700 text-white"
                  }
                >
                  {reconcileTarget.outcome === "PAID"
                    ? "Confirm Paid & Settle Claims"
                    : "Mark Failed & Release Claims"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </Dialog>

        {/* Void Batch Modal */}
        <Dialog open={voidModalOpen} onOpenChange={setVoidModalOpen}>
          <DialogHeader>
            <DialogTitle>Void Reimbursement Batch & Release Claims</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 my-2 text-xs">
            <p className="text-zinc-600 leading-relaxed">
              Voiding <strong>{batch.batch_number}</strong> permanently cancels
              this batch and releases all {batch.claim_count} linked claim(s)
              back into the eligible reimbursement queue. If the <code>.xls</code>{" "}
              file was already uploaded to Alliance Bank, confirm it was
              rejected or cancelled in the bank portal first.
            </p>
            <div className="space-y-1">
              <label className="font-semibold text-zinc-700 block">
                Void / Cancellation Reason <span className="text-red-500">*</span>
              </label>
              <Input
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                placeholder="e.g. Cancelled prior to bank portal approval"
                className="h-9 text-xs"
                required
              />
            </div>
            {actionError && (
              <div className="p-2.5 bg-red-50 border border-red-200 rounded text-red-700">
                {actionError}
              </div>
            )}
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setVoidModalOpen(false)}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button
                onClick={handleVoidBatch}
                loading={busy}
                disabled={busy}
                className="bg-rose-600 hover:bg-rose-700 text-white"
              >
                Confirm Void Batch
              </Button>
            </DialogFooter>
          </div>
        </Dialog>
      </div>
    </AppLayout>
  );
}
