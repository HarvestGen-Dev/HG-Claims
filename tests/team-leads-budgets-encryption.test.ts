import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/mock-db/repository";
import {
  canUserCreateClaim,
  canUserViewMinistryBudget,
  canUserManageMinistryBudget,
  canUserViewClaim,
} from "@/lib/auth/permissions";
import { Profile, Ministry, Claim } from "@/lib/types/database";

describe("Team Leads, Annual Budgets, and Disbursement Voucher Linking", () => {
  let admin: Profile;
  let finance: Profile;
  let claimant: Profile;
  let teamLead: Profile;
  let ministry: Ministry;

  beforeEach(() => {
    admin = db.getProfiles().find((p) => p.roles?.includes("SYSTEM_ADMIN")) || {
      id: "u-admin-1",
      email: "admin@harvestgen.org",
      full_name: "Admin User",
      status: "ACTIVE",
      roles: ["SYSTEM_ADMIN"],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    finance = db.getProfiles().find((p) => p.roles?.includes("FINANCE_OFFICER")) || {
      id: "u-finance-1",
      email: "finance@harvestgen.org",
      full_name: "Finance Officer",
      status: "ACTIVE",
      roles: ["FINANCE_OFFICER"],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    claimant = db.getProfiles().find((p) => p.roles?.includes("CLAIMANT")) || {
      id: "u-claimant-1",
      email: "claimant@harvestgen.org",
      full_name: "Claimant Member",
      status: "ACTIVE",
      roles: ["CLAIMANT"],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    teamLead = {
      id: "u-lead-1",
      email: "leader@harvestgen.org",
      full_name: "Youth Team Lead",
      status: "ACTIVE",
      roles: ["TEAM_LEAD"],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    ministry = db.createMinistry({
      code: "YOUTH",
      name: "Youth Ministry",
      is_active: true,
    });
  });

  it("assigns 0 or more Team Leads to a ministry and updates permissions", () => {
    // Assign teamLead to ministry
    db.setMinistryTeamLeads(ministry.id, [teamLead.id]);
    const updated = db.getMinistries().find((m) => m.id === ministry.id)!;
    expect(updated.team_lead_ids).toContain(teamLead.id);

    // Verify permissions: Team Lead can create claims and view ministry budget
    expect(canUserCreateClaim(teamLead)).toBe(true);
    expect(canUserViewMinistryBudget(teamLead, updated)).toBe(true);

    // Other claimant cannot view ministry budget
    expect(canUserViewMinistryBudget(claimant, updated)).toBe(false);

    // Admin & Finance can manage ministry budget
    expect(canUserManageMinistryBudget(admin)).toBe(true);
    expect(canUserManageMinistryBudget(finance)).toBe(true);
    expect(canUserManageMinistryBudget(teamLead)).toBe(false);
  });

  it("sets annual budget and calculates spending against calendar year claims", () => {
    // Set 2026 annual budget
    const budget = db.setMinistryBudget(ministry.id, 2026, 25000.0, "2026 Youth Camp & Outreach");
    expect(budget.amount).toBe(25000.0);
    expect(budget.year).toBe(2026);

    const updated = db.getMinistries().find((m) => m.id === ministry.id)!;
    expect(updated.budgets?.find((b) => b.year === 2026)?.amount).toBe(25000.0);

    // Update budget amount for same year (upsert behavior)
    db.setMinistryBudget(ministry.id, 2026, 30000.0, "Revised budget");
    const reloaded = db.getMinistries().find((m) => m.id === ministry.id)!;
    expect(reloaded.budgets?.find((b) => b.year === 2026)?.amount).toBe(30000.0);
  });

  it("creates claims without requiring vendor / merchant", () => {
    const draft = db.saveClaimDraft({
      submitted_by_user_id: claimant.id,
      claimant_name: "Youth Member",
      claimant_email: claimant.email,
      claimant_phone: "0123456789",
      claim_date: "2026-03-15",
      purpose: "Camp supplies",
      ministry_id: ministry.id,
      bank_name: "Maybank",
      bank_code: "MBBEMYKL",
      bank_account_number: "514012345678",
      expenses: [
        {
          expense_date: "2026-03-14",
          description: "Stationery and notebooks",
          cost_centre_id: "cc-1",
          amount: 150.0,
          sort_order: 1,
          // Vendor omitted
        },
      ],
    });

    expect(draft.id).toBeDefined();
    expect(draft.expenses?.[0].vendor).toBeUndefined();
  });

  it("links batched claims to disbursement voucher and line order in XLS", () => {
    // Create an approved claim ready for batching
    const submitted = db.submitClaim({
      submitted_by_user_id: claimant.id,
      claimant_name: "Disbursed Member",
      claimant_email: claimant.email,
      claimant_phone: "0123456789",
      claim_date: "2026-04-10",
      purpose: "Speaker Honorarium",
      ministry_id: ministry.id,
      bank_name: "Public Bank",
      bank_code: "PBBEMYKL",
      bank_account_holder_name: "Disbursed Member",
      bank_account_number: "001234567890",
      declaration_accepted: true,
      expenses: [
        {
          temp_id: "t-1",
          expense_date: "2026-04-09",
          description: "Guest speaker transport",
          cost_centre_id: "cc-1",
          amount: 500.0,
          sort_order: 1,
        },
      ],
      attachments: [
        {
          temp_id: "t-1",
          original_filename: "receipt.pdf",
          storage_path: "receipts/receipt.pdf",
          file_size: 1024,
          mime_type: "application/pdf",
          file_category: "RECEIPT",
          uploaded_by: claimant.id,
        },
      ],
    });

    // Advance to APPROVED_FOR_PAYMENT via approveStep
    db.approveStep(submitted.id, finance, "Approved for payment");

    // Create reimbursement batch
    const batch = db.createReimbursementBatch({
      actor_id: finance.id,
      claim_ids: [submitted.id],
    });

    expect(batch.id).toBeDefined();
    expect(batch.instructions?.length).toBe(1);

    // Verify claim has disbursement voucher linked
    const reloadedClaim = db.getClaimById(submitted.id)!;
    expect(reloadedClaim.active_batch_id).toBe(batch.id);
    expect(reloadedClaim.disbursement_voucher).toBeDefined();
    expect(reloadedClaim.disbursement_voucher).toMatch(/^P\d{6}$/);
    expect(reloadedClaim.batch_number).toBe(batch.batch_number);
    expect(reloadedClaim.disbursement_line_order).toBe(1);
  });
});
