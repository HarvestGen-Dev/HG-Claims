"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Printer,
  Edit,
  CheckCircle2,
  RotateCcw,
  XCircle,
  Banknote,
  Eye,
  FileText,
  ShieldCheck,
  Building2,
  Clock,
  AlertCircle,
  UserCheck,
  Trash2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ClaimStatusBadge } from "./ClaimStatusBadge";
import { ClaimTimeline } from "./ClaimTimeline";
import { ClaimComments } from "./ClaimComments";
import { ReturnClarificationModal } from "./ReturnClarificationModal";
import { RejectModal } from "./RejectModal";
import { PaymentModal } from "./PaymentModal";
import { AdminCorrectionModal } from "./AdminCorrectionModal";
import { ReceiptViewerModal } from "./ReceiptViewerModal";



import { useAuth } from "@/lib/auth/context";
import { db } from "@/lib/data/repository";
import { Claim, ClaimAttachment } from "@/lib/types/database";
import { showToast } from "@/lib/utils/toast";


import { formatCurrency, formatDate, formatDateTime, formatFileSize } from "@/lib/utils/formatters";

interface ClaimDetailViewProps {
  claim: Claim;
}

export function ClaimDetailView({ claim: initialClaim }: ClaimDetailViewProps) {
  const router = useRouter();
  const { user, canApprove, canEdit, canPay, canVerify, hasRole } = useAuth();
  const [claim, setClaim] = useState<Claim>(initialClaim);
  const [activeTab, setActiveTab] = useState<"details" | "workflow" | "comments" | "audit">("details");

  // Modals
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showCorrectionModal, setShowCorrectionModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [previewAttachment, setPreviewAttachment] = useState<ClaimAttachment | null>(null);

  const [loadingAction, setLoadingAction] = useState(false);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);

  const costCentres = db.getCostCentres();

  const handleDeleteClaim = async () => {
    if (!user) return;
    try {
      setLoadingAction(true);
      await db.deleteClaim(claim.id);
      showToast.success("Claim has been deleted.", "Claim Deleted");
      router.push("/claims");
    } catch (err: any) {
      showToast.error(err.message || "Failed to delete claim", "Delete Error");
      setLoadingAction(false);
    }
  };

  const handleApprove = async () => {
    if (!user) return;
    try {
      setLoadingAction(true);
      const updated = await db.approveStep(claim.id, user, "Approved in accordance with ministry guidelines.");
      setClaim(updated);
      showToast.success("Claim has been successfully approved.", "Claim Approved");
    } catch (err: any) {
      showToast.error(err.message || "Failed to approve claim", "Approval Error");
    } finally {
      setLoadingAction(false);
    }
  };

  const handleReturnConfirm = async (reason: string) => {
    if (!user) return;
    try {
      setLoadingAction(true);
      const updated = await db.returnForClarification(claim.id, user, reason);
      setClaim(updated);
      setShowReturnModal(false);
      showToast.info("Claim returned to submitter for clarification.", "Claim Returned");
    } catch (err: any) {
      showToast.error(err.message || "Failed to return claim", "Return Error");
    } finally {
      setLoadingAction(false);
    }
  };

  const handleRejectConfirm = async (reason: string) => {
    if (!user) return;
    try {
      setLoadingAction(true);
      const updated = await db.rejectClaim(claim.id, user, reason);
      setClaim(updated);
      setShowRejectModal(false);
      showToast.warning("Claim has been marked as rejected.", "Claim Rejected");
    } catch (err: any) {
      showToast.error(err.message || "Failed to reject claim", "Rejection Error");
    } finally {
      setLoadingAction(false);
    }
  };

  const handleVerifyFinance = async () => {
    if (!user) return;
    try {
      setLoadingAction(true);
      const updated = await db.verifyClaim(claim.id, user, "All receipts and cost allocations verified.");
      setClaim(updated);
      showToast.success("Finance verification recorded.", "Finance Verified");
    } catch (err: any) {
      showToast.error(err.message || "Failed to verify claim", "Verification Error");
    } finally {
      setLoadingAction(false);
    }
  };

  const handlePaymentConfirm = async (paymentData: any) => {
    if (!user) return;
    try {
      setLoadingAction(true);
      const updated = await db.recordPayment({
        ...paymentData,
        claim_id: claim.id,
        processor: user,
      });
      setClaim(updated);
      setShowPaymentModal(false);
      showToast.success(`Payment recorded successfully (Ref: ${paymentData.payment_reference})`, "Payment Recorded");
    } catch (err: any) {
      showToast.error(err.message || "Failed to record payment", "Payment Error");
    } finally {
      setLoadingAction(false);
    }
  };

  const handleCorrectionConfirm = async (data: any) => {
    if (!user) return;
    try {
      setLoadingAction(true);
      const updated = await db.correctClaimMetadata({
        ...data,
        claim_id: claim.id,
        actor: user,
      });
      setClaim(updated);
      setShowCorrectionModal(false);
      showToast.success("Changes have been made to administrative fields.", "Claim Updated");
    } catch (err: any) {
      showToast.error(err.message || "Failed to save correction", "Update Error");
    } finally {
      setLoadingAction(false);
    }
  };

  const handleAddComment = async (content: string, visibility: "PUBLIC_WORKFLOW" | "FINANCE_INTERNAL") => {
    try {
      if (!user) return;
      const updated = await db.addComment(claim.id, user, content, visibility);
      setClaim(updated);
      showToast.success(visibility === "FINANCE_INTERNAL" ? "Internal finance note added." : "Comment posted successfully.", "Comment Added");
    } catch (error) {
      showToast.error(error instanceof Error ? error.message : "Unable to save comment.", "Comment Error");
    }
  };

  const submitterId = claim.submitted_by_user_id || claim.claimant_id;
  const isSubmitter = submitterId === user?.id;
  const isFinanceUser = hasRole("FINANCE_OFFICER") || hasRole("SYSTEM_ADMIN");
  const isApproverUser = canApprove(claim);
  const isEditable = canEdit(claim);

  const claimantName = claim.claimant_name || claim.claimant?.full_name || "Unknown Claimant";
  const submitterName = claim.submitted_by?.full_name || claim.claimant?.full_name || "Ministry Head";

  return (
    <div className="space-y-5 max-w-5xl mx-auto pb-12">
      {/* Top Banner & Actions */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 p-4 rounded-xl border border-zinc-200/80 bg-white dark:border-zinc-800 dark:bg-zinc-950 shadow-2xs">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              onClick={() => router.back()}
              className="p-1 rounded-md text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              title="Back"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <h1 className="text-lg font-bold font-mono text-zinc-900 dark:text-zinc-100 tracking-tight">
              {claim.claim_number || "Draft Claim"}
            </h1>
            <ClaimStatusBadge status={claim.status} />
          </div>
          <p className="text-[11px] text-zinc-500 flex items-center gap-x-3 gap-y-0.5 flex-wrap">
            <span>Claimant: <strong className="text-zinc-700 dark:text-zinc-300 font-medium">{claimantName}</strong></span>
            <span>&bull;</span>
            <span>Submitted By: <strong className="text-zinc-700 dark:text-zinc-300 font-medium">{submitterName}</strong></span>
            <span>&bull;</span>
            <span>Ministry: <strong className="text-zinc-700 dark:text-zinc-300 font-medium">{claim.ministry?.name}</strong></span>
            <span>&bull;</span>
            <span>Date: <strong className="text-zinc-700 dark:text-zinc-300 font-medium font-mono">{formatDate(claim.submitted_at || claim.created_at)}</strong></span>
          </p>
        </div>

        {/* Action Button Bar */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Printable Voucher */}
          <Link href={`/claims/${claim.id}/print`} target="_blank">
            <Button variant="outline" size="sm" className="h-7 text-xs border-zinc-200 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 gap-1.5">
              <Printer className="w-3.5 h-3.5 text-zinc-400" />
              <span>Print</span>
            </Button>
          </Link>

          {/* Submitter Edit / Resubmit */}
          {isEditable && (
            <Link href={`/claims/${claim.id}/edit`}>
              <Button size="sm" className="h-7 text-xs bg-emerald-700 hover:bg-emerald-800 text-white gap-1.5 shadow-2xs font-medium">
                <Edit className="w-3.5 h-3.5" />
                <span>{claim.status === "RETURNED_FOR_CLARIFICATION" ? "Fix & Resubmit" : "Edit Draft"}</span>
              </Button>
            </Link>
          )}

          {/* Delete Draft/Cancelled Claim */}
          {(claim.status === "DRAFT" || claim.status === "CANCELLED") && (isSubmitter || hasRole("SYSTEM_ADMIN")) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDeleteModal(true)}
              disabled={loadingAction}
              className="h-7 text-xs border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete {claim.status === "DRAFT" ? "Draft" : "Claim"}</span>
            </Button>
          )}

          {/* Approver Controls */}
          {isApproverUser && (
            <>
              <Button
                size="sm"
                onClick={handleApprove}
                loading={loadingAction}
                disabled={loadingAction}
                className="h-7 text-xs bg-emerald-700 hover:bg-emerald-800 text-white gap-1.5 shadow-2xs font-medium"
              >
                {!loadingAction && <CheckCircle2 className="w-3.5 h-3.5" />}
                <span>Approve</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowReturnModal(true)}
                disabled={loadingAction}
                className="h-7 text-xs border-amber-200 text-amber-800 hover:bg-amber-50 gap-1"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Return</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowRejectModal(true)}
                disabled={loadingAction}
                className="h-7 text-xs border-rose-200 text-rose-800 hover:bg-rose-50 gap-1"
              >
                <XCircle className="w-3.5 h-3.5" />
                <span>Reject</span>
              </Button>
            </>
          )}

          {/* Finance Controls */}
          {isFinanceUser && (
            <>
              {!claim.finance_review?.receipts_verified && claim.status !== "DRAFT" && claim.status !== "PAID" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleVerifyFinance}
                  loading={loadingAction}
                  disabled={loadingAction}
                  className="h-7 text-xs border-violet-200 text-violet-800 hover:bg-violet-50 gap-1.5"
                >
                  {!loadingAction && <ShieldCheck className="w-3.5 h-3.5" />}
                  <span>Verify Receipts</span>
                </Button>
              )}

              {claim.status === "APPROVED_FOR_PAYMENT" && (
                <Button
                  size="sm"
                  onClick={() => setShowPaymentModal(true)}
                  disabled={loadingAction}
                  className="h-7 text-xs bg-emerald-700 hover:bg-emerald-800 text-white gap-1.5 shadow-2xs font-medium"
                >
                  <Banknote className="w-3.5 h-3.5" />
                  <span>Record Payment</span>
                </Button>
              )}

              {claim.status !== "DRAFT" && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowCorrectionModal(true)}
                  disabled={loadingAction}
                  className="h-7 text-zinc-500 hover:text-zinc-900 text-xs px-2"
                >
                  Admin Edit
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {actionSuccessMessage && (
        <Alert variant="success" className="text-xs">
          <CheckCircle2 className="w-4 h-4" />
          <AlertTitle className="text-xs font-semibold">Success</AlertTitle>
          <AlertDescription className="text-xs">{actionSuccessMessage}</AlertDescription>
        </Alert>
      )}

      {/* Return for Clarification Notice */}
      {claim.status === "RETURNED_FOR_CLARIFICATION" && (
        <Alert variant="destructive" className="text-xs bg-rose-50/80 border-rose-200 text-rose-950">
          <RotateCcw className="w-4 h-4 text-rose-600" />
          <AlertTitle className="font-semibold text-xs text-rose-900">Clarification Requested by Approver</AlertTitle>
          <AlertDescription className="text-xs text-rose-800">
            <p className="mt-1">{claim.clarification_reason || "Approver requested additional information or receipts."}</p>
            {isSubmitter && (
              <div className="mt-2.5">
                <Link href={`/claims/${claim.id}/edit`}>
                  <Button size="sm" className="h-7 text-xs bg-rose-700 hover:bg-rose-800 text-white">
                    Update & Resubmit Claim
                  </Button>
                </Link>
              </div>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Navigation Tabs */}
      <div className="flex border-b border-zinc-200/80 dark:border-zinc-800 space-x-6 text-xs font-medium overflow-x-auto no-scrollbar whitespace-nowrap pb-px">
        <button
          onClick={() => setActiveTab("details")}
          className={`pb-2.5 border-b-2 transition-colors shrink-0 ${
            activeTab === "details"
              ? "border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100 font-semibold"
              : "border-transparent text-zinc-400 hover:text-zinc-700"
          }`}
        >
          Claim Overview
        </button>
        <button
          onClick={() => setActiveTab("workflow")}
          className={`pb-2.5 border-b-2 transition-colors shrink-0 ${
            activeTab === "workflow"
              ? "border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100 font-semibold"
              : "border-transparent text-zinc-400 hover:text-zinc-700"
          }`}
        >
          Workflow & Timeline
        </button>
        <button
          onClick={() => setActiveTab("comments")}
          className={`pb-2.5 border-b-2 transition-colors shrink-0 ${
            activeTab === "comments"
              ? "border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100 font-semibold"
              : "border-transparent text-zinc-400 hover:text-zinc-700"
          }`}
        >
          Comments ({claim.comments?.length || 0})
        </button>
        {isFinanceUser && (
          <button
            onClick={() => setActiveTab("audit")}
            className={`pb-2.5 border-b-2 transition-colors shrink-0 ${
              activeTab === "audit"
                ? "border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100 font-semibold"
                : "border-transparent text-zinc-400 hover:text-zinc-700"
            }`}
          >
            Audit History
          </button>
        )}
      </div>

      {/* TAB 1: DETAILS & EXPENSES */}
      {activeTab === "details" && (
        <div className="space-y-4">
          {/* Metadata Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Claimant & Submitter Card */}
            <Card className="border-zinc-200/80 shadow-2xs">
              <CardContent className="p-3.5 space-y-2 text-xs">
                <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider block">
                  Claimant & Submitter
                </span>
                <div>
                  <p className="text-[10px] text-zinc-400">Claimant (Payee)</p>
                  <p className="font-semibold text-zinc-900 dark:text-zinc-100">{claimantName}</p>
                  <p className="text-[11px] text-zinc-500 font-mono">{claim.claimant_email || "-"}</p>
                  <p className="text-[11px] text-zinc-500 font-mono">{claim.claimant_phone || "-"}</p>
                  {(claim.bank_name || claim.bank_account_number) && (
                    <div className="mt-1.5 pt-1.5 border-t border-zinc-100 dark:border-zinc-800">
                      <span className="text-[10px] text-zinc-400 block">Bank Account:</span>
                      <p className="font-medium text-zinc-800 dark:text-zinc-200">{claim.bank_name || "Bank unspecified"}</p>
                      <p className="font-mono text-emerald-700 dark:text-emerald-400 font-semibold">{claim.bank_account_number || "-"}</p>
                    </div>
                  )}
                </div>
                <div className="pt-1.5 border-t border-zinc-100 dark:border-zinc-800">
                  <p className="text-[10px] text-zinc-400">Submitted By (Ministry Head)</p>
                  <p className="font-medium text-zinc-800 dark:text-zinc-200">{submitterName}</p>
                </div>
              </CardContent>
            </Card>

            {/* Ministry Context Card */}
            <Card className="border-zinc-200/80 shadow-2xs">
              <CardContent className="p-3.5 space-y-2 text-xs">
                <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider block">
                  Ministry & Reference
                </span>
                <div>
                  <p className="text-[10px] text-zinc-400">Ministry / Department</p>
                  <p className="font-medium text-zinc-900 dark:text-zinc-100">{claim.ministry?.name}</p>
                </div>
                <div>
                  <p className="text-[10px] text-zinc-400">Submission Date</p>
                  <p className="font-mono text-zinc-800 dark:text-zinc-200">{formatDate(claim.claim_date)}</p>
                </div>
                {claim.internal_reference && (
                  <div>
                    <p className="text-[10px] text-zinc-400">Reference Code</p>
                    <p className="font-mono text-zinc-800 dark:text-zinc-200">{claim.internal_reference}</p>
                  </div>
                )}
                {claim.payment && (
                  <div className="pt-1.5 border-t border-zinc-100 dark:border-zinc-800">
                    <p className="text-emerald-700 text-[10px] font-semibold">Payment Settled</p>
                    <p className="font-mono text-zinc-900 dark:text-zinc-100 text-[11px]">
                      Ref: {claim.payment.payment_reference} ({formatDate(claim.payment.payment_date)})
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Total Banner */}
            <Card className="bg-zinc-900 text-white flex flex-col justify-between border-zinc-800 shadow-2xs">
              <CardContent className="p-4">
                <span className="text-[10px] text-zinc-400 uppercase tracking-wider font-semibold block">
                  Total Claim Amount
                </span>
                <p className="text-2xl font-bold font-mono text-emerald-400 mt-1.5 tabular-nums">
                  {formatCurrency(claim.total_amount)}
                </p>
                <p className="text-[10px] text-zinc-400 mt-1">
                  {claim.expenses?.length || 0} receipt{(claim.expenses?.length || 0) > 1 ? "s" : ""}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Ministry Purpose */}
          <Card className="border-zinc-200/80 shadow-2xs">
            <CardHeader className="py-2.5 px-4 border-b border-zinc-100 dark:border-zinc-800">
              <CardTitle className="text-[10px] uppercase tracking-wider text-zinc-400 font-semibold">
                Ministry Purpose / Justification
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3.5">
              <p className="text-xs text-zinc-800 dark:text-zinc-200 leading-relaxed">
                {claim.purpose}
              </p>
            </CardContent>
          </Card>

          {/* Expense Breakdown Table with Per-Receipt Cost Centre */}
          <Card className="border-zinc-200/80 shadow-2xs overflow-hidden">
            <CardHeader className="py-2.5 px-4 border-b border-zinc-100 dark:border-zinc-800 flex flex-row items-center justify-between">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
                Itemized Receipts & Cost Allocations
              </CardTitle>
              <span className="text-xs font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                Subtotal: {formatCurrency(claim.total_amount)}
              </span>
            </CardHeader>
            <CardContent className="p-0">
              {/* Mobile Card List for Receipts */}
              <div className="sm:hidden divide-y divide-zinc-200/80 dark:divide-zinc-800">
                {(claim.expenses || []).map((exp, idx) => {
                  const expAttachment = (claim.attachments || []).find((a) => a.expense_id === exp.id);
                  return (
                    <div key={exp.id || idx} className="p-3.5 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="h-5 w-5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 flex items-center justify-center text-[10px] font-bold font-mono">
                            {idx + 1}
                          </span>
                          <div>
                            <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                              {exp.description}
                            </p>
                            <p className="text-[11px] text-zinc-500 font-mono">
                              {formatDate(exp.expense_date)}
                            </p>
                          </div>
                        </div>
                        <span className="font-mono font-bold text-sm text-zinc-900 dark:text-zinc-100 tabular-nums">
                          RM {Number(exp.amount).toFixed(2)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-zinc-500 pt-1">
                        <span>Cost Centre: <strong className="text-zinc-700 dark:text-zinc-300 font-mono">{exp.cost_centre?.code || "-"}</strong></span>
                        {exp.vendor && <span>Merchant: <strong className="text-zinc-700 dark:text-zinc-300">{exp.vendor}</strong></span>}
                      </div>

                      {expAttachment && (
                        <div className="pt-1.5">
                          <button
                            type="button"
                            onClick={() => setPreviewAttachment(expAttachment)}
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 hover:text-emerald-800 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 rounded-md"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>View Attached Receipt ({expAttachment.original_filename})</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Desktop Table View */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-zinc-50/50 border-b border-zinc-100 dark:bg-zinc-900/50 dark:border-zinc-800 text-zinc-400 text-[10px] font-semibold uppercase tracking-wider">
                      <th className="py-2 px-4 w-8">#</th>
                      <th className="py-2 px-4 w-24">Date</th>
                      <th className="py-2 px-4 w-36">Cost Centre</th>
                      <th className="py-2 px-4">Description</th>
                      <th className="py-2 px-4 w-28">Merchant</th>
                      <th className="py-2 px-4 w-24 text-center">Receipt</th>
                      <th className="py-2 px-4 w-28 text-right">Amount (RM)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
                    {(claim.expenses || []).map((exp, idx) => {
                      const expAttachment = (claim.attachments || []).find(a => a.expense_id === exp.id);
                      return (
                        <tr key={exp.id || idx} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/40">
                          <td className="py-2.5 px-4 text-zinc-400 font-mono text-[11px]">{idx + 1}</td>
                          <td className="py-2.5 px-4 text-zinc-500 font-mono text-[11px]">{formatDate(exp.expense_date)}</td>
                          <td className="py-2.5 px-4 font-mono text-[11px] text-zinc-600 dark:text-zinc-400">
                            {exp.cost_centre?.code || "-"}
                          </td>
                          <td className="py-2.5 px-4 text-zinc-900 dark:text-zinc-100">
                            <span>{exp.description}</span>
                            {exp.notes && (
                              <span className="text-[10px] text-zinc-400 block">{exp.notes}</span>
                            )}
                          </td>
                          <td className="py-2.5 px-4 text-zinc-500">{exp.vendor || "-"}</td>
                          <td className="py-2.5 px-4 text-center">
                            {expAttachment ? (
                              <button
                                type="button"
                                onClick={() => setPreviewAttachment(expAttachment)}
                                className="inline-flex items-center gap-1 text-[11px] text-emerald-700 hover:text-emerald-800 hover:underline dark:text-emerald-400 font-medium"
                              >
                                <Eye className="w-3 h-3" />
                                <span>View</span>
                              </button>
                            ) : (
                              <span className="text-[10px] text-zinc-400">-</span>
                            )}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums">
                            {Number(exp.amount).toFixed(2)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-zinc-200 dark:border-zinc-800 font-semibold bg-zinc-50/50 dark:bg-zinc-900/50">
                      <td colSpan={7} className="py-2.5 px-4 text-right text-[10px] uppercase tracking-wider text-zinc-500">
                        Total Amount:
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-xs text-zinc-900 dark:text-zinc-100">
                        {formatCurrency(claim.total_amount)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Attached Receipts Gallery */}
          <Card className="border-zinc-200/80 shadow-2xs">
            <CardHeader className="py-2.5 px-4 border-b border-zinc-100 dark:border-zinc-800">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
                Receipts & Documents ({claim.attachments?.length || 0})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3.5">
              {(!claim.attachments || claim.attachments.length === 0) ? (
                <div className="py-6 text-center text-xs text-zinc-400">
                  No receipts attached.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                  {claim.attachments.map((att) => (
                    <div
                      key={att.id}
                      onClick={() => setPreviewAttachment(att)}
                      className="group flex items-center justify-between p-2.5 rounded-lg border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-zinc-400 cursor-pointer transition-all shadow-2xs"
                    >
                      <div className="flex items-center gap-2.5 truncate pr-2">
                        <div className="h-7 w-7 rounded bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0">
                          <FileText className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-400" />
                        </div>
                        <div className="truncate">
                          <p className="text-xs font-medium text-zinc-800 dark:text-zinc-200 truncate group-hover:underline">
                            {att.original_filename}
                          </p>
                          <p className="text-[10px] text-zinc-400 font-mono">
                            {formatFileSize(att.file_size)}
                          </p>
                        </div>
                      </div>
                      <Eye className="w-3.5 h-3.5 text-zinc-400 group-hover:text-zinc-900 shrink-0" />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 2: WORKFLOW TIMELINE */}
      {activeTab === "workflow" && (
        <Card className="border-zinc-200/80 shadow-2xs">
          <CardHeader className="py-3 px-4 border-b border-zinc-100 dark:border-zinc-800">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
              Approval Progress & Timeline
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <ClaimTimeline
              steps={claim.workflow_steps || []}
              actions={claim.approval_actions || []}
              claimStatus={claim.status}
            />
          </CardContent>
        </Card>
      )}

      {/* TAB 3: COMMENTS */}
      {activeTab === "comments" && (
        <Card className="border-zinc-200/80 shadow-2xs">
          <CardContent className="p-4">
            <ClaimComments
              comments={claim.comments || []}
              currentUser={user}
              onAddComment={handleAddComment}
              canAddInternalNote={isFinanceUser}
            />
          </CardContent>
        </Card>
      )}

      {/* TAB 4: AUDIT HISTORY */}
      {activeTab === "audit" && isFinanceUser && (
        <Card className="border-zinc-200/80 shadow-2xs overflow-hidden">
          <CardHeader className="py-3 px-4 border-b border-zinc-100 dark:border-zinc-800">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
              Security Audit Trail
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-zinc-50/50 border-b border-zinc-100 dark:bg-zinc-900/50 dark:border-zinc-800 text-zinc-400 text-[10px] font-semibold uppercase tracking-wider">
                    <th className="py-2.5 px-4">Timestamp</th>
                    <th className="py-2.5 px-4">Actor</th>
                    <th className="py-2.5 px-4">Action</th>
                    <th className="py-2.5 px-4">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
                  {(claim.approval_actions || []).map((act) => (
                    <tr key={act.id} className="hover:bg-zinc-50/50">
                      <td className="py-2.5 px-4 text-zinc-500 font-mono text-[11px]">{formatDateTime(act.created_at)}</td>
                      <td className="py-2.5 px-4 font-medium text-zinc-800 dark:text-zinc-200">
                        {act.actor?.full_name || "User"} ({act.actor_role})
                      </td>
                      <td className="py-2.5 px-4 font-mono text-zinc-900 dark:text-zinc-100 font-semibold text-[11px]">{act.action}</td>
                      <td className="py-2.5 px-4 text-zinc-500">{act.comment || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Modals */}
      <ReturnClarificationModal
        open={showReturnModal}
        claimNumber={claim.claim_number}
        onConfirm={handleReturnConfirm}
        onCancel={() => setShowReturnModal(false)}
        loading={loadingAction}
      />

      <RejectModal
        open={showRejectModal}
        claimNumber={claim.claim_number}
        onConfirm={handleRejectConfirm}
        onCancel={() => setShowRejectModal(false)}
        loading={loadingAction}
      />

      <PaymentModal
        open={showPaymentModal}
        claim={claim}
        onConfirm={handlePaymentConfirm}
        onCancel={() => setShowPaymentModal(false)}
        loading={loadingAction}
      />

      <AdminCorrectionModal
        open={showCorrectionModal}
        claim={claim}
        costCentres={costCentres}
        onConfirm={handleCorrectionConfirm}
        onCancel={() => setShowCorrectionModal(false)}
        loading={loadingAction}
      />

      <ReceiptViewerModal
        attachment={previewAttachment}
        onClose={() => setPreviewAttachment(null)}
      />

      {/* Delete Claim Confirmation Modal */}
      <Dialog open={showDeleteModal} onOpenChange={(open) => !open && !loadingAction && setShowDeleteModal(false)}>
        <DialogHeader>
          <DialogTitle className="text-red-700 flex items-center gap-2">
            <Trash2 className="w-5 h-5 text-red-600" />
            Delete {claim.status === "DRAFT" ? "Draft" : "Claim"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 my-2 text-sm text-slate-600">
          <p>
            Are you sure you want to permanently delete {claim.claim_number ? <strong className="font-mono text-slate-900">{claim.claim_number}</strong> : "this draft"}?
          </p>
          <p className="text-xs text-red-600 bg-red-50 p-2.5 rounded border border-red-200">
            This action cannot be undone. All expense items, receipts, and history attached to this claim will be permanently removed.
          </p>
        </div>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => setShowDeleteModal(false)} disabled={loadingAction}>
            Cancel
          </Button>
          <Button
            onClick={handleDeleteClaim}
            loading={loadingAction}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            Delete Permanently
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
