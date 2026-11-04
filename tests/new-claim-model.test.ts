import { describe, it, expect } from "vitest";
import { db } from "@/lib/mock-db/repository";
import { Profile } from "@/lib/types/database";
import { canUserCreateClaim } from "@/lib/auth/permissions";
import { generateClaimsCsv } from "@/lib/utils/export-csv";

describe("Claimant Submitter Model & Receipt-Level Cost Centres", () => {
  const claimant: Profile = {
    id: "u-pastor-peter",
    email: "peter@newlife.org.my",
    full_name: "Pastor Peter",
    status: "ACTIVE",
    roles: ["CLAIMANT"],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const systemAdmin: Profile = {
    id: "u-admin-mary",
    email: "mary@newlife.org.my",
    full_name: "Admin Mary",
    status: "ACTIVE",
    roles: ["SYSTEM_ADMIN"],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const unassignedUser: Profile = {
    id: "u-member-john",
    email: "john@example.com",
    full_name: "John Member",
    status: "ACTIVE",
    roles: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const financeOfficer: Profile = {
    id: "u-finance-sarah",
    email: "finance@newlife.org.my",
    full_name: "Sarah Finance",
    status: "ACTIVE",
    roles: ["FINANCE_OFFICER"],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  describe("1. Claim Creation Role Guards", () => {
    it("should allow CLAIMANT and SYSTEM_ADMIN to create claims", () => {
      expect(canUserCreateClaim(claimant)).toBe(true);
      expect(canUserCreateClaim(systemAdmin)).toBe(true);
    });

    it("denies claim creation without a role", () => {
      expect(canUserCreateClaim(unassignedUser)).toBe(false);
      expect(canUserCreateClaim(null)).toBe(false);
    });
  });

  describe("2. Submitter & Claimant Snapshot", () => {
    it("should record submitted_by_user_id and snapshot claimant details on claim submission", () => {
      const claim = db.submitClaim({
        submitted_by_user_id: claimant.id,
        claimant_name: "Alice Tan (Worship Team)",
        claimant_email: "alice.tan@gmail.com",
        claimant_phone: "+60 17-888 1234",
        ministry_id: "m-worship-02",
        claim_date: "2026-09-08",
        purpose: "Sunday Service Sound & Music Consumables",
        declaration_accepted: true,
        expenses: [
          {
            temp_id: "rec-01",
            expense_date: "2026-09-05",
            expense_category_id: "cat-supplies-04",
            cost_centre_id: "cc-worship-01",
            description: "XLR Audio Cables and Batteries",
            vendor: "Yamaha Music PJ",
            amount: 145.00,
            sort_order: 1,
          },
        ],
        attachments: [
          {
            temp_id: "rec-01",
            original_filename: "yamaha_invoice.pdf",
            storage_path: "receipts/yamaha_invoice.pdf",
            file_size: 15000,
            mime_type: "application/pdf",
            file_category: "RECEIPT",
            uploaded_by: claimant.id,
          },
        ],
      });

      expect(claim.submitted_by_user_id).toBe(claimant.id);
      expect(claim.claimant_name).toBe("Alice Tan (Worship Team)");
      expect(claim.claimant_email).toBe("alice.tan@gmail.com");
      expect(claim.claimant_phone).toBe("+60 17-888 1234");
      expect(claim.expenses?.[0].cost_centre_id).toBe("cc-worship-01");
      expect(claim.attachments?.[0].expense_id).toBe(claim.expenses?.[0].id);
    });
  });

  describe("3. Self-Approval Security Enforcement", () => {
    it("should strictly prevent submitter from approving their own submitted claim, even on behalf of another claimant", () => {
      const claim = db.submitClaim({
        submitted_by_user_id: claimant.id,
        claimant_name: "External Speaker Pastor David",
        claimant_email: "david@overseaschurch.org",
        claimant_phone: "+65 9123 4567",
        ministry_id: "m-worship-02",
        claim_date: "2026-09-08",
        purpose: "Guest speaker transport reimbursement",
        declaration_accepted: true,
        expenses: [
          {
            temp_id: "rec-t1",
            expense_date: "2026-09-07",
            expense_category_id: "cat-trans-01",
            cost_centre_id: "cc-worship-01",
            description: "Airport Grab rides",
            vendor: "Grab Malaysia",
            amount: 95.00,
            sort_order: 1,
          },
        ],
        attachments: [
          {
            temp_id: "rec-t1",
            original_filename: "grab_airport.pdf",
            storage_path: "receipts/grab_airport.pdf",
            file_size: 12000,
            mime_type: "application/pdf",
            file_category: "RECEIPT",
            uploaded_by: claimant.id,
          },
        ],
      });

      // The claimant attempts to approve their own claim
      expect(() => {
        db.approveStep(claim.id, claimant, "Self-approval attempt by submitter");
      }).toThrow(/cannot approve/i);
    });
  });

  describe("4. Receipt-Level Cost Centres (Distinct Cost Centres per Receipt)", () => {
    it("should support different cost centres on individual receipt items within the same claim", () => {
      const claim = db.submitClaim({
        submitted_by_user_id: claimant.id,
        claimant_name: "Mark Lee",
        claimant_email: "mark.lee@example.com",
        claimant_phone: "+60 12-345 6789",
        ministry_id: "m-youth-01",
        claim_date: "2026-09-09",
        purpose: "Combined Youth & Worship Camp Logistics",
        declaration_accepted: true,
        expenses: [
          {
            temp_id: "r1",
            expense_date: "2026-09-07",
            expense_category_id: "cat-trans-01",
            cost_centre_id: "cc-youth-01", // Youth Ministry Budget
            description: "Equipment Van Rental",
            vendor: "GoCar / Hertz",
            amount: 320.00,
            sort_order: 1,
          },
          {
            temp_id: "r2",
            expense_date: "2026-09-08",
            expense_category_id: "cat-supplies-04",
            cost_centre_id: "cc-worship-01", // Worship Ministry Budget
            description: "Acoustic stage tape and cables",
            vendor: "MR DIY Jaya One",
            amount: 85.50,
            sort_order: 2,
          },
        ],
        attachments: [
          {
            temp_id: "r1",
            original_filename: "van_rental.pdf",
            storage_path: "receipts/van_rental.pdf",
            file_size: 20000,
            mime_type: "application/pdf",
            file_category: "RECEIPT",
            uploaded_by: claimant.id,
          },
          {
            temp_id: "r2",
            original_filename: "mrdiy_receipt.jpg",
            storage_path: "receipts/mrdiy_receipt.jpg",
            file_size: 5000,
            mime_type: "image/jpeg",
            file_category: "RECEIPT",
            uploaded_by: claimant.id,
          },
        ],
      });

      expect(claim.expenses?.length).toBe(2);
      expect(claim.expenses?.[0].cost_centre_id).toBe("cc-youth-01");
      expect(claim.expenses?.[1].cost_centre_id).toBe("cc-worship-01");
      expect(claim.total_amount).toBe(405.50);

      // Verify attachments are mapped to distinct expenses
      const exp1 = claim.expenses?.[0];
      const exp2 = claim.expenses?.[1];
      const att1 = claim.attachments?.find((a) => a.expense_id === exp1?.id);
      const att2 = claim.attachments?.find((a) => a.expense_id === exp2?.id);

      expect(att1?.original_filename).toBe("van_rental.pdf");
      expect(att2?.original_filename).toBe("mrdiy_receipt.jpg");
    });
  });

  describe("5. CSV Export Formatting", () => {
    it("should export one row per receipt with claimant snapshot and submitter without cost centres", () => {
      const claim = db.getClaims(systemAdmin).find((c) => c.expenses && c.expenses.length > 1);
      expect(claim).toBeDefined();

      if (claim) {
        const csv = generateClaimsCsv([claim]);
        const lines = csv.split("\r\n").filter(Boolean);

        // Header + one row per expense item
        expect(lines.length).toBe(1 + claim.expenses!.length);

        const headerLine = lines[0];
        expect(headerLine).toContain("Claim Number");
        expect(headerLine).toContain("Claim Date");
        expect(headerLine).toContain("Status");
        expect(headerLine).toContain("Submitted By");
        expect(headerLine).toContain("Claimant Name");
        expect(headerLine).toContain("Claimant Email");
        expect(headerLine).toContain("Receipt Date");
        expect(headerLine).not.toContain("Cost Centre");
        expect(headerLine).toContain("Amount");
        expect(headerLine).toContain("Receipt Attached");
      }
    });
  });
});
