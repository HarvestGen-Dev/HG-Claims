import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "@/lib/mock-db/repository";
import { Profile } from "@/lib/types/database";
import {
  canUserCreateClaim,
  canUserReviewClaim,
  canUserApproveClaim,
  canUserRecordPayment,
  canUserManageSystem,
  isOnboardingCompleted
} from "@/lib/auth/permissions";
import { showToast } from "@/lib/utils/toast";
import { calculateTotalAmount } from "@/lib/utils/calculations";
import { formatCurrency, formatFileSize } from "@/lib/utils/formatters";
import { formatClaimNumber } from "@/lib/utils/claim-number";
import { generateClaimsCsv } from "@/lib/utils/export-csv";

describe("Comprehensive NLCC System & Workflow Test Suite", () => {
  const admin: Profile = {
    id: "test-admin-audit",
    email: "admin.audit@newlife.org.my",
    full_name: "Admin Tester",
    status: "ACTIVE",
    onboarding_completed_at: "2026-01-01T00:00:00Z",
    roles: ["SYSTEM_ADMIN"],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const leader: Profile = {
    id: "test-leader-audit",
    email: "leader.audit@newlife.org.my",
    full_name: "Pastor Andrew",
    status: "ACTIVE",
    ministry_id: "m-worship-02",
    onboarding_completed_at: "2026-01-01T00:00:00Z",
    roles: ["MINISTRY_LEADER"],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const finance: Profile = {
    id: "test-finance-audit",
    email: "finance.audit@newlife.org.my",
    full_name: "Grace Finance",
    status: "ACTIVE",
    onboarding_completed_at: "2026-01-01T00:00:00Z",
    roles: ["FINANCE_OFFICER"],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  describe("1. Toast & Flash Notification System", () => {
    let originalWindow: any;

    beforeEach(() => {
      originalWindow = global.window;
      const store: Record<string, string> = {};
      const mockSessionStorage = {
        setItem: (key: string, value: string) => { store[key] = value; },
        getItem: (key: string) => store[key] || null,
        removeItem: (key: string) => { delete store[key]; },
        clear: () => {},
      };
      // @ts-ignore
      global.window = {
        sessionStorage: mockSessionStorage,
        dispatchEvent: () => true,
      };
    });

    afterEach(() => {
      global.window = originalWindow;
    });

    it("should correctly serialize and store flash toasts in sessionStorage", () => {
      showToast.flashSuccess("Claim has been submitted successfully.", "Claim Submitted");
      const saved = window.sessionStorage.getItem("nlcc_flash_toast");
      expect(saved).toBeDefined();

      const parsed = JSON.parse(saved!);
      expect(parsed.type).toBe("success");
      expect(parsed.title).toBe("Claim Submitted");
      expect(parsed.message).toBe("Claim has been submitted successfully.");

      showToast.flashInfo("Workflow configuration updated.", "Settings Saved");
      const infoSaved = JSON.parse(window.sessionStorage.getItem("nlcc_flash_toast")!);
      expect(infoSaved.type).toBe("info");
      expect(infoSaved.title).toBe("Settings Saved");
    });
  });

  describe("2. Master Data Management & Auditing", () => {
    it("should create, update, and soft-deactivate an Expense Category with audit logging", () => {
      const initialCount = db.getCategories().length;

      // 1. Create
      const newCat = db.createCategory({
        code: "TECH_EQUIP",
        name: "Technical Equipment & Sound Gear",
        description: "Microphones, DI boxes, and mixers",
        display_order: 10,
        is_active: true,
      });
      expect(newCat.code).toBe("TECH_EQUIP");
      expect(db.getCategories().length).toBe(initialCount + 1);

      // 2. Update
      const updatedCat = db.updateCategory(newCat.id, {
        name: "Audio Visual & Tech Equipment",
      });
      expect(updatedCat.name).toBe("Audio Visual & Tech Equipment");

      // 3. Soft-deactivate
      const deleted = db.deleteCategory(newCat.id);
      expect(deleted).toBe(true);

      const found = db.getCategories().find(c => c.id === newCat.id);
      expect(found?.is_active).toBe(false);

      // 4. Verify audit trail
      const logs = db.getAuditLogs().filter(l => l.entity_id === newCat.id);
      expect(logs.length).toBeGreaterThan(0);
    });

    it("should create, update, and assign cost centres to ministries", () => {
      const newCC = db.createCostCentre({
        code: "CC-MEDIA-09",
        name: "Media & Livestream Production",
        ministry_id: "m-worship-02",
        description: "Cameras, streaming software, and lighting",
        is_active: true,
      });

      expect(newCC.code).toBe("CC-MEDIA-09");
      expect(newCC.ministry_id).toBe("m-worship-02");

      const updatedCC = db.updateCostCentre(newCC.id, {
        name: "Media, Streaming & Video Production",
      });
      expect(updatedCC.name).toBe("Media, Streaming & Video Production");
    });
  });

  describe("3. System Settings & Numbering Generation", () => {
    it("should update organization settings and claim form policy", () => {
      db.updateSetting("claim_numbering", {
        prefix: "NLCC-TEST",
        year_format: "YYYY",
        digits: 5,
      }, admin.id);

      const numbering = db.getSetting("claim_numbering");
      expect(numbering.prefix).toBe("NLCC-TEST");
      expect(numbering.digits).toBe(5);

      const formatted = formatClaimNumber("NLCC-TEST", 2026, 42);
      expect(formatted).toBe("NLCC-TEST-2026-000042");
    });

    it("should update and retrieve approval thresholds", () => {
      db.updateSetting("approval_thresholds", {
        final_approval_threshold: 1500,
        currency: "MYR",
      }, admin.id);

      const threshold = db.getSetting("approval_thresholds");
      expect(threshold.final_approval_threshold).toBe(1500);
    });
  });

  describe("4. Calculation and Currency Formatters", () => {
    it("should accurately compute subtotal, tax, and handling without floating point errors", () => {
      const expenses = [
        { amount: 19.99 },
        { amount: 0.01 },
        { amount: 100.50 },
        { amount: 200.45 },
      ];
      const total = calculateTotalAmount(expenses);
      expect(total).toBe(320.95);
    });

    it("should format currency consistently as Malaysian Ringgit (RM)", () => {
      expect(formatCurrency(1234.5)).toBe("RM 1,234.50");
      expect(formatCurrency(0)).toBe("RM 0.00");
      expect(formatCurrency(-50)).toBe("RM -50.00");
    });

    it("should format file sizes cleanly", () => {
      expect(formatFileSize(500)).toBe("500 B");
      expect(formatFileSize(1024 * 150)).toBe("150 KB");
      expect(formatFileSize(1024 * 1024 * 3.5)).toBe("3.5 MB");
    });
  });

  describe("5. Complete End-to-End Claim Lifecycle & Audit Trail", () => {
    let createdClaimId: string;

    it("Step 1: Save as Draft", () => {
      const draft = db.saveClaimDraft({
        submitted_by_user_id: leader.id,
        claimant_name: "Volunteer Chloe",
        claimant_email: "chloe@example.com",
        claimant_phone: "+60 18-999 1111",
        ministry_id: "m-worship-02",
        claim_date: "2026-09-10",
        purpose: "Sunday Service Stage Flowers",
        expenses: [
          {
            temp_id: "e1",
            expense_date: "2026-09-09",
            expense_category_id: "cat-supplies-04",
            cost_centre_id: "cc-worship-01",
            description: "Fresh Floral Arrangement",
            amount: 120.00,
            sort_order: 1,
          },
        ],
        attachments: [
          {
            temp_id: "e1",
            original_filename: "florist_receipt.pdf",
            storage_path: "receipts/florist.pdf",
            file_size: 45000,
            mime_type: "application/pdf",
            file_category: "RECEIPT",
            uploaded_by: leader.id,
          },
        ],
      });

      expect(draft.status).toBe("DRAFT");
      expect(draft.total_amount).toBe(120.00);
      createdClaimId = draft.id;
    });

    it("Step 2: Submit Draft to Finance Review", () => {
      const submitted = db.submitClaim({
        id: createdClaimId,
        submitted_by_user_id: leader.id,
        claimant_name: "Volunteer Chloe",
        claimant_email: "chloe@example.com",
        claimant_phone: "+60 18-999 1111",
        ministry_id: "m-worship-02",
        claim_date: "2026-09-10",
        purpose: "Sunday Service Stage Flowers",
        declaration_accepted: true,
        expenses: [
          {
            temp_id: "e1",
            expense_date: "2026-09-09",
            expense_category_id: "cat-supplies-04",
            cost_centre_id: "cc-worship-01",
            description: "Fresh Floral Arrangement",
            amount: 120.00,
            sort_order: 1,
          },
        ],
        attachments: [
          {
            temp_id: "e1",
            original_filename: "florist_receipt.pdf",
            storage_path: "receipts/florist.pdf",
            file_size: 45000,
            mime_type: "application/pdf",
            file_category: "RECEIPT",
            uploaded_by: leader.id,
          },
        ],
      });

      expect(submitted.status).toBe("PENDING_FINANCE_REVIEW");
      expect(submitted.workflow_steps?.length).toBe(1);
    });

    it("Step 3: Add Public Comment & Internal Finance Note", () => {
      // Leader adds public workflow comment
      const withLeaderComment = db.addComment(
        createdClaimId,
        leader,
        "Purchased from florist nearby church.",
        "PUBLIC_WORKFLOW"
      );
      expect(withLeaderComment.comments?.length).toBe(1);
      expect(withLeaderComment.comments?.[0].visibility).toBe("PUBLIC_WORKFLOW");

      // Finance adds internal note
      const withFinanceNote = db.addComment(
        createdClaimId,
        finance,
        "Verified budget allocation with head of worship.",
        "FINANCE_INTERNAL"
      );
      expect(withFinanceNote.comments?.length).toBe(2);
      expect(withFinanceNote.comments?.[1].visibility).toBe("FINANCE_INTERNAL");
    });

    it("Step 4: Finance Verification & Approval", () => {
      const verified = db.verifyClaim(createdClaimId, finance, "Receipt matches amount.");
      expect(verified.finance_review?.reviewer_id).toBe(finance.id);

      const approved = db.approveStep(createdClaimId, finance, "All checks passed.");
      expect(approved.status).toBe("APPROVED_FOR_PAYMENT");
    });

    it("Step 5: Record Payment & Finalize Audit", () => {
      const paid = db.recordPayment({
        claim_id: createdClaimId,
        processor: finance,
        amount: 120.00,
        payment_date: "2026-09-11",
        payment_reference: "DUITNOW-TX-882200",
        payment_method: "DUITNOW",
      });

      expect(paid.status).toBe("PAID");
      expect(paid.payment?.payment_reference).toBe("DUITNOW-TX-882200");

      // Verify audit logs exist for this claim
      const claimLogs = db.getAuditLogs().filter(l => l.entity_id === createdClaimId);
      expect(claimLogs.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("6. Sign-up Invitation Constraints & Role Locking", () => {
    it("should prevent non-admin from creating invitations", () => {
      expect(canUserManageSystem(leader)).toBe(false);
      expect(canUserManageSystem(finance)).toBe(false);
      expect(canUserManageSystem(admin)).toBe(true);
    });

    it("should validate and exhaust a 2-use invitation link accurately", () => {
      const { raw_token } = db.createSignupInvitation({
        role_code: "FINANCE_OFFICER",
        created_by: admin.id,
        max_uses: 2,
        expires_in_days: 7,
      });

      // User 1 signs up
      const u1Id = `user-signup-1-${Date.now()}`;
      db.getProfiles().push({
        id: u1Id,
        email: "finance.sub1@example.com",
        full_name: "",
        status: "ACTIVE",
        onboarding_completed_at: null,
        created_at: "",
        updated_at: "",
      });
      db.consumeSignupInvitation(raw_token, u1Id);

      // Still valid for 1 more use
      const check1 = db.validateSignupInvitation(raw_token);
      expect(check1.valid).toBe(true);
      expect(check1.invitation?.use_count).toBe(1);

      // User 2 signs up
      const u2Id = `user-signup-2-${Date.now()}`;
      db.getProfiles().push({
        id: u2Id,
        email: "finance.sub2@example.com",
        full_name: "",
        status: "ACTIVE",
        onboarding_completed_at: null,
        created_at: "",
        updated_at: "",
      });
      db.consumeSignupInvitation(raw_token, u2Id);

      // Token is now exhausted
      const check2 = db.validateSignupInvitation(raw_token);
      expect(check2.valid).toBe(false);
      expect(check2.reason).toContain("maximum usage limit");
    });
  });

  describe("7. Bank Name and Bank Account Number Recording & CSV Export", () => {
    it("should persist bank_name and bank_account_number on draft and submission", () => {
      const draft = db.saveClaimDraft({
        submitted_by_user_id: leader.id,
        claimant_name: "Deacon Marcus",
        claimant_email: "marcus@example.com",
        claimant_phone: "+60 12-777 8888",
        bank_name: "Malayan Banking Berhad (Maybank)",
        bank_account_number: "514099887766",
        ministry_id: "m-worship-02",
        claim_date: "2026-09-11",
        purpose: "Sound equipment cables",
        expenses: [
          {
            temp_id: "e-bank-1",
            expense_date: "2026-09-11",
            expense_category_id: "cat-equip-05",
            cost_centre_id: "cc-worship-01",
            description: "XLR Audio Cables",
            amount: 80.00,
            sort_order: 1,
          },
        ],
        attachments: [
          {
            temp_id: "e-bank-1",
            original_filename: "receipt.jpg",
            storage_path: "receipts/cables.jpg",
            file_size: 12000,
            mime_type: "image/jpeg",
            file_category: "RECEIPT",
            uploaded_by: leader.id,
          },
        ],
      });

      expect(draft.bank_name).toBe("Malayan Banking Berhad (Maybank)");
      expect(draft.bank_account_number).toBe("514099887766");

      const submitted = db.submitClaim({
        id: draft.id,
        submitted_by_user_id: leader.id,
        claimant_name: "Deacon Marcus",
        claimant_email: "marcus@example.com",
        claimant_phone: "+60 12-777 8888",
        bank_name: "Malayan Banking Berhad (Maybank)",
        bank_account_number: "514099887766",
        ministry_id: "m-worship-02",
        claim_date: "2026-09-11",
        purpose: "Sound equipment cables",
        declaration_accepted: true,
        expenses: [
          {
            temp_id: "e-bank-1",
            expense_date: "2026-09-11",
            expense_category_id: "cat-equip-05",
            cost_centre_id: "cc-worship-01",
            description: "XLR Audio Cables",
            amount: 80.00,
            sort_order: 1,
          },
        ],
        attachments: [
          {
            temp_id: "e-bank-1",
            original_filename: "receipt.jpg",
            storage_path: "receipts/cables.jpg",
            file_size: 12000,
            mime_type: "image/jpeg",
            file_category: "RECEIPT",
            uploaded_by: leader.id,
          },
        ],
      });

      expect(submitted.bank_name).toBe("Malayan Banking Berhad (Maybank)");
      expect(submitted.bank_account_number).toBe("514099887766");
    });

    it("should export Claimant Bank and Bank Account Number in CSV", () => {
      const csv = generateClaimsCsv(db.getClaims());
      expect(csv).toContain("Claimant Bank");
      expect(csv).toContain("Bank Account Number");
      expect(csv).toContain("514012345678");
    });

    it("should update user profile default bank details", () => {
      const updatedProfile = db.updateProfile("u-sarah-02", {
        bank_name: "Public Bank Berhad",
        bank_account_number: "4820129384",
      });

      expect(updatedProfile.bank_name).toBe("Public Bank Berhad");
      expect(updatedProfile.bank_account_number).toBe("4820129384");
    });
  });
});
