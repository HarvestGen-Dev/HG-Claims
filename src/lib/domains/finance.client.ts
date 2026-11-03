import type {
  ApprovalRule,
  Claim,
  Profile,
  ReimbursementBatch,
} from "@/lib/types/database";
import { workspaceStore } from "./store";
import { iamClient } from "./iam.client";
import { masterDataClient } from "./master-data.client";
import { claimsClient } from "./claims.client";
import {
  previewReimbursementSelection,
  type ReimbursementPreviewResult,
} from "@/lib/banking/reimbursement-preview";
import { calculateTotalAmount, moneyToCents } from "@/lib/utils/calculations";

const FINANCE_ENDPOINT = "/api/v1/finance";

export class FinanceClient {
  private cachedRulesKey = "";
  private cachedRules: ApprovalRule[] = [];

  private cachedBatchesKey = "";
  private cachedBatches: ReimbursementBatch[] = [];

  private cachedEligibleKey = "";
  private cachedEligibleClaims: Claim[] = [];

  private cachedStatsKey = "";
  private cachedStats: {
    totalClaims: number;
    awaitingReview: number;
    awaitingPayment: number;
    paidCount: number;
    totalPaidAmount: number;
    totalPendingAmount: number;
    byMinistry: { name: string; count: number; total: number }[];
    byCategory: never[];
  } | null = null;

  constructor() {
    workspaceStore.onClear(() => {
      this.cachedRulesKey = "";
      this.cachedRules = [];
      this.cachedBatchesKey = "";
      this.cachedBatches = [];
      this.cachedEligibleKey = "";
      this.cachedEligibleClaims = [];
      this.cachedStatsKey = "";
      this.cachedStats = null;
    });
  }

  getApprovalRules(): ApprovalRule[] {
    const compositeKey = workspaceStore.getCompositeVersion(
      "finance",
      "master-data",
      "iam"
    );
    if (this.cachedRulesKey === compositeKey) {
      return this.cachedRules;
    }
    this.cachedRules = (workspaceStore.getState().approvalRules || []).map(
      (r) => ({
        ...r,
        ministry: r.ministry_id
          ? masterDataClient.getMinistryById(r.ministry_id)
          : undefined,
        expense_category: r.expense_category_id
          ? masterDataClient.getCategoryById(r.expense_category_id)
          : undefined,
        approver_user: r.approver_user_id
          ? iamClient.getProfileById(r.approver_user_id)
          : undefined,
      })
    );
    this.cachedRulesKey = compositeKey;
    return this.cachedRules;
  }

  createApprovalRule(data: Partial<ApprovalRule>) {
    return workspaceStore.dispatchDomainCommand(
      FINANCE_ENDPOINT,
      "master_save",
      { table: "approval_rules", data }
    );
  }

  updateApprovalRule(id: string, data: Partial<ApprovalRule>) {
    return workspaceStore.dispatchDomainCommand(
      FINANCE_ENDPOINT,
      "master_save",
      { table: "approval_rules", id, data }
    );
  }

  async deleteApprovalRule(id: string) {
    return workspaceStore.dispatchDomainCommand(
      FINANCE_ENDPOINT,
      "master_delete",
      { table: "approval_rules", id }
    );
  }

  private async transitionClaim(
    action: string,
    id: string,
    data: Record<string, unknown>
  ): Promise<Claim> {
    const result = await workspaceStore.dispatchDomainCommand(
      FINANCE_ENDPOINT,
      action,
      {
        ...data,
        claim_id: id,
        version: claimsClient.getClaimById(id)?.version,
      }
    );
    return claimsClient.getClaimById(result.id)!;
  }

  approveStep(id: string, _actor: Profile, reason?: string) {
    return this.transitionClaim("approve", id, { reason, auto_verify: true });
  }

  returnForClarification(id: string, _actor: Profile, reason: string) {
    return this.transitionClaim("return", id, { reason });
  }

  rejectClaim(id: string, _actor: Profile, reason: string) {
    return this.transitionClaim("reject", id, { reason });
  }

  verifyClaim(id: string, _actor: Profile, reason?: string) {
    return this.transitionClaim("verify", id, { reason });
  }

  recordPayment(data: { claim_id: string; [key: string]: unknown }) {
    const payload = { ...data };
    delete payload.processor;
    return this.transitionClaim("pay", data.claim_id, payload);
  }

  correctClaimMetadata(data: { claim_id: string; [key: string]: unknown }) {
    const payload = { ...data };
    delete payload.actor;
    return this.transitionClaim("correct", data.claim_id, payload);
  }

  getReimbursementBatches(): ReimbursementBatch[] {
    const compositeKey = workspaceStore.getCompositeVersion(
      "finance",
      "claims",
      "iam",
      "master-data"
    );
    if (this.cachedBatchesKey === compositeKey) {
      return this.cachedBatches;
    }

    this.cachedBatches = (
      workspaceStore.getState().reimbursementBatches || []
    ).map((b) => ({
      ...b,
      creator: iamClient.getProfileById(b.created_by) || null,
      instructions: (b.instructions || []).map((inst) => ({
        ...inst,
        claims: (inst.claims || []).map((ic) => ({
          ...ic,
          claim: claimsClient.getClaimById(ic.claim_id) || null,
        })),
      })),
    }));
    this.cachedBatchesKey = compositeKey;
    return this.cachedBatches;
  }

