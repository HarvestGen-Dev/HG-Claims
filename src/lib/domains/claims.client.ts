import type { Claim, Profile } from "@/lib/types/database";
import { workspaceStore } from "./store";
import { iamClient } from "./iam.client";
import { masterDataClient } from "./master-data.client";

const CLAIMS_ENDPOINT = "/api/v1/claims";

export class ClaimsClient {
  private cachedSources: Pick<ReturnType<typeof workspaceStore.getState>, "claims" | "profiles" | "ministries" | "categories" | "costCentres"> | null = null;
  private cachedClaims: Claim[] = [];

  getClaims(_user?: Profile): Claim[] {
    void _user;
    const state = workspaceStore.getState();
    if (this.cachedSources &&
      this.cachedSources.claims === state.claims &&
      this.cachedSources.profiles === state.profiles &&
      this.cachedSources.ministries === state.ministries &&
      this.cachedSources.categories === state.categories &&
      this.cachedSources.costCentres === state.costCentres) {
      return this.cachedClaims;
    }

    const profiles = iamClient.getProfiles();
    const ministries = masterDataClient.getMinistries();
    const categories = masterDataClient.getCategories();
    const costCentres = masterDataClient.getCostCentres();
    const profileById = new Map(profiles.map(profile => [profile.id, profile]));
    const ministryById = new Map(ministries.map(ministry => [ministry.id, ministry]));
    const categoryById = new Map(categories.map(category => [category.id, category]));
    const costCentreById = new Map(costCentres.map(centre => [centre.id, centre]));
    const profile = (id?: string | null) => id ? profileById.get(id) : undefined;

    this.cachedClaims = (state.claims || []).map(c => {
      const attachmentsByExpense = new Map<string, typeof c.attachments>();
      for (const attachment of c.attachments || []) {
        if (!attachment.expense_id) continue;
        const group = attachmentsByExpense.get(attachment.expense_id) || [];
        group.push(attachment);
        attachmentsByExpense.set(attachment.expense_id, group);
      }
      return {
      ...c,
      claimant: profile(c.claimant_id),
      submitted_by: profile(
        c.submitted_by_user_id || c.claimant_id
      ),
      ministry: ministryById.get(c.ministry_id),
      cost_centre: costCentreById.get(c.cost_centre_id || ""),
      returned_by_user: c.returned_by
        ? profile(c.returned_by)
        : null,
      expenses: (c.expenses || []).map(e => ({
        ...e,
        expense_category: categoryById.get(e.expense_category_id || ""),
        cost_centre: costCentreById.get(e.cost_centre_id),
        attachments: attachmentsByExpense.get(e.id) || [],
      })),
      workflow_steps: (c.workflow_steps || []).map(s => ({
        ...s,
        assigned_user: profile(s.assigned_user_id),
        completed_by_user: profile(s.completed_by),
      })),
      approval_actions: (c.approval_actions || []).map(a => ({
        ...a,
        actor: profile(a.actor_id),
      })),
      comments: (c.comments || []).map(comment => ({
        ...comment,
        author: profile(comment.author_id),
      })),
      finance_review: c.finance_review
        ? {
            ...c.finance_review,
            reviewer: profile(c.finance_review.reviewer_id),
          }
        : null,
      payment: c.payment
        ? {
            ...c.payment,
            processor: profile(c.payment.processed_by),
          }
        : null,
    }; });
    this.cachedSources = state;
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
