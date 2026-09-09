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
  Copy, 
  Trash2, 
  Calendar, 
  Building2, 
  PieChart, 
  CreditCard, 
  ShieldCheck, 
  User, 
  Clock, 
  DollarSign,
  AlertCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { ClaimStatusBadge } from "./ClaimStatusBadge";
import { ClaimTimeline } from "./ClaimTimeline";
import { ClaimComments } from "./ClaimComments";
import { ReturnClarificationModal } from "./ReturnClarificationModal";
import { RejectModal } from "./RejectModal";
import { PaymentModal } from "./PaymentModal";
import { AdminCorrectionModal } from "./AdminCorrectionModal";
import { ReceiptViewerModal } from "./ReceiptViewerModal";
import { useAuth } from "@/lib/auth/context";
import { db } from "@/lib/mock-db/repository";
import { Claim, ClaimAttachment } from "@/lib/types/database";
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
  const [previewAttachment, setPreviewAttachment] = useState<ClaimAttachment | null>(null);

  const [loadingAction, setLoadingAction] = useState(false);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);

  const costCentres = db.getCostCentres();

  const handleApprove = async () => {
    if (!user) return;
    try {
      setLoadingAction(true);
      const updated = db.approveStep(claim.id, user, "Approved in accordance with ministry guidelines.");
      setClaim(updated);
      setActionSuccessMessage("Claim successfully approved!");
      setTimeout(() => setActionSuccessMessage(null), 4000);
    } catch (err: any) {
      alert(err.message || "Failed to approve claim");
    } finally {
      setLoadingAction(false);
    }
  };

  const handleReturnConfirm = async (reason: string) => {
    if (!user) return;
    try {
      setLoadingAction(true);
      const updated = db.returnForClarification(claim.id, user, reason);
      setClaim(updated);
      setShowReturnModal(false);
      setActionSuccessMessage("Claim returned to claimant for clarification.");
      setTimeout(() => setActionSuccessMessage(null), 4000);
    } catch (err: any) {
      alert(err.message || "Failed to return claim");
    } finally {
      setLoadingAction(false);
    }
  };

  const handleRejectConfirm = async (reason: string) => {
    if (!user) return;
    try {
      setLoadingAction(true);
      const updated = db.rejectClaim(claim.id, user, reason);
      setClaim(updated);
      setShowRejectModal(false);
      setActionSuccessMessage("Claim has been marked as Rejected.");
      setTimeout(() => setActionSuccessMessage(null), 4000);
    } catch (err: any) {
      alert(err.message || "Failed to reject claim");
    } finally {
      setLoadingAction(false);
    }
  };

  const handleVerifyFinance = async () => {
    if (!user) return;
    try {
      setLoadingAction(true);
      const updated = db.verifyClaim(claim.id, user, "All receipts and cost allocations verified.");
      setClaim(updated);
      setActionSuccessMessage("Finance verification recorded.");
      setTimeout(() => setActionSuccessMessage(null), 4000);
    } catch (err: any) {
      alert(err.message || "Failed to verify claim");
    } finally {
      setLoadingAction(false);
    }
  };

  const handlePaymentConfirm = async (paymentData: any) => {
    if (!user) return;
    try {
      setLoadingAction(true);
      const updated = db.recordPayment({
        ...paymentData,
        claim_id: claim.id,
        processor: user,
      });
      setClaim(updated);
      setShowPaymentModal(false);
      setActionSuccessMessage(`Payment recorded successfully (Ref: ${paymentData.payment_reference})`);
      setTimeout(() => setActionSuccessMessage(null), 4000);
    } catch (err: any) {
      alert(err.message || "Failed to record payment");
    } finally {
      setLoadingAction(false);
    }
  };

  const handleCorrectionConfirm = async (data: any) => {
    if (!user) return;
    try {
      setLoadingAction(true);
      const updated = db.correctClaimMetadata({
        ...data,
        claim_id: claim.id,
        actor: user,
      });
      setClaim(updated);
      setShowCorrectionModal(false);
      setActionSuccessMessage("Administrative fields updated and audited.");
      setTimeout(() => setActionSuccessMessage(null), 4000);
    } catch (err: any) {
      alert(err.message || "Failed to save correction");
    } finally {
      setLoadingAction(false);
    }
  };

  const handleAddComment = async (content: string, visibility: "PUBLIC_WORKFLOW" | "FINANCE_INTERNAL") => {
    if (!user) return;
    const updated = db.addComment(claim.id, user, content, visibility);
    setClaim(updated);
  };

  const isClaimant = claim.claimant_id === user?.id;
  const isFinanceUser = hasRole("FINANCE_OFFICER") || hasRole("SYSTEM_ADMIN");
  const isApproverUser = canApprove(claim);
  const isEditable = canEdit(claim);

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Top Banner & Quick Controls */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="space-y-1.5">
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={() => router.back()}
              className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100"
              title="Back"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <h1 className="text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
              {claim.claim_number || "Draft Claim"}
            </h1>
            <ClaimStatusBadge status={claim.status} />
          </div>
          <p className="text-xs text-slate-500 flex items-center gap-x-4 gap-y-1 flex-wrap">
            <span>Claimant: <strong className="text-slate-700 dark:text-slate-300">{claim.claimant?.full_name}</strong></span>
            <span>Ministry: <strong className="text-slate-700 dark:text-slate-300">{claim.ministry?.name}</strong></span>
            <span>Submitted: <strong className="text-slate-700 dark:text-slate-300">{formatDate(claim.submitted_at || claim.created_at)}</strong></span>
          </p>
        </div>

        {/* Action Button Bar */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Printable Voucher */}
          <Link href={`/claims/${claim.id}/print`} target="_blank">
            <Button variant="outline" size="sm" className="gap-1.5 border-slate-300">
              <Printer className="w-4 h-4" />
              <span>Print Voucher</span>
            </Button>
          </Link>

          {/* Claimant Edit / Resubmit */}
          {isEditable && (
            <Link href={`/claims/${claim.id}/edit`}>
              <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white gap-1.5">
                <Edit className="w-4 h-4" />
                <span>{claim.status === "RETURNED_FOR_CLARIFICATION" ? "Fix & Resubmit" : "Edit Draft"}</span>
              </Button>
            </Link>
          )}

          {/* Approver Controls */}
          {isApproverUser && (
            <>
              <Button
                size="sm"
                onClick={handleApprove}
                disabled={loadingAction}
                className="bg-emerald-700 hover:bg-emerald-800 text-white gap-1.5 shadow-sm"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Approve Claim</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowReturnModal(true)}
                disabled={loadingAction}
                className="border-amber-300 text-amber-700 hover:bg-amber-50 gap-1.5"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Return</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowRejectModal(true)}
                disabled={loadingAction}
                className="border-red-300 text-red-700 hover:bg-red-50 gap-1.5"
              >
                <XCircle className="w-4 h-4" />
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
                  disabled={loadingAction}
                  className="border-indigo-300 text-indigo-700 hover:bg-indigo-50 gap-1.5"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>Verify Receipts</span>
                </Button>
              )}

              {claim.status === "APPROVED_FOR_PAYMENT" && (
                <Button
                  size="sm"
                  onClick={() => setShowPaymentModal(true)}
                  disabled={loadingAction}
                  className="bg-emerald-700 hover:bg-emerald-800 text-white gap-1.5 shadow-sm"
                >
                  <Banknote className="w-4 h-4" />
                  <span>Record Payment</span>
                </Button>
              )}

              {claim.status !== "DRAFT" && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowCorrectionModal(true)}
                  disabled={loadingAction}
                  className="text-slate-600 hover:text-slate-900 text-xs"
                >
                  Admin Edit
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {actionSuccessMessage && (
        <Alert variant="success">
          <CheckCircle2 className="w-4 h-4" />
          <AlertTitle>Success</AlertTitle>
          <AlertDescription>{actionSuccessMessage}</AlertDescription>
        </Alert>
      )}

      {/* Return for Clarification Notice */}
      {claim.status === "RETURNED_FOR_CLARIFICATION" && (
        <Alert variant="destructive">
          <RotateCcw className="w-4 h-4 text-red-600" />
          <AlertTitle className="font-bold">Clarification Required</AlertTitle>
          <AlertDescription>
            <p className="mt-1">{claim.clarification_reason || "Approver requested additional information or receipts."}</p>
            {isClaimant && (
              <div className="mt-3">
                <Link href={`/claims/${claim.id}/edit`}>
                  <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white text-xs">
                    Update Details & Resubmit Claim
                  </Button>
                </Link>
              </div>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Rejection Notice */}
      {claim.status === "REJECTED" && (
        <Alert variant="destructive">
          <XCircle className="w-4 h-4 text-red-600" />
          <AlertTitle className="font-bold">Claim Rejected</AlertTitle>
          <AlertDescription>
            <p className="mt-1">Reason: {claim.rejection_reason || "This claim does not meet approval guidelines."}</p>
          </AlertDescription>
        </Alert>
      )}

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 space-x-6 text-sm font-semibold">
        <button
          onClick={() => setActiveTab("details")}
          className={`pb-3 border-b-2 transition-colors ${
            activeTab === "details"
              ? "border-emerald-700 text-emerald-800 dark:border-emerald-400 dark:text-emerald-300"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          Claim Overview & Expenses
        </button>
        <button
          onClick={() => setActiveTab("workflow")}
          className={`pb-3 border-b-2 transition-colors ${
            activeTab === "workflow"
              ? "border-emerald-700 text-emerald-800 dark:border-emerald-400 dark:text-emerald-300"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          Workflow & Timeline
        </button>
        <button
          onClick={() => setActiveTab("comments")}
          className={`pb-3 border-b-2 transition-colors ${
            activeTab === "comments"
              ? "border-emerald-700 text-emerald-800 dark:border-emerald-400 dark:text-emerald-300"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          Comments ({claim.comments?.length || 0})
        </button>
        {isFinanceUser && (
          <button
            onClick={() => setActiveTab("audit")}
            className={`pb-3 border-b-2 transition-colors ${
              activeTab === "audit"
                ? "border-emerald-700 text-emerald-800 dark:border-emerald-400 dark:text-emerald-300"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            Audit History
          </button>
        )}
      </div>

      {/* TAB 1: DETAILS & EXPENSES */}
      {activeTab === "details" && (
        <div className="space-y-6">
          {/* Metadata Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4 space-y-2 text-xs">
                <span className="font-bold text-slate-400 uppercase tracking-wider block">Ministry Context</span>
                <div>
                  <p className="text-slate-500">Ministry:</p>
                  <p className="font-semibold text-slate-900 dark:text-slate-100">{claim.ministry?.name}</p>
                </div>
                <div>
                  <p className="text-slate-500">Programme / Event:</p>
                  <p className="font-semibold text-slate-900 dark:text-slate-100">{claim.programme_event}</p>
                </div>
                <div>
                  <p className="text-slate-500">Cost Centre:</p>
                  <p className="font-semibold text-slate-900 dark:text-slate-100">{claim.cost_centre?.code} - {claim.cost_centre?.name}</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 space-y-2 text-xs">
                <span className="font-bold text-slate-400 uppercase tracking-wider block">Payment Details</span>
                <div>
                  <p className="text-slate-500">Method Requested:</p>
                  <p className="font-semibold text-slate-900 dark:text-slate-100">{claim.payment_method.replace(/_/g, " ")}</p>
                </div>
                <div>
                  <p className="text-slate-500">Payee Bank Info:</p>
                  <p className="font-semibold text-slate-900 dark:text-slate-100">
                    {claim.claimant?.bank_name || "Maybank"} • {claim.claimant?.bank_account_number || "114012345678"}
                  </p>
                </div>
                {claim.payment && (
                  <div className="pt-1 border-t border-slate-100 dark:border-slate-800">
                    <p className="text-emerald-700 font-bold">Payment Settled:</p>
                    <p className="font-mono text-slate-900 dark:text-slate-100 font-semibold">
                      Ref: {claim.payment.payment_reference} ({formatDate(claim.payment.payment_date)})
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="bg-slate-900 text-white flex flex-col justify-between">
              <CardContent className="p-5">
                <span className="text-xs text-slate-400 uppercase tracking-wider font-bold block">Total Amount Claimed</span>
                <p className="text-3xl font-black text-emerald-400 mt-2">
                  {formatCurrency(claim.total_amount)}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  {claim.expenses?.length || 0} itemized expense line{(claim.expenses?.length || 0) > 1 ? "s" : ""}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Ministry Purpose */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase tracking-wider text-slate-400 font-bold">
                Ministry Purpose / Justification
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-slate-800/50 p-3.5 rounded-xl border border-slate-100 dark:border-slate-800">
                {claim.purpose}
              </p>
            </CardContent>
          </Card>

          {/* Expense Breakdown Table */}
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Itemized Expenses Breakdown
              </CardTitle>
              <span className="text-xs font-semibold text-slate-500">
                Subtotal: <strong className="text-slate-900 dark:text-slate-100">{formatCurrency(claim.total_amount)}</strong>
              </span>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase tracking-wider">
                      <th className="pb-2 w-8">#</th>
                      <th className="pb-2 w-24">Date</th>
                      <th className="pb-2 w-36">Category</th>
                      <th className="pb-2">Description</th>
                      <th className="pb-2 w-32">Merchant</th>
                      <th className="pb-2 w-28 text-right">Amount (RM)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {(claim.expenses || []).map((exp, idx) => (
                      <tr key={exp.id || idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                        <td className="py-3 text-slate-400 font-bold">{idx + 1}</td>
                        <td className="py-3 text-slate-600 dark:text-slate-300">{formatDate(exp.expense_date)}</td>
                        <td className="py-3 font-semibold text-slate-800 dark:text-slate-200">
                          {exp.expense_category?.name || "Other"}
                        </td>
                        <td className="py-3 text-slate-900 dark:text-slate-100 font-medium">
                          {exp.description}
                          {exp.notes && (
                            <span className="text-[11px] text-slate-400 block">{exp.notes}</span>
                          )}
                        </td>
                        <td className="py-3 text-slate-600 dark:text-slate-300">{exp.vendor || "-"}</td>
                        <td className="py-3 text-right font-bold text-slate-900 dark:text-slate-100">
                          {Number(exp.amount).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-200 dark:border-slate-700 font-black">
                      <td colSpan={5} className="py-3 text-right text-xs uppercase tracking-wider text-slate-500">
                        Total Amount:
                      </td>
                      <td className="py-3 text-right text-sm text-emerald-700 dark:text-emerald-400">
                        {formatCurrency(claim.total_amount)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Attached Receipts Gallery */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Attached Receipts & Supporting Documents ({claim.attachments?.length || 0})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(!claim.attachments || claim.attachments.length === 0) ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  No receipts attached.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {claim.attachments.map((att) => (
                    <div
                      key={att.id}
                      onClick={() => setPreviewAttachment(att)}
                      className="group flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-850 hover:border-emerald-500 hover:bg-emerald-50/20 cursor-pointer transition-all shadow-2xs"
                    >
                      <div className="flex items-center gap-3 truncate pr-2">
                        <div className="h-9 w-9 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center shrink-0">
                          <FileText className="w-5 h-5 text-emerald-700" />
                        </div>
                        <div className="truncate">
                          <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate group-hover:text-emerald-700">
                            {att.original_filename}
                          </p>
                          <p className="text-[10px] text-slate-400">
                            {formatFileSize(att.file_size)}
                          </p>
                        </div>
                      </div>
                      <Eye className="w-4 h-4 text-slate-400 group-hover:text-emerald-700 shrink-0" />
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
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-bold text-slate-900 dark:text-slate-100">
              Approval Progress & Decision Timeline
            </CardTitle>
          </CardHeader>
          <CardContent>
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
        <Card>
          <CardContent className="pt-6">
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
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-bold text-slate-900 dark:text-slate-100">
              Immutable Audit Log History
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-400 uppercase tracking-wider">
                    <th className="pb-2">Timestamp</th>
                    <th className="pb-2">Actor</th>
                    <th className="pb-2">Action</th>
                    <th className="pb-2">Notes / Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {(claim.approval_actions || []).map((act) => (
                    <tr key={act.id} className="py-2.5">
                      <td className="py-2.5 text-slate-500">{formatDateTime(act.created_at)}</td>
                      <td className="py-2.5 font-semibold text-slate-800 dark:text-slate-200">
                        {act.actor?.full_name || "User"} ({act.actor_role})
                      </td>
                      <td className="py-2.5 font-mono text-emerald-800 font-bold">{act.action}</td>
                      <td className="py-2.5 text-slate-600 dark:text-slate-400">{act.comment || "-"}</td>
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
    </div>
  );
}
