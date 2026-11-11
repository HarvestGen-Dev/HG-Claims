"use client";

import { formatRole } from "@/lib/auth/roles";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
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
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ClaimStatusBadge } from "./ClaimStatusBadge";
import { ClaimLink } from "./ClaimLink";
import { ClaimTimeline } from "./ClaimTimeline";
import { ClaimComments } from "./ClaimComments";

const ReturnClarificationModal = dynamic(
  () =>
    import("./ReturnClarificationModal").then(
      (m) => m.ReturnClarificationModal,
    ),
  { ssr: false },
);
const RejectModal = dynamic(
  () => import("./RejectModal").then((m) => m.RejectModal),
  { ssr: false },
);
const PaymentModal = dynamic(
  () => import("./PaymentModal").then((m) => m.PaymentModal),
  { ssr: false },
);
const AdminCorrectionModal = dynamic(
  () => import("./AdminCorrectionModal").then((m) => m.AdminCorrectionModal),
  { ssr: false },
);
const ReceiptViewerModal = dynamic(
  () => import("./ReceiptViewerModal").then((m) => m.ReceiptViewerModal),
  { ssr: false },
);

import { useAuth } from "@/lib/auth/context";
import {
  iamClient,
  claimsClient,
  financeClient,
  workspaceStore,
} from "@/lib/domains";
import { Claim, ClaimAttachment } from "@/lib/types/database";
import { showToast } from "@/lib/utils/toast";

import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatFileSize,
} from "@/lib/utils/formatters";

interface ClaimDetailViewProps {
  claim: Claim;
}

