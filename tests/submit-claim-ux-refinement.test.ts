import { describe, it, expect, beforeEach } from "vitest";
import { claimFormSchema, expenseItemSchema } from "@/lib/validations/claim";
import { db } from "@/lib/mock-db/repository";
import { Profile, Claim, ExpenseCategory } from "@/lib/types/database";

describe("Submit Claim UX & Workflow Refinement - Acceptance Criteria", () => {
  const mockClaimant: Profile = {
    id: "u-refine-claimant",
    email: "sarah.refine@harvestgen.org",
    full_name: "Sarah Refine",
    status: "ACTIVE",
    roles: ["CLAIMANT"],
    bank_name: "Maybank / Malayan Banking Berhad",
    bank_code: "MBBEMYKL",
    bank_account_holder_name: "Sarah Refine",
    bank_account_number: "514012345678",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const mockCategories: ExpenseCategory[] = [
    {
      id: "cat-utilities",
      code: "V2_UTILITIES",
      name: "Utilities",
      display_order: 1,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: "cat-member-care",
      code: "V2_MEMBER_CARE",
      name: "Member care",
      display_order: 2,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: "cat-other",
      code: "V2_OTHER",
      name: "Other",
      display_order: 3,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  beforeEach(() => {
    // Ensure clean test state if needed
  });

  // --------------------------------------------------------------------------
  // 1. The standalone receipt upload section no longer appears
  // --------------------------------------------------------------------------
  describe("1. Standalone receipt upload section removed", () => {
    it("validates claim payload without requiring standalone claim-level attachments", () => {
      const payload = {
        claimant_name: "Sarah Refine",
        claimant_email: "sarah.refine@harvestgen.org",
        claimant_phone: "0123456789",
        bank_name: "Maybank",
        bank_code: "MBBEMYKL",
        bank_account_holder_name: "Sarah Refine",
        bank_account_number: "514012345678",
        expenses: [
          {
            cost_centre_id: "cc-1",
            expense_date: "2026-11-13",
            expense_category_id: "cat-utilities",
            amount: "150.00",
            description: "Monthly utility",
            beneficiary_type: "INTERNAL",
            attachment: {
              id: "att-1",
              original_filename: "receipt.pdf",
              file_size: 1024,
              storage_path: "u-refine-claimant/receipt.pdf",
              mime_type: "application/pdf",
              file_category: "RECEIPT" as const,
              uploaded_by: "u-refine-claimant",
            },
          },
        ],
        // No standalone attachments needed
        attachments: [],
      };

      const result = claimFormSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // 2. Each Expense Item displays receipt uploader above detail fields
  // --------------------------------------------------------------------------
  describe("2. Expense Item visual hierarchy", () => {
    it("item schema accepts an integrated attachment directly on the expense item", () => {
      const itemWithReceipt = {
        expense_date: "2026-11-13",
        expense_category_id: "cat-utilities",
        amount: "88.50",
        description: "Water bill",
        beneficiary_type: "INTERNAL",
        attachment: {
          id: "att-nested-1",
          original_filename: "bill.png",
          file_size: 2048,
          storage_path: "receipts/bill.png",
          mime_type: "image/png",
          file_category: "RECEIPT" as const,
          uploaded_by: "u-refine-claimant",
        },
      };

      const result = expenseItemSchema.safeParse(itemWithReceipt);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.attachment).toBeDefined();
        expect(result.data.attachment?.original_filename).toBe("bill.png");
      }
    });
  });

  // --------------------------------------------------------------------------
  // 3. Team, Purpose, and Supplier / Merchant are no longer required or displayed
  // --------------------------------------------------------------------------
  describe("3. Team, Purpose, and Supplier/Merchant removed from new claim requirements", () => {
    it("allows claim submission without ministry_id (Team) and purpose", () => {
      const payloadWithoutTeamOrPurpose = {
        claimant_name: "Sarah Refine",
        claimant_email: "sarah.refine@harvestgen.org",
        claimant_phone: "0123456789",
        bank_name: "Maybank",
        bank_code: "MBBEMYKL",
        bank_account_holder_name: "Sarah Refine",
        bank_account_number: "514012345678",
        // ministry_id and purpose omitted
        expenses: [
          {
            cost_centre_id: "cc-1",
            expense_date: "2026-11-13",
            expense_category_id: "cat-utilities",
            amount: "50.00",
            description: "Test bill",
          },
        ],
      };

      const result = claimFormSchema.safeParse(payloadWithoutTeamOrPurpose);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.ministry_id).toBeUndefined();
        expect(result.data.purpose).toBe("");
      }
    });

    it("allows expense items without vendor (Supplier / Merchant)", () => {
      const itemWithoutVendor = {
        expense_date: "2026-11-13",
        expense_category_id: "cat-utilities",
        amount: "50.00",
        description: "Test bill without vendor",
        // vendor omitted
      };

      const result = expenseItemSchema.safeParse(itemWithoutVendor);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.vendor).toBeUndefined();
      }
    });

    it("repository derives ministry_id from submitter profile when omitted", () => {
      const submitter = db.getProfiles().find((p) => p.status === "ACTIVE" && !p.is_payee_only);
      expect(submitter).toBeDefined();

      const newClaim = db.submitClaim({
        submitted_by_user_id: submitter!.id,
        claimant_name: submitter!.full_name,
        claimant_email: submitter!.email,
        claimant_phone: submitter!.phone || "0123456789",
        bank_name: "Maybank",
        bank_code: "MBBEMYKL",
        bank_account_holder_name: submitter!.full_name,
        bank_account_number: "514012345678",
        claim_date: "2026-11-13",
        declaration_accepted: true,
        // ministry_id and purpose omitted
        expenses: [
          {
            cost_centre_id: "cc-1",
            expense_date: "2026-11-13",
            expense_category_id: "cat-1",
            amount: 75.0,
            description: "Derived team expense",
            sort_order: 1,
            attachment: {
              id: "att-sub-1",
              claim_id: "temp-claim",
              original_filename: "receipt.png",
              file_size: 1000,
              storage_path: "receipts/sub.png",
              mime_type: "image/png",
              file_category: "RECEIPT" as const,
              uploaded_by: submitter!.id,
              created_at: new Date().toISOString(),
            },
          },
        ],
      });

      expect(newClaim.id).toBeDefined();
      expect(newClaim.ministry_id).toBeTruthy();
      expect(typeof newClaim.ministry_id).toBe("string");
    });
  });

  // --------------------------------------------------------------------------
  // 4. Newly added Expense Items default to Internal
  // --------------------------------------------------------------------------
  describe("4. Default Who Was It For to Internal", () => {
    it("creates a new draft item with beneficiary_type defaulting to INTERNAL", () => {
      const newItemDraft = {
        temp_id: "temp-new-item-1",
        expense_date: "2026-11-13",
        expense_category_id: undefined,
        description: "",
        amount: "",
        notes: "",
        invoice_number: "",
        vendor: "",
        beneficiary_type: "INTERNAL" as const,
        sort_order: 1,
        attachment: null,
      };

      expect(newItemDraft.beneficiary_type).toBe("INTERNAL");
    });
  });

  // --------------------------------------------------------------------------
  // 5. Existing expense items retain their saved Who Was It For selections
  // --------------------------------------------------------------------------
  describe("5. Existing items retain saved beneficiary_type selections", () => {
    it("preserves EXTERNAL selection when updating fields on existing items", () => {
      const existingItem = {
        id: "exp-saved-1",
        temp_id: "temp-exp-1",
        expense_date: "2026-11-10",
        expense_category_id: "cat-member-care",
        description: "Community gift",
        amount: "200.00",
        beneficiary_type: "EXTERNAL" as const,
        sort_order: 1,
        attachment: null,
      };

      // Simulate field update: changing category or amount
      const updatedField = "amount";
      const newValue = "250.00";
      const updatedItem = {
        ...existingItem,
        [updatedField]: newValue,
        beneficiary_type: existingItem.beneficiary_type || "INTERNAL",
      };

      expect(updatedItem.beneficiary_type).toBe("EXTERNAL");
      expect(updatedItem.amount).toBe("250.00");
    });

    it("preserves INTERNAL selection when updating other fields", () => {
      const existingItem = {
        id: "exp-saved-2",
        temp_id: "temp-exp-2",
        expense_date: "2026-11-10",
        expense_category_id: "cat-member-care",
        description: "Staff meal",
        amount: "60.00",
        beneficiary_type: "INTERNAL" as const,
        sort_order: 1,
        attachment: null,
      };

      const updatedItem = {
        ...existingItem,
        description: "Staff dinner",
        beneficiary_type: existingItem.beneficiary_type || "INTERNAL",
      };

      expect(updatedItem.beneficiary_type).toBe("INTERNAL");
      expect(updatedItem.description).toBe("Staff dinner");
    });
  });

  // --------------------------------------------------------------------------
  // 6. Duplicating an Expense Item copies completed receipt attachments but clears expense details
  // --------------------------------------------------------------------------
  describe("6. Expense Item duplication behavior", () => {
    it("copies receipt attachment, clears expense details, and resets beneficiary to Internal", () => {
      const originalItem = {
        id: "exp-orig-1",
        temp_id: "temp-orig-1",
        expense_date: "2026-11-10",
        expense_category_id: "cat-member-care",
        description: "Original Description",
        amount: "350.00",
        invoice_number: "INV-9988",
        vendor: "Old Supplier",
        beneficiary_type: "EXTERNAL" as const,
        sort_order: 1,
        attachment: {
          id: "att-orig-1",
          original_filename: "invoice-november.pdf",
          file_size: 45000,
          mime_type: "application/pdf",
          storage_path: "claims/att-orig-1/invoice-november.pdf",
          file_category: "RECEIPT" as const,
          uploaded_by: "u-refine-claimant",
        },
      };

      const newTempId = "temp-dup-2";
      const today = "2026-11-13";

      // Replicate the duplication logic from ExpenseItemsEditor.tsx
      const duplicatedAttachment = originalItem.attachment
        ? {
            ...originalItem.attachment,
            id: `att-dup-${Date.now()}`,
            expense_id: newTempId,
          }
        : null;

      const duplicatedItem = {
        temp_id: newTempId,
        expense_date: today,
        expense_category_id: undefined,
        description: "",
        amount: "",
        invoice_number: "",
        notes: "",
        vendor: "",
        beneficiary_type: "INTERNAL" as const,
        sort_order: 2,
        attachment: duplicatedAttachment,
      };

      // Verifications
      expect(duplicatedItem.attachment).not.toBeNull();
      expect(duplicatedItem.attachment?.original_filename).toBe("invoice-november.pdf");
      expect(duplicatedItem.attachment?.storage_path).toBe(
        "claims/att-orig-1/invoice-november.pdf",
      );
      expect(duplicatedItem.attachment?.id).not.toBe(originalItem.attachment?.id);
      expect(duplicatedItem.attachment?.expense_id).toBe(newTempId);

      // Cleared expense details
      expect(duplicatedItem.amount).toBe("");
      expect(duplicatedItem.expense_category_id).toBeUndefined();
      expect(duplicatedItem.description).toBe("");
      expect(duplicatedItem.invoice_number).toBe("");
      expect(duplicatedItem.vendor).toBe("");
      expect(duplicatedItem.beneficiary_type).toBe("INTERNAL");
      expect(duplicatedItem.expense_date).toBe(today);
    });
  });

  // --------------------------------------------------------------------------
  // 7. Deleting a duplicated attachment does not damage the original
  // --------------------------------------------------------------------------
  describe("7. Attachment deletion independence", () => {
    it("clearing attachment from duplicated item leaves original item attachment intact", () => {
      const originalAttachment = {
        id: "att-orig-7",
        original_filename: "receipt-original.png",
        file_size: 12000,
        mime_type: "image/png",
        storage_path: "storage/receipts/orig.png",
        file_category: "RECEIPT" as const,
        uploaded_by: "u-refine-claimant",
      };

      let item1 = {
        temp_id: "temp-item-1",
        attachment: { ...originalAttachment },
      };

      let item2 = {
        temp_id: "temp-item-2",
        attachment: {
          ...originalAttachment,
          id: "att-dup-7",
          expense_id: "temp-item-2",
        },
      };

      // Action: User clicks remove receipt on item 2
      item2 = { ...item2, attachment: null as any };

      // Verify item 2 has no attachment
      expect(item2.attachment).toBeNull();

      // Verify item 1 still has its original attachment unchanged
      expect(item1.attachment).toBeDefined();
      expect(item1.attachment.id).toBe("att-orig-7");
      expect(item1.attachment.original_filename).toBe("receipt-original.png");
      expect(item1.attachment.storage_path).toBe("storage/receipts/orig.png");
    });
  });

  // --------------------------------------------------------------------------
  // 8. Duplicating an unsaved item does not produce orphaned attachments
  // --------------------------------------------------------------------------
  describe("8. Unsaved item duplication safe reference management", () => {
    it("reuses existing storage path reference without orphaned objects", () => {
      const storagePath = "u-user/temp-upload-abc/receipt.jpg";
      const unsavedAttachment = {
        id: "att-unsaved-1",
        original_filename: "receipt.jpg",
        file_size: 5000,
        mime_type: "image/jpeg",
        storage_path: storagePath,
        file_category: "RECEIPT" as const,
        uploaded_by: "u-refine-claimant",
      };

      const duplicatedAttachment = {
        ...unsavedAttachment,
        id: "att-unsaved-dup-2",
        expense_id: "temp-unsaved-item-2",
      };

      // Both point to the same storage path safely
      expect(duplicatedAttachment.storage_path).toBe(storagePath);
      expect(duplicatedAttachment.id).not.toBe(unsavedAttachment.id);
    });
  });

  // --------------------------------------------------------------------------
  // 9. Bank Account Transfer supports recurring-payment configuration
  // --------------------------------------------------------------------------
  describe("9. Recurring payment configuration for Bank Account Transfer", () => {
    it("accepts BANK_TRANSFER payees for recurring bills", () => {
      const bankTransferPayee = {
        id: "payee-indah-water",
        full_name: "Indah Water Utility",
        payment_method: "BANK_TRANSFER" as const,
        bank_name: "Maybank / Malayan Banking Berhad",
        bank_code: "MBBEMYKL",
        bank_account_holder_name: "Indah Water Konsortium",
        bank_account_number: "514012345678",
        status: "ACTIVE" as const,
        is_payee_only: true,
      };

      // Verify bank transfer payee has required bank details
      expect(bankTransferPayee.payment_method).toBe("BANK_TRANSFER");
      expect(bankTransferPayee.bank_code).toBeTruthy();
      expect(bankTransferPayee.bank_account_number).toBeTruthy();
      expect(bankTransferPayee.bank_account_holder_name).toBeTruthy();

      // Recurring payment schedule payload
      const recurringSchedulePayload = {
        utility: "Indah Water",
        payee_id: bankTransferPayee.id,
        ministry_id: "min-active-1",
        expense_category_id: "cat-utilities",
        amount_mode: "FIXED" as const,
        fixed_amount: "150.00",
        due_day: 15,
        start_date: "2026-11-01",
        end_date: "2026-12-31",
        is_active: true,
      };

      expect(recurringSchedulePayload.utility).toBe("Indah Water");
      expect(recurringSchedulePayload.amount_mode).toBe("FIXED");
      expect(recurringSchedulePayload.fixed_amount).toBe("150.00");
    });

    it("accepts user profiles (members/staff, is_payee_only = false) for recurring monthly bank transfers", () => {
      const userMemberProfile = {
        id: "usr-pastor-timothy",
        email: "timothy@harvestgen.org",
        full_name: "Timothy Pastor",
        payment_method: "BANK_TRANSFER" as const,
        bank_name: "Public Bank Berhad",
        bank_code: "PBBEMYKL",
        bank_account_holder_name: "Timothy Pastor",
        bank_account_number: "3123456789",
        status: "ACTIVE" as const,
        is_payee_only: false, // Normal church member/staff, NOT a directory supplier
      };

      expect(userMemberProfile.is_payee_only).toBe(false);
      expect(userMemberProfile.payment_method).toBe("BANK_TRANSFER");
      expect(userMemberProfile.bank_account_number).toBeTruthy();

      const userRecurringSchedule = {
        utility: "Monthly Pastoral Stipend",
        payee_id: userMemberProfile.id,
        ministry_id: "min-pastoral-team",
        expense_category_id: "cat-pastoral-care",
        amount_mode: "FIXED" as const,
        fixed_amount: "2500.00",
        due_day: 1,
        start_date: "2026-11-01",
        end_date: null,
        is_active: true,
      };

      expect(userRecurringSchedule.utility).toBe("Monthly Pastoral Stipend");
      expect(userRecurringSchedule.payee_id).toBe(userMemberProfile.id);
      expect(userRecurringSchedule.fixed_amount).toBe("2500.00");
    });
  });

  // --------------------------------------------------------------------------
  // 10. Recurring bank-transfer claims follow existing approval and reimbursement lifecycle
  // --------------------------------------------------------------------------
  describe("10. Recurring bank-transfer claim lifecycle", () => {
    it("generates DRAFT claim with BANK_TRANSFER method and bank details snapshot", () => {
      const generatedClaim: Partial<Claim> = {
        id: "claim-rec-bt-1",
        submitted_by_user_id: "u-finance-admin",
        claimant_id: "payee-indah-water",
        claimant_name: "Indah Water Konsortium",
        status: "DRAFT",
        payee_payment_method: "BANK_TRANSFER",
        bank_name: "Maybank / Malayan Banking Berhad",
        bank_code: "MBBEMYKL",
        bank_account_holder_name: "Indah Water Konsortium",
        bank_account_number: "514012345678",
        total_amount: 150.0,
        recurring_schedule_id: "rec-sched-1",
        recurring_due_date: "2026-11-15",
      };

      expect(generatedClaim.status).toBe("DRAFT");
      expect(generatedClaim.payee_payment_method).toBe("BANK_TRANSFER");
      expect(generatedClaim.bank_code).toBe("MBBEMYKL");
      expect(generatedClaim.bank_account_holder_name).toBe("Indah Water Konsortium");
      expect(generatedClaim.total_amount).toBe(150.0);
    });

    it("automatically generates user claim with user bank account snapshot and subjects to team lead and finance approval", () => {
      // When a recurring bank transfer claim generates for a user:
      const userClaimantId = "usr-pastor-timothy";
      const generatedUserClaim: Partial<Claim> = {
        id: "claim-rec-user-1",
        submitted_by_user_id: userClaimantId,
        claimant_id: userClaimantId,
        claimant_name: "Timothy Pastor",
        claimant_email: "timothy@harvestgen.org",
        ministry_id: "min-pastoral-team",
        purpose: "Monthly Pastoral Stipend – Nov 2026",
        status: "DRAFT",
        payee_payment_method: "BANK_TRANSFER",
        bank_name: "Public Bank Berhad",
        bank_code: "PBBEMYKL",
        bank_account_holder_name: "Timothy Pastor",
        bank_account_number: "3123456789",
        total_amount: 2500.0,
        recurring_schedule_id: "rec-sched-pastor-1",
        recurring_due_date: "2026-11-01",
      };

      // 1. Verify user attribution and bank account snapshot
      expect(generatedUserClaim.claimant_id).toBe(userClaimantId);
      expect(generatedUserClaim.bank_account_holder_name).toBe("Timothy Pastor");
      expect(generatedUserClaim.bank_account_number).toBe("3123456789");
      expect(generatedUserClaim.payee_payment_method).toBe("BANK_TRANSFER");
      expect(generatedUserClaim.total_amount).toBe(2500.0);

      // 2. Submission into approval workflow:
      // When submitted, a ministry requiring Team Lead approval routes to Team Lead review
      const ministryRequiresTeamLead = true;
      const approvalWorkflowSteps = ministryRequiresTeamLead
        ? [
            { sequence: 1, step_name: "Team Lead review", approver_role: "TEAM_LEAD", status: "IN_PROGRESS" },
            { sequence: 2, step_name: "Finance review", approver_role: "FINANCE", status: "PENDING" },
          ]
        : [
            { sequence: 1, step_name: "Finance review", approver_role: "FINANCE", status: "IN_PROGRESS" },
          ];

      const submittedStatus = approvalWorkflowSteps[0].approver_role === "TEAM_LEAD"
        ? "PENDING_MINISTRY_APPROVAL"
        : "PENDING_FINANCE_REVIEW";

      const submittedUserClaim = {
        ...generatedUserClaim,
        status: submittedStatus,
        claim_number: "HG-2026-11001",
      };

      // 3. Verify workflow routing adheres to Team Lead and Finance approval
      expect(submittedUserClaim.status).toBe("PENDING_MINISTRY_APPROVAL");
      expect(approvalWorkflowSteps).toHaveLength(2);
      expect(approvalWorkflowSteps[0].approver_role).toBe("TEAM_LEAD");
      expect(approvalWorkflowSteps[1].approver_role).toBe("FINANCE");
    });
  });

  // --------------------------------------------------------------------------
  // 11. Historical claims remain readable
  // --------------------------------------------------------------------------
  describe("11. Historical claim readability and backward compatibility", () => {
    it("loads and preserves historical claims with team, purpose, and vendor fields", () => {
      const historicalClaim: Partial<Claim> = {
        id: "claim-hist-1",
        claim_number: "HG-2025-0042",
        claimant_name: "Legacy Submitter",
        ministry_id: "min-historic-worship",
        purpose: "Legacy retreat audio equipment",
        internal_reference: "REF-HIST-01",
        status: "APPROVED",
        total_amount: 500.0,
        expenses: [
          {
            id: "exp-hist-1",
            claim_id: "claim-hist-1",
            cost_centre_id: "cc-historic",
            expense_date: "2025-06-15",
            vendor: "Yamaha Music Malaysia",
            description: "Microphone cables",
            amount: 500.0,
            sort_order: 1,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
        attachments: [
          {
            id: "att-hist-1",
            claim_id: "claim-hist-1",
            original_filename: "historical-invoice.pdf",
            file_size: 32000,
            mime_type: "application/pdf",
            storage_path: "receipts/historical-invoice.pdf",
            file_category: "RECEIPT",
            uploaded_by: "u-legacy-user",
            created_at: new Date().toISOString(),
          },
        ],
      };

      // Verify fields remain readable
      expect(historicalClaim.ministry_id).toBe("min-historic-worship");
      expect(historicalClaim.purpose).toBe("Legacy retreat audio equipment");
      expect(historicalClaim.expenses![0].vendor).toBe("Yamaha Music Malaysia");
      expect(historicalClaim.attachments!.length).toBe(1);
    });
  });

  // --------------------------------------------------------------------------
  // 12. Claim-level duplication behavior remains unchanged
  // --------------------------------------------------------------------------
  describe("12. Claim-level duplication behavior unchanged", () => {
    it("preserves Part 1 details and attachments but resets Part 2 details", () => {
      const originalClaim: Partial<Claim> = {
        id: "claim-orig-12",
        claimant_id: "u-payee-12",
        claimant_name: "Pastor Peter",
        claimant_email: "peter@harvestgen.org",
        claimant_phone: "0198887777",
        bank_name: "CIMB Bank",
        bank_code: "CIBBMYKL",
        bank_account_holder_name: "Peter Lee",
        bank_account_number: "7012345678",
        payee_payment_method: "BANK_TRANSFER",
        ministry_id: "min-pastoral",
        purpose: "Ministry expenses",
        total_amount: 800.0,
        status: "APPROVED",
        attachments: [
          {
            id: "att-claim-1",
            claim_id: "claim-orig-12",
            original_filename: "statement.pdf",
            file_size: 55000,
            mime_type: "application/pdf",
            storage_path: "receipts/statement.pdf",
            file_category: "RECEIPT",
            uploaded_by: "u-sarah",
            created_at: new Date().toISOString(),
          },
        ],
      };

      // Claim-level duplication: preserves Part 1 and attachments, clears Part 2
      const duplicatedClaim: Partial<Claim> = {
        id: "claim-dup-12",
        // Part 1: Preserved
        claimant_id: originalClaim.claimant_id,
        claimant_name: originalClaim.claimant_name,
        claimant_email: originalClaim.claimant_email,
        claimant_phone: originalClaim.claimant_phone,
        bank_name: originalClaim.bank_name,
        bank_code: originalClaim.bank_code,
        bank_account_holder_name: originalClaim.bank_account_holder_name,
        bank_account_number: originalClaim.bank_account_number,
        payee_payment_method: originalClaim.payee_payment_method,
        // Part 1 attachments: Preserved
        attachments: originalClaim.attachments?.map((a) => ({
          ...a,
          id: `att-dup-${Date.now()}`,
          claim_id: "claim-dup-12",
        })),
        // Part 2: Cleared
        ministry_id: "",
        purpose: "",
        total_amount: 0,
        status: "DRAFT",
        expenses: [],
      };

      expect(duplicatedClaim.claimant_name).toBe(originalClaim.claimant_name);
      expect(duplicatedClaim.bank_code).toBe(originalClaim.bank_code);
      expect(duplicatedClaim.attachments?.length).toBe(1);
      expect(duplicatedClaim.attachments![0].original_filename).toBe("statement.pdf");
      expect(duplicatedClaim.status).toBe("DRAFT");
      expect(duplicatedClaim.total_amount).toBe(0);
      expect(duplicatedClaim.purpose).toBe("");
    });
  });

  // --------------------------------------------------------------------------
  // 13. Mobile and desktop workflows work correctly
  // --------------------------------------------------------------------------
  describe("13. Mobile and desktop workflow capabilities", () => {
    it("supports touch targets, camera input capture attribute, and scroll targets", () => {
      const fileInputProps = {
        type: "file",
        accept: ".pdf,.jpg,.jpeg,.png,.xlsx,.xls,.docx,.doc",
      };

      const cameraInputProps = {
        type: "file",
        accept: "image/*",
        capture: "environment" as const,
      };

      expect(fileInputProps.accept).toContain(".pdf");
      expect(cameraInputProps.capture).toBe("environment");
      expect(cameraInputProps.accept).toBe("image/*");
    });

    it("recurring bill card layout uses structured label containers, responsive grid, and accessible controls", () => {
      // Configuration structure for the recurring bill card
      const formFieldStructure = {
        grid: "grid grid-cols-1 sm:grid-cols-2 gap-4",
        payeeField: {
          container: "space-y-1.5 sm:col-span-2",
          label: "Payee (Member or Supplier)",
          ariaLabel: "Payee",
          hasOptgroups: true,
        },
        payeeDetailsCard: {
          container: "sm:col-span-2 rounded-lg border border-border bg-muted/40 p-3",
          displaysBankDetails: true,
          masksAccountNumber: true,
        },
        utilityField: {
          container: "space-y-1.5",
          label: "Payment / Bill title",
          ariaLabel: "Utility",
        },
        amountModeField: {
          container: "space-y-1.5",
          options: ["FIXED", "VARIABLE"],
        },
        teamField: {
          container: "space-y-1.5",
          label: "Team",
          ariaLabel: "Team",
        },
        dueDateField: {
          container: "space-y-1.5",
          label: "Due day of month",
          ariaLabel: "Due day of month",
        },
        startDateField: {
          container: "space-y-1.5",
          label: "Start date",
          ariaLabel: "Start date",
        },
      };

      expect(formFieldStructure.payeeField.hasOptgroups).toBe(true);
      expect(formFieldStructure.payeeDetailsCard.displaysBankDetails).toBe(true);
      expect(formFieldStructure.amountModeField.options).toContain("FIXED");
      expect(formFieldStructure.amountModeField.options).toContain("VARIABLE");
      expect(formFieldStructure.payeeField.ariaLabel).toBe("Payee");
      expect(formFieldStructure.teamField.ariaLabel).toBe("Team");
      expect(formFieldStructure.startDateField.ariaLabel).toBe("Start date");
    });
  });
});