  getReimbursementBatchById(id: string): ReimbursementBatch | null {
    return this.getReimbursementBatches().find((b) => b.id === id) || null;
  }

  getEligibleClaimsForReimbursement(): Claim[] {
    const compositeKey = workspaceStore.getCompositeVersion(
      "claims",
      "finance",
      "master-data",
      "iam"
    );
    if (this.cachedEligibleKey === compositeKey) {
      return this.cachedEligibleClaims;
    }
    this.cachedEligibleClaims = claimsClient
      .getClaims()
      .filter(
        (c) =>
          c.status === "APPROVED_FOR_PAYMENT" &&
          !c.payment &&
          !c.active_batch_id &&
          (!c.reimbursement_status ||
            ["ELIGIBLE", "RELEASED", "FAILED"].includes(c.reimbursement_status))
      );
    this.cachedEligibleKey = compositeKey;
    return this.cachedEligibleClaims;
  }

  previewReimbursementBatch(
    selectedClaimIds: string[],
    candidateClaims?: Claim[]
  ): ReimbursementPreviewResult {
    const candidates =
      candidateClaims || this.getEligibleClaimsForReimbursement();
    return previewReimbursementSelection(candidates, selectedClaimIds);
  }

  async finalizeReimbursementBatch(data: {
    claim_ids: string[];
    preview_digest?: string;
    notes?: string;
    mark_exported?: boolean;
    request_key?: string;
  }): Promise<{ id: string; batch_number: string }> {
    const res = await workspaceStore.dispatchDomainCommand(
      FINANCE_ENDPOINT,
      "finalize_reimbursement_batch",
      {
        ...data,
        request_key: data.request_key || crypto.randomUUID(),
      }
    );
    return res as { id: string; batch_number: string };
  }

  async disburseReimbursementBatch(data: {
    batch_id: string;
    bank_reference?: string;
    payment_date?: string;
  }) {
    return workspaceStore.dispatchDomainCommand(
      FINANCE_ENDPOINT,
      "disburse_reimbursement_batch",
      data
    );
  }

  async recordBatchBankUpload(data: {
    batch_id: string;
    bank_upload_reference?: string;
  }) {
    return workspaceStore.dispatchDomainCommand(
      FINANCE_ENDPOINT,
      "record_batch_bank_upload",
      data
    );
  }

  async reconcileBatchInstruction(data: {
    instruction_id: string;
    outcome: "PAID" | "FAILED";
    bank_reference?: string;
    payment_date?: string;
    failure_reason?: string;
  }) {
    return workspaceStore.dispatchDomainCommand(
      FINANCE_ENDPOINT,
      "reconcile_batch_instruction",
      data
    );
  }

  async voidReimbursementBatch(data: {
    batch_id: string;
    void_reason: string;
  }) {
    return workspaceStore.dispatchDomainCommand(
      FINANCE_ENDPOINT,
      "void_reimbursement_batch",
      data
    );
  }

  getFinanceStats() {
    const compositeKey = workspaceStore.getCompositeVersion(
      "claims",
      "finance",
      "master-data",
      "iam"
    );
    if (this.cachedStatsKey === compositeKey && this.cachedStats) {
      return this.cachedStats;
    }

    const claims = claimsClient
      .getClaims()
      .filter((c) => !["DRAFT", "CANCELLED"].includes(c.status));
    const paid = claims.filter((c) => c.status === "PAID");
    const ministries = new Map<
      string,
      { name: string; totalCents: number; count: number }
    >();
    claims.forEach((c) => {
      const ministry = ministries.get(c.ministry_id) || {
        name: c.ministry?.name || "General",
        totalCents: 0,
        count: 0,
      };
      ministry.totalCents += moneyToCents(c.total_amount) ?? 0;
      ministry.count++;
      ministries.set(c.ministry_id, ministry);
    });

    this.cachedStats = {
      totalClaims: claims.length,
      awaitingReview: claims.filter(
        (c) => c.status === "PENDING_FINANCE_REVIEW"
      ).length,
      awaitingPayment: claims.filter(
        (c) => c.status === "APPROVED_FOR_PAYMENT"
      ).length,
      paidCount: paid.length,
      totalPaidAmount: calculateTotalAmount(
        paid.map((c) => ({ amount: c.total_amount }))
      ),
      totalPendingAmount: calculateTotalAmount(
        claims
          .filter((c) => !["PAID", "REJECTED"].includes(c.status))
          .map((c) => ({ amount: c.total_amount }))
      ),
      byMinistry: Array.from(ministries.values(), ({ totalCents, ...rest }) => ({
        ...rest,
        total: totalCents / 100,
      })),
      byCategory: [],
    };
    this.cachedStatsKey = compositeKey;
    return this.cachedStats;
  }
}

export const financeClient = new FinanceClient();
