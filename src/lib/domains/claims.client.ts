import type { Claim, Profile } from "@/lib/types/database";
import { workspaceStore } from "./store";
import { iamClient } from "./iam.client";
import { masterDataClient } from "./master-data.client";

const CLAIMS_ENDPOINT = "/api/v1/claims";

export class ClaimsClient {
  private cachedClaimsVersion = -1;
  private cachedClaims: Claim[] = [];

  getClaims(_user?: Profile): Claim[] {
    void _user;
    const currentVersion = workspaceStore.getVersion();
    if (this.cachedClaimsVersion === currentVersion) {
      return this.cachedClaims;
    }

    const profiles = iamClient.getProfiles();
    const ministries = masterDataClient.getMinistries();
    const categories = masterDataClient.getCategories();
    const costCentres = masterDataClient.getCostCentres();

    this.cachedClaims = (workspaceStore.getState().claims || []).map(c => ({
      ...c,
      claimant: iamClient.getProfileById(c.claimant_id),
      submitted_by: iamClient.getProfileById(
        c.submitted_by_user_id || c.claimant_id
      ),
      ministry: ministries.find(m => m.id === c.ministry_id),
      cost_centre: costCentres.find(cc => cc.id === c.cost_centre_id),
      returned_by_user: c.returned_by
        ? iamClient.getProfileById(c.returned_by)
        : null,
      expenses: (c.expenses || []).map(e => ({
        ...e,
        expense_category: categories.find(
          cat => cat.id === e.expense_category_id
        ),
        cost_centre: costCentres.find(cc => cc.id === e.cost_centre_id),
        attachments: (c.attachments || []).filter(a => a.expense_id === e.id),
      })),
      workflow_steps: (c.workflow_steps || []).map(s => ({
        ...s,
        assigned_user: profiles.find(p => p.id === s.assigned_user_id),
        completed_by_user: profiles.find(p => p.id === s.completed_by),
      })),
      approval_actions: (c.approval_actions || []).map(a => ({
        ...a,
        actor: iamClient.getProfileById(a.actor_id),
      })),
      comments: (c.comments || []).map(comment => ({
        ...comment,
        author: iamClient.getProfileById(comment.author_id),
      })),
      finance_review: c.finance_review
        ? {
            ...c.finance_review,
            reviewer: iamClient.getProfileById(c.finance_review.reviewer_id),
          }
        : null,
      payment: c.payment
        ? {
            ...c.payment,
            processor: iamClient.getProfileById(c.payment.processed_by),
          }
        : null,
    }));
    this.cachedClaimsVersion = currentVersion;
    return this.cachedClaims;
  }

  getClaimById(id: string): Claim | null {
    return this.getClaims().find(c => c.id === id) || null;
  }

  async saveClaimDraft(payload: Record<string, unknown>): Promise<Claim> {
    const result = await workspaceStore.dispatchDomainCommand(
      CLAIMS_ENDPOINT,
      "save_draft",
      payload
    );
    return this.getClaimById(result.id)!;
  }

  async submitClaim(payload: Record<string, unknown>): Promise<Claim> {
    const result = await workspaceStore.dispatchDomainCommand(
      CLAIMS_ENDPOINT,
      "submit_claim",
      payload
    );
    return this.getClaimById(result.id)!;
  }

  async deleteClaim(id: string) {
    return workspaceStore.dispatchDomainCommand(
      CLAIMS_ENDPOINT,
      "delete_claim",
      { id }
    );
  }

  async addComment(
    id: string,
    _author: Profile,
    content: string,
    visibility: string
  ): Promise<Claim> {
    const result = await workspaceStore.dispatchDomainCommand(
      CLAIMS_ENDPOINT,
      "comment",
      {
        claim_id: id,
        version: this.getClaimById(id)?.version,
        content,
        visibility,
      }
    );
    return this.getClaimById(result.id)!;
  }
}

export const claimsClient = new ClaimsClient();
