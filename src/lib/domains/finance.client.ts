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
} from "@/lib/banking/bank-export-adapter";

const FINANCE_ENDPOINT = "/api/v1/finance";

export class FinanceClient {
  private cachedRulesVersion = -1;
  private cachedRules: ApprovalRule[] = [];

  getApprovalRules(): ApprovalRule[] {
    const currentVersion = workspaceStore.getVersion();
    if (this.cachedRulesVersion === currentVersion) {
      return this.cachedRules;
    }
    const ministries = masterDataClient.getMinistries();
    const categories = masterDataClient.getCategories();
    const profiles = iamClient.getProfiles();
    this.cachedRules = (workspaceStore.getState().approvalRules || []).map(
      r => ({
        ...r,
        ministry: ministries.find(m => m.id === r.ministry_id),
        expense_category: categories.find(c => c.id === r.expense_category_id),
        approver_user: profiles.find(p => p.id === r.approver_user_id),
      })
    );
    this.cachedRulesVersion = currentVersion;
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
    const profiles = iamClient.getProfiles();
    const allClaims = claimsClient.getClaims();
    const claimMap = new Map(allClaims.map(c => [c.id, c]));

    return (workspaceStore.getState().reimbursementBatches || []).map(b => ({
      ...b,
      creator: profiles.find(p => p.id === b.created_by) || null,
      instructions: (b.instructions || []).map(inst => ({
        ...inst,
        claims: (inst.claims || []).map(ic => ({
          ...ic,
          claim: claimMap.get(ic.claim_id) || null,
        })),
      })),
    }));
  }

  getReimbursementBatchById(id: string): ReimbursementBatch | null {
    return this.getReimbursementBatches().find(b => b.id === id) || null;
  }

  getEligibleClaimsForReimbursement(): Claim[] {
    return claimsClient
      .getClaims()
      .filter(
        c =>
          c.status === "APPROVED_FOR_PAYMENT" &&
          !c.payment &&
          !c.active_batch_id &&
          (!c.reimbursement_status ||
            ["ELIGIBLE", "RELEASED", "FAILED"].includes(c.reimbursement_status))
      );
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
    const claims = claimsClient
      .getClaims()
      .filter(c => !["DRAFT", "CANCELLED"].includes(c.status));
    const paid = claims.filter(c => c.status === "PAID");
    const ministries = new Map<
      string,
      { name: string; total: number; count: number }
    >();
    const costCentres = new Map<string, { name: string; total: number }>();

    claims.forEach(c => {
      const ministry = ministries.get(c.ministry_id) || {
        name: c.ministry?.name || "General",
        total: 0,
        count: 0,
      };
      ministry.total += Number(c.total_amount);
      ministry.count++;
      ministries.set(c.ministry_id, ministry);
      c.expenses?.forEach(e => {
        const cc = costCentres.get(e.cost_centre_id) || {
          name: e.cost_centre
            ? `${e.cost_centre.code} - ${e.cost_centre.name}`
            : "General",
          total: 0,
        };
        cc.total += Number(e.amount);
        costCentres.set(e.cost_centre_id, cc);
      });
    });

    return {
      totalClaims: claims.length,
      awaitingReview: claims.filter(
        c => c.status === "PENDING_FINANCE_REVIEW"
      ).length,
      awaitingPayment: claims.filter(
        c => c.status === "APPROVED_FOR_PAYMENT"
      ).length,
      paidCount: paid.length,
      totalPaidAmount: paid.reduce(
        (sum, c) => sum + Number(c.total_amount),
        0
      ),
      totalPendingAmount: claims
        .filter(c => !["PAID", "REJECTED"].includes(c.status))
        .reduce((sum, c) => sum + Number(c.total_amount), 0),
      byMinistry: Array.from(ministries.values()),
      byCostCentre: Array.from(costCentres.values()),
      byCategory: [],
    };
  }
}

export const financeClient = new FinanceClient();