export function ClaimDetailView({ claim: initialClaim }: ClaimDetailViewProps) {
  const router = useRouter();
  const { user, canApprove, canEdit, canPay, canVerify, hasRole } = useAuth();
  const [claim, setClaim] = useState<Claim>(initialClaim);
  useEffect(() => {
    setClaim(initialClaim);
  }, [initialClaim]);
  useEffect(
    () =>
      workspaceStore.subscribeDomains(["claims", "master-data", "iam"], () => {
        const latest = claimsClient.getClaimById(initialClaim.id);
        if (latest) setClaim(latest);
      }),
    [initialClaim.id],
  );
  const [activeTab, setActiveTab] = useState<
    "details" | "workflow" | "comments" | "audit"
  >("details");

  // Modals
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showCorrectionModal, setShowCorrectionModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [previewAttachment, setPreviewAttachment] =
    useState<ClaimAttachment | null>(null);

  const [loadingAction, setLoadingAction] = useState(false);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<
    string | null
  >(null);

  const handleDeleteClaim = async () => {
    if (!user) return;
    try {
      setLoadingAction(true);
      await claimsClient.deleteClaim(claim.id);
      showToast.success("Claim has been deleted.", "Claim Deleted");
      router.push("/claims");
    } catch (err: any) {
      showToast.error(err.message || "Failed to delete claim", "Delete Error");
      setLoadingAction(false);
    }
  };

  const handleApprove = async () => {
    if (!user || !canApprove(claim) || loadingAction) return;
    try {
      setLoadingAction(true);
      const updated = await financeClient.approveStep(
        claim.id,
        user,
        "Approved in accordance with ministry guidelines.",
      );
      setClaim(updated);
      showToast.success("Review approval recorded.", "Claim Approved");
    } catch (err: any) {
      showToast.error(
        err.message || "Failed to approve claim",
        "Approval Error",
      );
    } finally {
      setLoadingAction(false);
    }
  };

  const handleReturnConfirm = async (reason: string) => {
    if (!user) return;
    try {
      setLoadingAction(true);
      const updated = await financeClient.returnForClarification(
        claim.id,
        user,
        reason,
      );
      setClaim(updated);
      setShowReturnModal(false);
      showToast.info(
        "Claim returned to submitter for clarification.",
        "Claim Returned",
      );
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
      const updated = await financeClient.rejectClaim(claim.id, user, reason);
      setClaim(updated);
      setShowRejectModal(false);
      showToast.warning("Claim has been marked as rejected.", "Claim Rejected");
    } catch (err: any) {
      showToast.error(
        err.message || "Failed to reject claim",
        "Rejection Error",
      );
    } finally {
      setLoadingAction(false);
    }
  };

  const handleVerifyFinance = async () => {
    if (
      !user ||
      !canVerify(claim) ||
      claim.finance_review?.receipts_verified ||
      loadingAction
    )
      return;
    try {
      setLoadingAction(true);
      const updated = await financeClient.verifyClaim(
        claim.id,
        user,
        "All receipts verified.",
      );
      setClaim(updated);
      showToast.success("Finance verification recorded.", "Finance Verified");
    } catch (err: any) {
      showToast.error(
        err.message || "Failed to verify claim",
        "Verification Error",
      );
    } finally {
      setLoadingAction(false);
    }
  };

  const handlePaymentConfirm = async (paymentData: any) => {
    if (!user || !canPay(claim) || loadingAction) return;
    try {
      setLoadingAction(true);
      const updated = await financeClient.recordPayment({
        ...paymentData,
        claim_id: claim.id,
        processor: user,
      });
      setClaim(updated);
      setShowPaymentModal(false);
      showToast.success(
        `Payment recorded successfully (Ref: ${paymentData.payment_reference})`,
        "Payment Recorded",
      );
    } catch (err: any) {
      showToast.error(
        err.message || "Failed to record payment",
        "Payment Error",
      );
    } finally {
      setLoadingAction(false);
    }
  };

  const handleCorrectionConfirm = async (data: any) => {
    if (!user) return;
    try {
      setLoadingAction(true);
      const updated = await financeClient.correctClaimMetadata({
        ...data,
        claim_id: claim.id,
        actor: user,
      });
      setClaim(updated);
      setShowCorrectionModal(false);
      showToast.success(
        "Changes have been made to administrative fields.",
        "Claim Updated",
      );
    } catch (err: any) {
      showToast.error(
        err.message || "Failed to save correction",
        "Update Error",
      );
    } finally {
      setLoadingAction(false);
    }
  };

  const handleAddComment = async (
    content: string,
    visibility: "PUBLIC_WORKFLOW" | "FINANCE_INTERNAL",
  ) => {
    try {
      if (!user) return;
      const updated = await claimsClient.addComment(
        claim.id,
        user,
        content,
        visibility,
      );
      setClaim(updated);
      showToast.success(
        visibility === "FINANCE_INTERNAL"
          ? "Internal finance note added."
          : "Comment posted successfully.",
        "Comment Added",
      );
    } catch (error) {
      showToast.error(
        error instanceof Error ? error.message : "Unable to save comment.",
        "Comment Error",
      );
    }
  };

  const submitterId = claim.submitted_by_user_id || claim.claimant_id;
  const isSubmitter = submitterId === user?.id;
  const isFinanceUser = hasRole("FINANCE_OFFICER") || hasRole("SYSTEM_ADMIN");
  const isSystemAdmin = hasRole("SYSTEM_ADMIN");
  const isApproverUser = canApprove(claim);
  const isEditable = canEdit(claim);

  const claimantName =
    claim.claimant_name || claim.claimant?.full_name || "Unknown Claimant";
  const submitterName =
    claim.submitted_by?.full_name || claim.claimant?.full_name || "Claimant";

  return (
    <div className="claim-page mx-auto w-full max-w-5xl space-y-6 pb-8">
      <section
        aria-label="Claim summary"
        className="space-y-5 rounded-xl border border-border bg-card p-4 sm:p-6"
      >
        <div className="flex items-start gap-3">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => router.back()}
            aria-label="Back to claims"
            className="w-11 shrink-0"
          >
            <ArrowLeft className="size-5" />
          </Button>
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <h1>{claim.claim_number || "Draft claim"}</h1>
              <ClaimStatusBadge
                status={claim.status}
                reimbursementStatus={claim.reimbursement_status}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              {claimantName} · {claim.ministry?.name || "Team not selected"}
            </p>
            <p className="text-xs text-muted-foreground">
              Submitted by {submitterName} ·{" "}
              {formatDate(claim.submitted_at || claim.created_at)}
            </p>
            {claim.context_name && (
              <p className="text-sm">
                {claim.context_kind?.toLowerCase()}:{" "}
                <strong>{claim.context_name}</strong>
              </p>
            )}
          </div>
        </div>

        <div
          className="flex flex-wrap items-center gap-2 border-t border-border pt-4"
          aria-label="Claim actions"
        >
          {isEditable && (
            <ClaimLink
              href={`/claims/${claim.id}/edit`}
              variant="default"
              className="w-full sm:w-auto"
            >
              <Edit className="size-4" />
              {claim.status === "RETURNED_FOR_CLARIFICATION"
                ? "Fix & Resubmit"
                : "Edit Draft"}
            </ClaimLink>
          )}
          {(isSubmitter || isFinanceUser) && (
            <Button
              variant="outline"
              disabled={loadingAction}
              className="gap-2"
              onClick={async () => {
                setLoadingAction(true);
                try {
                  const duplicate = await claimsClient.duplicateClaim(
                    claim.id,
                    crypto.randomUUID(),
                  );
                  router.push(`/claims/${duplicate.id}/edit`);
                } catch (error) {
                  showToast.error(
                    error instanceof Error
                      ? error.message
                      : "Unable to duplicate claim.",
                  );
                } finally {
                  setLoadingAction(false);
                }
              }}
            >
              Duplicate Claim
            </Button>
          )}
          {isFinanceUser && claim.status !== "DRAFT" && (
            <Button
              variant="outline"
              onClick={() => setShowCorrectionModal(true)}
              disabled={loadingAction}
            >
              Edit classifications
            </Button>
          )}
          {!claim.recurring_schedule_id &&
            (claim.status === "DRAFT" || claim.status === "CANCELLED") &&
            (isSubmitter || hasRole("SYSTEM_ADMIN")) && (
              <Button
                variant="ghost"
                onClick={() => setShowDeleteModal(true)}
                disabled={loadingAction}
                className="gap-2 text-red-700 hover:bg-red-50 sm:ml-auto"
              >
                <Trash2 className="size-4" />
                Delete {claim.status === "DRAFT" ? "Draft" : "Claim"}
              </Button>
            )}
        </div>
      </section>

      {isFinanceUser &&
        claim.payee_payment_method !== "JOMPAY" &&
        claim.payee_verification_required && (
          <Alert variant="warning">
            <AlertTitle>Review bank details before approving.</AlertTitle>
            <AlertDescription>
              New or changed payment details are Unverified. This does not block
              approval.
              <Button
                className="ml-2 mt-2"
                variant="outline"
                disabled={loadingAction}
                onClick={async () => {
                  setLoadingAction(true);
                  try {
                    await workspaceStore.dispatchDomainCommand(
                      "/api/v1/finance",
                      "verify_claim_payment",
                      { claim_id: claim.id, version: claim.version },
                    );
                    await claimsClient.fetchClaimDetail(claim.id, {
                      force: true,
                    });
                  } catch (error) {
                    showToast.error(
                      error instanceof Error
                        ? error.message
                        : "Unable to verify.",
                    );
                  } finally {
                    setLoadingAction(false);
                  }
                }}
              >
                Confirm details verified
              </Button>
            </AlertDescription>
          </Alert>
        )}
      {(isApproverUser ||
        (isFinanceUser &&
          (canPay(claim) ||
            (canVerify(claim) && !claim.finance_review?.receipts_verified) ||
            (claim.status === "APPROVED_FOR_PAYMENT" &&
              !claim.active_batch_id &&
              !claim.payment)))) && (
        <section
          aria-label="Review actions"
          className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-5"
        >
          <div>
            <h2 className="text-base font-semibold">
              {isApproverUser ? "Review claim" : "Finance actions"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {isApproverUser
                ? "Check the claim details before recording your decision."
                : "Review receipts or record a completed payment."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 [&>button]:flex-auto sm:[&>button]:flex-none">
            {isApproverUser && (
              <>
                <Button
                  onClick={handleApprove}
                  loading={loadingAction}
                  disabled={loadingAction}
                  className="gap-2"
                >
                  {!loadingAction && <CheckCircle2 className="size-4" />}Approve
                  Claim
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowReturnModal(true)}
                  disabled={loadingAction}
                  className="gap-2"
                >
                  <RotateCcw className="size-4" />
                  Return
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowRejectModal(true)}
                  disabled={loadingAction}
                  className="gap-2 text-red-700"
                >
                  <XCircle className="size-4" />
                  Reject
                </Button>
              </>
            )}
            {isFinanceUser && (
              <>
                {canPay(claim) && (
                  <Button
                    onClick={() => setShowPaymentModal(true)}
                    disabled={loadingAction}
                    className="gap-2"
                  >
                    <Banknote className="size-4" />
                    Record Payment
                  </Button>
                )}
                {canVerify(claim) &&
                  !claim.finance_review?.receipts_verified && (
                    <Button
                      variant="outline"
                      onClick={handleVerifyFinance}
                      loading={loadingAction}
                      disabled={loadingAction}
                      className="gap-2"
                    >
                      {!loadingAction && <ShieldCheck className="size-4" />}
                      Verify Receipts
                    </Button>
                  )}
                {claim.status === "APPROVED_FOR_PAYMENT" &&
                  !claim.active_batch_id &&
                  !claim.payment && (
                    <Button
                      variant="outline"
                      disabled={loadingAction}
                      onClick={() => setShowReturnModal(true)}
                    >
                      Return for correction
                    </Button>
                  )}
              </>
            )}
          </div>
        </section>
      )}

      {actionSuccessMessage && (
        <Alert variant="success" className="text-xs">
          <CheckCircle2 className="w-4 h-4" />
          <AlertTitle className="text-xs font-semibold">Success</AlertTitle>
          <AlertDescription className="text-xs">
            {actionSuccessMessage}
          </AlertDescription>
        </Alert>
      )}

      {/* Return for Clarification Notice */}
      {claim.status === "RETURNED_FOR_CLARIFICATION" && (
        <Alert
          variant="destructive"
          className="text-xs bg-rose-50/80 border-rose-200 text-rose-950"
        >
          <RotateCcw className="w-4 h-4 text-rose-600" />
          <AlertTitle className="font-semibold text-xs text-rose-900">
            Returned for clarification
          </AlertTitle>
          <AlertDescription className="text-xs text-rose-800">
            <p className="mt-1">
              {claim.clarification_reason ||
                "Approver requested additional information or receipts."}
            </p>
          </AlertDescription>
        </Alert>
      )}

      <div className="claim-tabs" role="group" aria-label="Claim sections">
        <button
          type="button"
          aria-pressed={activeTab === "details"}
          onClick={() => setActiveTab("details")}
        >
          Claim Overview
        </button>
        <button
          type="button"
          aria-pressed={activeTab === "workflow"}
          onClick={() => setActiveTab("workflow")}
        >
          Workflow & Timeline
        </button>
        <button
          type="button"
          aria-pressed={activeTab === "comments"}
          onClick={() => setActiveTab("comments")}
        >
          Comments ({claim.comments?.length || 0})
        </button>
        {isSystemAdmin && (
          <button
            type="button"
            aria-pressed={activeTab === "audit"}
            onClick={() => setActiveTab("audit")}
          >
            Audit History
          </button>
        )}
      </div>

      {/* TAB 1: DETAILS & EXPENSES */}
      {activeTab === "details" && (
        <div className="space-y-4">
          {/* Metadata Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Payee & Submitter Card */}
            <Card className="border-zinc-200/80 shadow-2xs">
              <CardContent className="p-4 space-y-3 text-sm">
                <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider block">
                  Payee & Submitter
                </span>
                <div>
                  <p className="text-[10px] text-zinc-400">Pay to</p>
                  <p className="font-semibold text-zinc-900 dark:text-zinc-100">
                    {claimantName}
                  </p>
                  <p className="text-[11px] text-zinc-500 font-mono">
                    {claim.claimant_email || "-"}
                  </p>
                  <p className="text-[11px] text-zinc-500 font-mono">
                    {claim.claimant_phone || "-"}
                  </p>
                  {claim.jompay_details && (
                    <div className="space-y-1 border-t pt-2">
                      <p className="font-medium">
                        JomPAY · {claim.jompay_details.biller_name}
                      </p>
                      <p>Biller Code: {claim.jompay_details.biller_code}</p>
                      <p>Reference 1: {claim.jompay_details.reference_1}</p>
                      {claim.jompay_details.reference_2 && (
                        <p>Reference 2: {claim.jompay_details.reference_2}</p>
                      )}
                    </div>
                  )}
                  {(claim.bank_name || claim.bank_account_number) && (
                    <div className="mt-1.5 pt-1.5 border-t border-zinc-100 dark:border-zinc-800">
                      <span className="text-[10px] text-zinc-400 block">
                        Bank Account:
                      </span>
                      <p className="font-medium text-zinc-800 dark:text-zinc-200">
                        {claim.bank_name || "Bank unspecified"}
                      </p>
                      <p className="font-mono text-emerald-700 dark:text-emerald-400 font-semibold">
                        {claim.bank_account_number || "-"}
                      </p>
                    </div>
                  )}
                </div>
                <div className="pt-1.5 border-t border-zinc-100 dark:border-zinc-800">
                  <p className="text-[10px] text-zinc-400">Submitted by</p>
                  <p className="font-medium text-zinc-800 dark:text-zinc-200">
                    {submitterName}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Ministry Context Card */}
            <Card className="border-zinc-200/80 shadow-2xs">
              <CardContent className="p-4 space-y-3 text-sm">
                <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider block">
                  Team & Reference
                </span>
                <div>
                  <p className="text-[10px] text-zinc-400">Team</p>
                  <p className="font-medium text-zinc-900 dark:text-zinc-100">
                    {claim.ministry?.name}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-zinc-400">Submission Date</p>
                  <p className="font-mono text-zinc-800 dark:text-zinc-200">
                    {formatDate(claim.claim_date)}
                  </p>
                </div>
                {claim.disbursement_voucher && (
                  <div>
                    <p className="text-[10px] text-zinc-400">
                      Disbursement Voucher
                    </p>
                    <p className="font-mono font-bold text-zinc-900 dark:text-zinc-100">
                      {claim.disbursement_voucher}
                    </p>
                  </div>
                )}
                {claim.batch_number && (
                  <div>
                    <p className="text-[10px] text-zinc-400">
                      Bank payment file
                    </p>
                    <p className="font-mono text-zinc-800 dark:text-zinc-200">
                      {claim.active_batch_id ? (
                        <Link
                          href={`/finance/batches/${claim.active_batch_id}`}
                          className="text-primary hover:underline font-semibold"
                        >
                          {claim.batch_number}
                        </Link>
                      ) : (
                        `${claim.batch_number}`
                      )}
                    </p>
                  </div>
                )}
                {claim.internal_reference && (
                  <div>
                    <p className="text-[10px] text-zinc-400">Reference Code</p>
                    <p className="font-mono text-zinc-800 dark:text-zinc-200">
                      {claim.internal_reference}
                    </p>
                  </div>
                )}
                {claim.payment && (
                  <div className="pt-1.5 border-t border-zinc-100 dark:border-zinc-800">
                    <p className="text-emerald-700 text-[10px] font-semibold">
                      Payment Settled
                    </p>
                    <p className="font-mono text-zinc-900 dark:text-zinc-100 text-[11px]">
                      Ref: {claim.payment.payment_reference} (
                      {formatDate(claim.payment.payment_date)})
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Total Banner */}
            <Card className="border-border bg-muted/40 shadow-none">
              <CardContent className="p-4">
                <span className="text-[10px] text-zinc-400 uppercase tracking-wider font-semibold block">
                  Total Claim Amount
                </span>
                <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">
                  {formatCurrency(claim.total_amount)}
                </p>
                <p className="text-[10px] text-zinc-400 mt-1">
                  {claim.expenses?.length || 0} expense{" "}
                  {claim.expenses?.length === 1 ? "item" : "items"}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Ministry Purpose */}
          {claim.purpose && (
            <Card className="border-zinc-200/80 shadow-2xs">
              <CardHeader className="py-2.5 px-4 border-b border-zinc-100 dark:border-zinc-800">
                <CardTitle className="text-[10px] uppercase tracking-wider text-zinc-400 font-semibold">
                  Claim purpose
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3.5">
                <p className="text-xs text-zinc-800 dark:text-zinc-200 leading-relaxed">
                  {claim.purpose}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Expense Breakdown Table */}
          <Card className="border-zinc-200/80 shadow-2xs overflow-hidden">
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-4">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
                Expense items
              </CardTitle>
              <span className="text-xs font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                Subtotal: {formatCurrency(claim.total_amount)}
              </span>
            </CardHeader>
            <CardContent className="p-0">
              {/* Mobile Card List for Receipts */}
              <div className="md:hidden divide-y divide-zinc-200/80 dark:divide-zinc-800">
                {(claim.expenses || []).map((exp, idx) => {
                  const expAttachment = (claim.attachments || []).find(
                    (a) => a.expense_id === exp.id,
                  );
                  return (
                    <div key={exp.id || idx} className="p-3.5 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex min-w-0 items-start gap-2">
                          <span className="h-5 w-5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 flex items-center justify-center text-[10px] font-bold font-mono">
                            {idx + 1}
                          </span>
                          <div>
                            <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                              {exp.description ||
                                exp.expense_category?.name ||
                                "Expense item"}
                            </p>
                            {exp.expense_category?.name && (
                              <p className="mt-1 text-xs text-muted-foreground">
                                {exp.expense_category.name}
                                {exp.beneficiary_type
                                  ? ` · ${exp.beneficiary_type === "INTERNAL" ? "Internal" : "External"}`
                                  : ""}
                              </p>
                            )}
                            <p className="text-[11px] text-zinc-500 font-mono">
                              {formatDate(exp.expense_date)}
                            </p>
                          </div>
                        </div>
                        <span className="shrink-0 whitespace-nowrap text-sm font-semibold tabular-nums">
                          RM {Number(exp.amount).toFixed(2)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-zinc-500 pt-1">
                        {exp.vendor && (
                          <span>
                            Merchant:{" "}
                            <strong className="text-zinc-700 dark:text-zinc-300">
                              {exp.vendor}
                            </strong>
                          </span>
                        )}
                      </div>

                      {expAttachment && (
                        <div className="pt-1.5">
                          <button
                            type="button"
                            onClick={() => setPreviewAttachment(expAttachment)}
                            className="inline-flex min-h-11 max-w-full items-center gap-2 rounded-lg border border-input px-3 py-2 text-left text-sm font-medium hover:bg-muted"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span className="min-w-0 break-all">
                              View receipt: {expAttachment.original_filename}
                            </span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Desktop Table View */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-zinc-50/50 border-b border-zinc-100 dark:bg-zinc-900/50 dark:border-zinc-800 text-zinc-400 text-[10px] font-semibold uppercase tracking-wider">
                      <th className="py-2 px-4 w-8">#</th>
                      <th className="py-2 px-4 w-24">Date</th>
                      <th className="py-2 px-4">Description</th>
                      <th className="py-2 px-4 w-28">Merchant</th>
                      <th className="py-2 px-4 w-24 text-center">Receipt</th>
                      <th className="py-2 px-4 w-28 text-right">Amount (RM)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
                    {(claim.expenses || []).map((exp, idx) => {
                      const expAttachment = (claim.attachments || []).find(
                        (a) => a.expense_id === exp.id,
                      );
                      return (
                        <tr
                          key={exp.id || idx}
                          className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/40"
                        >
                          <td className="py-2.5 px-4 text-zinc-400 font-mono text-[11px]">
                            {idx + 1}
                          </td>
                          <td className="py-2.5 px-4 text-zinc-500 font-mono text-[11px]">
                            {formatDate(exp.expense_date)}
                          </td>
                          <td className="py-2.5 px-4 text-zinc-900 dark:text-zinc-100">
                            <span>{exp.description}</span>
                            {exp.expense_category?.name && (
                              <span className="block text-xs">
                                {exp.expense_category.name}
                                {exp.beneficiary_type
                                  ? ` · ${exp.beneficiary_type === "INTERNAL" ? "Internal" : "External"}`
                                  : ""}
                              </span>
                            )}
                            {exp.notes && (
                              <span className="text-[10px] text-zinc-400 block">
                                {exp.notes}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-4 text-zinc-500">
                            {exp.vendor || "-"}
                          </td>
                          <td className="py-2.5 px-4 text-center">
                            {expAttachment ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setPreviewAttachment(expAttachment)
                                }
                                className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                              >
                                <Eye className="w-3 h-3" />
                                <span>View</span>
                              </button>
                            ) : (
                              <span className="text-[10px] text-zinc-400">
                                -
                              </span>
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
                      <td
                        colSpan={5}
                        className="py-2.5 px-4 text-right text-[10px] uppercase tracking-wider text-zinc-500"
                      >
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
              {!claim.attachments || claim.attachments.length === 0 ? (
                <div className="py-6 text-center text-xs text-zinc-400">
                  No receipts attached.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                  {claim.attachments.map((att) => (
                    <button
                      type="button"
                      aria-label={`View ${att.original_filename}`}
                      key={att.id}
                      onClick={() => setPreviewAttachment(att)}
                      className="group flex min-w-0 items-center justify-between p-3 text-left focus-visible:ring-2 focus-visible:ring-ring rounded-lg border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-zinc-400 cursor-pointer transition-all shadow-2xs"
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
                    </button>
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

      {/* TAB 4: AUDIT HISTORY (System Admin Only) */}
      {activeTab === "audit" && isSystemAdmin && (
        <section className="space-y-3">
          <h2 className="font-semibold">Classification changes</h2>
          {(claim.classification_changes || []).map((change) => (
            <div
              className="border rounded-lg p-3 text-sm break-words"
              key={change.id}
            >
              <p>
                {formatDateTime(change.created_at)} ·{" "}
                {iamClient.getProfileById(change.editor_id)?.full_name ||
                  change.editor_id}
              </p>
              <p className="font-medium">{change.field}</p>
              <p>
                {JSON.stringify(change.old_value)} →{" "}
                {JSON.stringify(change.new_value)}
              </p>
            </div>
          ))}
        </section>
      )}
      {activeTab === "audit" && isSystemAdmin && (
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
                      <td className="py-2.5 px-4 text-zinc-500 font-mono text-[11px]">
                        {formatDateTime(act.created_at)}
                      </td>
                      <td className="py-2.5 px-4 font-medium text-zinc-800 dark:text-zinc-200">
                        {act.actor?.full_name || "User"} (
                        {formatRole(act.actor_role)})
                      </td>
                      <td className="py-2.5 px-4 font-mono text-zinc-900 dark:text-zinc-100 font-semibold text-[11px]">
                        {act.action}
                      </td>
                      <td className="py-2.5 px-4 text-zinc-500">
                        {act.comment || "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Modals */}
      {showReturnModal && (
        <ReturnClarificationModal
          open={showReturnModal}
          claimNumber={claim.claim_number}
          onConfirm={handleReturnConfirm}
          onCancel={() => setShowReturnModal(false)}
          loading={loadingAction}
        />
      )}

      {showRejectModal && (
        <RejectModal
          open={showRejectModal}
          claimNumber={claim.claim_number}
          onConfirm={handleRejectConfirm}
          onCancel={() => setShowRejectModal(false)}
          loading={loadingAction}
        />
      )}

      {showPaymentModal && (
        <PaymentModal
          open={showPaymentModal}
          claim={claim}
          onConfirm={handlePaymentConfirm}
          onCancel={() => setShowPaymentModal(false)}
          loading={loadingAction}
        />
      )}

      {showCorrectionModal && (
        <AdminCorrectionModal
          open={showCorrectionModal}
          claim={claim}
          onConfirm={handleCorrectionConfirm}
          onCancel={() => setShowCorrectionModal(false)}
          loading={loadingAction}
        />
      )}

      {previewAttachment && (
        <ReceiptViewerModal
          attachment={previewAttachment}
          onClose={() => setPreviewAttachment(null)}
        />
      )}

      {/* Delete Claim Confirmation Modal */}
      <Dialog
        open={showDeleteModal}
        onOpenChange={(open) =>
          !open && !loadingAction && setShowDeleteModal(false)
        }
      >
        <DialogHeader>
          <DialogTitle className="text-red-700 flex items-center gap-2">
            <Trash2 className="w-5 h-5 text-red-600" />
            Delete {claim.status === "DRAFT" ? "Draft" : "Claim"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 my-2 text-sm text-slate-600">
          <p>
            Are you sure you want to permanently delete{" "}
            {claim.claim_number ? (
              <strong className="font-mono text-slate-900">
                {claim.claim_number}
              </strong>
            ) : (
              "this draft"
            )}
            ?
          </p>
          <p className="text-xs text-red-600 bg-red-50 p-2.5 rounded border border-red-200">
            This action cannot be undone. All expense items, receipts, and
            history attached to this claim will be permanently removed.
          </p>
        </div>
        <DialogFooter className="mt-4">
          <Button
            variant="outline"
            onClick={() => setShowDeleteModal(false)}
            disabled={loadingAction}
          >
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
