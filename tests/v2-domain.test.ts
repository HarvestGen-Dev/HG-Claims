import { describe, expect, it } from "vitest";
import {
  canUserCreateClaim,
  canUserViewClaim,
  canUserViewMinistryBudget,
  canUserApproveClaim,
  canUserManageSystem,
} from "@/lib/auth/permissions";
import {
  EXPENSE_CLASSIFICATIONS,
  validateItemClassification,
  needsBeneficiary,
} from "@/lib/claims-v2";
import { STATUS_MAP } from "@/lib/utils/formatters";
import { currentUserRoles } from "@/lib/auth/roles";
import { getJompayReviewRows, previewJompayClaims } from "@/lib/banking/jompay";
import { previewReimbursementSelection } from "@/lib/banking/reimbursement-preview";
import type {
  Claim,
  ExpenseCategory,
  Ministry,
  Profile,
  ReimbursementBatch,
} from "@/lib/types/database";
const member = {
  id: "member",
  full_name: "Church Member",
  email: "member@test.invalid",
  status: "ACTIVE",
  created_at: "2026-11-10",
  updated_at: "2026-11-10",
} as Profile;
const team = {
  id: "team",
  code: "TEAM",
  name: "Team",
  team_lead_ids: ["lead"],
  require_team_lead_approval: true,
  is_active: true,
} as Ministry;
const claim = {
  id: "claim",
  submitted_by_user_id: "member",
  claimant_id: "supplier",
  ministry_id: "team",
  ministry: team,
  status: "PENDING_MINISTRY_APPROVAL",
  total_amount: 12.34,
  currency: "MYR",
} as Claim;
const lead = { ...member, id: "lead", roles: ["TEAM_LEAD"] } as Profile;
const finance = { ...member, id: "finance", roles: ["FINANCE"] } as Profile;
const cats = EXPENSE_CLASSIFICATIONS.map(([code, name], index) => ({
  id: String(index),
  code,
  name,
  is_active: true,
})) as ExpenseCategory[];
describe("v2 authenticated baseline and privileged scope", () => {
  it("displays legacy Finance aliases once while retaining a separate Team Lead role", () => {
    expect(
      currentUserRoles([
        "SYSTEM_ADMIN",
        "FINANCE_OFFICER",
        "FINANCE",
        "TEAM_LEAD",
      ]),
    ).toEqual(["FINANCE", "TEAM_LEAD"]);
    expect(currentUserRoles(["CLAIMANT"])).toEqual([]);
    expect(currentUserRoles(undefined)).toEqual([]);
  });
  it.each([undefined, []])(
    "allows baseline access when roles are %s",
    (roles) => {
      expect(canUserCreateClaim({ ...member, roles })).toBe(true);
      expect(canUserViewClaim({ ...member, roles }, claim, team)).toBe(true);
    },
  );
  it("does not grant team access by selecting its Team", () => {
    expect(canUserViewClaim({ ...member, id: "unrelated" }, claim, team)).toBe(
      false,
    );
    expect(canUserViewMinistryBudget(member, team)).toBe(false);
  });
  it("scopes Team Lead visibility and review to assigned teams", () => {
    expect(canUserViewClaim(lead, claim, team)).toBe(true);
    expect(
      canUserViewClaim(lead, { ...claim, ministry_id: "other" }, team),
    ).toBe(false);
    expect(
      canUserViewMinistryBudget(lead, {
        ...team,
        id: "other",
        team_lead_ids: [],
      }),
    ).toBe(false);
    expect(canUserApproveClaim(lead, claim)).toBe(true);
    expect(canUserManageSystem(lead)).toBe(false);
  });
  it("allows combined roles at both applicable stages", () => {
    const both = { ...lead, roles: ["TEAM_LEAD", "FINANCE"] } as Profile;
    expect(canUserApproveClaim(both, claim)).toBe(true);
    expect(
      canUserApproveClaim(both, { ...claim, status: "PENDING_FINANCE_REVIEW" }),
    ).toBe(true);
    expect(canUserManageSystem(both)).toBe(true);
  });
  it("prevents self Team Lead approval and allows Finance self approval", () => {
    expect(
      canUserApproveClaim(lead, { ...claim, submitted_by_user_id: "lead" }),
    ).toBe(false);
    expect(
      canUserApproveClaim(finance, {
        ...claim,
        submitted_by_user_id: "finance",
        status: "PENDING_FINANCE_REVIEW",
      }),
    ).toBe(true);
  });
  it("denies inactive accounts even if privileged", () => {
    expect(canUserCreateClaim({ ...finance, status: "INACTIVE" })).toBe(false);
    expect(
      canUserViewClaim({ ...finance, status: "SUSPENDED" }, claim, team),
    ).toBe(false);
  });
});
describe("claim classification rules", () => {
  it("provides all 16 classifications including Utilities", () => {
    expect(cats).toHaveLength(16);
    expect(cats.some((c) => c.name === "Utilities")).toBe(true);
  });
  it.each([
    "V2_FOOD",
    "V2_TRANSPORT",
    "V2_ACCOMMODATION",
    "V2_GIFTS",
    "V2_MEMBER_CARE",
    "V2_SUPPORT",
  ])("requires beneficiary for %s", (code) => {
    const c = cats.find((c) => c.code === code)!;
    expect(needsBeneficiary(c)).toBe(true);
    expect(
      validateItemClassification(
        { expense_category_id: c.id, description: "" },
        cats,
      ),
    ).toMatch(/Who was it for/);
    expect(
      validateItemClassification(
        { expense_category_id: c.id, beneficiary_type: "EXTERNAL" },
        cats,
      ),
    ).toBeNull();
  });
  it("accepts short Other explanations and rejects empty ones", () => {
    const id = cats.find((c) => c.code === "V2_OTHER")!.id;
    expect(
      validateItemClassification(
        { expense_category_id: id, description: " " },
        cats,
      ),
    ).toMatch(/explanation/);
    expect(
      validateItemClassification(
        { expense_category_id: id, description: "A" },
        cats,
      ),
    ).toBeNull();
  });
  it("does not require descriptions or beneficiaries for Utilities", () => {
    expect(
      validateItemClassification(
        {
          expense_category_id: cats.find((c) => c.code === "V2_UTILITIES")!.id,
          description: "",
        },
        cats,
      ),
    ).toBeNull();
  });
});
describe("payment presentation and JomPAY row contract", () => {
  it("keeps all review stages Submitted and payment states distinct", () => {
    for (const s of [
      "PENDING_MINISTRY_APPROVAL",
      "PENDING_FINANCE_REVIEW",
      "PENDING_FINAL_APPROVAL",
    ] as const)
      expect(STATUS_MAP[s].label).toBe("Submitted");
    expect(STATUS_MAP.APPROVED_FOR_PAYMENT.label).toBe("Approved");
    expect(STATUS_MAP.PAID.label).toBe("Processed");
  });
  const details = {
    biller_name: "TNB",
    biller_code: "000123",
    reference_1: "000456",
    reference_2: "000789",
    fail_email_1: "finance@test.invalid",
  };
  const bill = {
    ...claim,
    status: "APPROVED_FOR_PAYMENT",
    payee_payment_method: "JOMPAY",
    approved_snapshot: { approved_amount_cents: 1234, jompay: details },
  } as Claim;
  it("previews one row per bill with same payee", () => {
    const rows = previewJompayClaims([bill, { ...bill, id: "bill2" }]);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.eligible)).toBe(true);
    expect(
      previewReimbursementSelection([bill], [bill.id]).blockedClaims,
    ).toHaveLength(1);
  });
  it("preserves identifiers and formats money in frozen review rows", () => {
    const batch = {
      payment_method: "JOMPAY",
      instructions: [
        {
          line_order: 1,
          claim_count: 1,
          amount_cents: 1234,
          jompay_snapshot: details,
        },
        {
          line_order: 2,
          claim_count: 1,
          amount_cents: 1200,
          jompay_snapshot: details,
        },
      ],
    } as ReimbursementBatch;
    expect(getJompayReviewRows(batch)).toEqual([
      [
        "000123",
        "000456",
        "000789",
        "12.34",
        "finance@test.invalid",
        "",
        "TNB",
      ],
      [
        "000123",
        "000456",
        "000789",
        "12.00",
        "finance@test.invalid",
        "",
        "TNB",
      ],
    ]);
  });
  it("rejects aggregated JomPAY rows", () => {
    expect(() =>
      getJompayReviewRows({
        payment_method: "JOMPAY",
        instructions: [{ claim_count: 2, jompay_snapshot: details }],
      } as ReimbursementBatch),
    ).toThrow(/individual/);
  });
});
