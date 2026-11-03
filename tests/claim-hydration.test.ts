import { afterEach, describe, expect, it } from "vitest";
import { claimsClient, workspaceStore } from "@/lib/domains";
import type { Claim } from "@/lib/types/database";

afterEach(() => workspaceStore.clear());

describe("Claim snapshot hydration", () => {
  it("keeps receipt associations and reuses claims after unrelated notifications change", () => {
    const claim = {
      id: "claim-1",
      submitted_by_user_id: "owner-1",
      claimant_id: "owner-1",
      claimant_name: "Owner",
      ministry_id: "ministry-1",
      claim_date: "2026-11-03",
      purpose: "Test expense",
      total_amount: 0.2,
      currency: "MYR",
      status: "DRAFT",
      declaration_accepted: false,
      created_at: "2026-11-03T00:00:00Z",
      updated_at: "2026-11-03T00:00:00Z",
      expenses: [{ id: "expense-1", claim_id: "claim-1", expense_date: "2026-11-03", cost_centre_id: "centre-1", description: "Test", amount: 0.2, sort_order: 1, created_at: "2026-11-03T00:00:00Z", updated_at: "2026-11-03T00:00:00Z" }],
      attachments: [{ id: "attachment-1", claim_id: "claim-1", expense_id: "expense-1", storage_path: "owner-1/test", original_filename: "receipt.pdf", mime_type: "application/pdf", file_size: 1, file_category: "RECEIPT", uploaded_by: "owner-1", created_at: "2026-11-03T00:00:00Z" }],
    } satisfies Claim;
    workspaceStore.patchState({ claims: [claim] });
    const first = claimsClient.getClaims();

    expect(first[0].expenses?.[0].attachments?.map(attachment => attachment.id)).toEqual(["attachment-1"]);
    workspaceStore.patchState({ notifications: [] });
    expect(claimsClient.getClaims()).toBe(first);

    workspaceStore.patchState({ claims: [{ ...claim, id: "claim-2" }] });
    expect(claimsClient.getClaims()).not.toBe(first);
  });
});
