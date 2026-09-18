import { describe, expect, it } from "vitest";
import { canUserVerifyClaim } from "@/lib/auth/permissions";
import type { Claim, ClaimStatus, Profile, RoleCode } from "@/lib/types/database";

const user: Profile = {
  id: "reviewer", email: "reviewer@example.com", full_name: "Reviewer",
  status: "ACTIVE", roles: ["MINISTRY_LEADER", "FINANCE_OFFICER", "SYSTEM_ADMIN"],
  created_at: "2026-09-18", updated_at: "2026-09-18",
};
const claim: Claim = {
  id: "claim", submitted_by_user_id: "submitter", claimant_id: "claimant",
  claimant_name: "Claimant", ministry_id: "ministry", claim_date: "2026-09-18",
  purpose: "Supplies", total_amount: 10, currency: "MYR",
  status: "PENDING_FINANCE_REVIEW", declaration_accepted: true,
  created_at: "2026-09-18", updated_at: "2026-09-18",
};

describe("Finance verification eligibility", () => {
  it.each<RoleCode>(["FINANCE_OFFICER", "SYSTEM_ADMIN"])("allows an independent %s during finance review", role => {
    expect(canUserVerifyClaim({ ...user, roles: [role] }, claim)).toBe(true);
  });

  it("allows an independent reviewer with all three roles", () => {
    expect(canUserVerifyClaim(user, claim)).toBe(true);
  });

  it("blocks the submitter even with all three roles", () => {
    expect(canUserVerifyClaim(user, { ...claim, submitted_by_user_id: user.id })).toBe(false);
  });

  it("blocks the claimant even when someone else submitted the claim", () => {
    expect(canUserVerifyClaim(user, { ...claim, claimant_id: user.id })).toBe(false);
  });

  it.each<ClaimStatus>([
    "DRAFT", "SUBMITTED", "PENDING_MINISTRY_APPROVAL", "PENDING_FINAL_APPROVAL",
    "RETURNED_FOR_CLARIFICATION", "REJECTED", "APPROVED", "APPROVED_FOR_PAYMENT",
    "PAID", "CANCELLED",
  ])("blocks verification in %s", status => {
    expect(canUserVerifyClaim(user, { ...claim, status })).toBe(false);
  });

  it("blocks users without finance or administrator access", () => {
    expect(canUserVerifyClaim({ ...user, roles: ["MINISTRY_LEADER"] }, claim)).toBe(false);
  });

  it("blocks inactive accounts and missing user or claim data", () => {
    expect(canUserVerifyClaim({ ...user, status: "INACTIVE" }, claim)).toBe(false);
    expect(canUserVerifyClaim({ ...user, status: "SUSPENDED" }, claim)).toBe(false);
    expect(canUserVerifyClaim(null, claim)).toBe(false);
    expect(canUserVerifyClaim(user, null)).toBe(false);
  });
});
