import { describe, it, expect } from "vitest";
import { db } from "@/lib/mock-db/repository";
import { Profile } from "@/lib/types/database";

describe("Simplified Approval Workflow Engine", () => {
  const leaderUser: Profile = {
    id: "test-leader-1",
    email: "test.leader@example.com",
    full_name: "Test Leader",
    status: "ACTIVE",
    roles: ["CLAIMANT"],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const financeUser: Profile = {
    id: "test-finance-1",
    email: "test.finance@example.com",
    full_name: "Test Finance",
    status: "ACTIVE",
    roles: ["FINANCE_OFFICER"],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const dualRoleUser: Profile = {
    id: "test-dual-1",
    email: "test.dual@example.com",
    full_name: "Test Dual Role",
    status: "ACTIVE",
    roles: ["CLAIMANT", "FINANCE_OFFICER"],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  it("should route all submitted claims directly to Finance Review (1 step: PENDING_FINANCE_REVIEW)", () => {
    const claim = db.submitClaim({
      submitted_by_user_id: leaderUser.id,
      claimant_name: "Sarah Jenkins",
      claimant_email: "sarah.j@example.com",
      claimant_phone: "+60 12-345 6789",
      ministry_id: "m-youth-01",
      claim_date: "2026-09-02",
      purpose: "Youth camp logistics",
      declaration_accepted: true,
      expenses: [
        {
          temp_id: "tmp-exp-1",
          expense_date: "2026-09-01",
          expense_category_id: "cat-trans-01",
          cost_centre_id: "cc-youth-01",
          description: "Grab to venue",
          amount: 45.00,
          sort_order: 1,
        },
        {
          temp_id: "tmp-exp-2",
          expense_date: "2026-09-02",
          expense_category_id: "cat-meals-02",
          cost_centre_id: "cc-youth-01",
          description: "Volunteer lunch",
          amount: 180.50,
          sort_order: 2,
        },
      ],
      attachments: [
        {
          temp_id: "tmp-exp-1",
          original_filename: "grab_receipt.jpg",
          storage_path: "receipts/test-grab.jpg",
          file_size: 1024,
          mime_type: "image/jpeg",
          file_category: "RECEIPT",
          uploaded_by: leaderUser.id,
        },
        {
          temp_id: "tmp-exp-2",
          original_filename: "lunch_receipt.jpg",
          storage_path: "receipts/test-lunch.jpg",
          file_size: 2048,
          mime_type: "image/jpeg",
          file_category: "RECEIPT",
          uploaded_by: leaderUser.id,
        },
      ],
    });

    expect(claim.total_amount).toBe(225.50);
    expect(claim.status).toBe("PENDING_FINANCE_REVIEW");
    expect(claim.workflow_steps?.length).toBe(1);
    expect(claim.workflow_steps?.[0].step_name).toBe("Finance Review");
    expect(claim.workflow_steps?.[0].approver_role).toBe("FINANCE_OFFICER");
    expect(claim.workflow_steps?.[0].status).toBe("IN_PROGRESS");
  });

  it("should prevent dual-role user from approving their own submitted claim", () => {
    const claim = db.submitClaim({
      submitted_by_user_id: dualRoleUser.id,
      claimant_name: "Volunteer Jane",
      claimant_email: "jane@example.com",
      claimant_phone: "+60 12-999 8888",
      ministry_id: "m-youth-01",
      claim_date: "2026-09-02",
      purpose: "Supplies",
      declaration_accepted: true,
      expenses: [
        {
          temp_id: "tmp-exp-4",
          expense_date: "2026-09-01",
          expense_category_id: "cat-supplies-04",
          cost_centre_id: "cc-youth-01",
          description: "Pens and paper",
          amount: 50.00,
          sort_order: 1,
        },
      ],
      attachments: [
        {
          temp_id: "tmp-exp-4",
          original_filename: "stationery_receipt.jpg",
          storage_path: "receipts/test-stationery.jpg",
          file_size: 1024,
          mime_type: "image/jpeg",
          file_category: "RECEIPT",
          uploaded_by: dualRoleUser.id,
        },
      ],
    });

    // Dual role user (Leader + Finance) tries to approve own claim
    expect(() => {
      db.approveStep(claim.id, dualRoleUser, "Self-approval attempt by submitter who is also finance officer");
    }).toThrow(/cannot approve/i);

    // Another Finance Officer CAN approve it
    const approved = db.approveStep(claim.id, financeUser, "Approved by independent finance officer");
    expect(approved.status).toBe("APPROVED_FOR_PAYMENT");
  });

  it("should complete full workflow lifecycle: Submit -> Finance Approve -> Record Payment", () => {
    // 1. Submit Claim
    const claim = db.submitClaim({
      submitted_by_user_id: leaderUser.id,
      claimant_name: "Mark Audio",
      claimant_email: "mark@example.com",
      claimant_phone: "+60 12-345 6789",
      ministry_id: "m-youth-01",
      claim_date: "2026-09-02",
      purpose: "Youth camp sound equipment",
      declaration_accepted: true,
      expenses: [
        { temp_id: "t1", expense_date: "2026-09-01", expense_category_id: "cat-supplies-04", cost_centre_id: "cc-youth-01", description: "Audio cables", amount: 150.00, sort_order: 1 },
      ],
      attachments: [
        { temp_id: "t1", original_filename: "cables.jpg", storage_path: "receipts/cables.jpg", file_size: 1000, mime_type: "image/jpeg", file_category: "RECEIPT", uploaded_by: leaderUser.id },
      ],
    });

    expect(claim.status).toBe("PENDING_FINANCE_REVIEW");

    // 2. Finance Officer Approves -> advances straight to APPROVED_FOR_PAYMENT
    const afterFinance = db.approveStep(claim.id, financeUser, "Finance approved");
    expect(afterFinance.status).toBe("APPROVED_FOR_PAYMENT");
    expect(afterFinance.workflow_steps?.[0].status).toBe("COMPLETED");

    // 3. Finance Records Payment -> advances to PAID
    const paidClaim = db.recordPayment({
      claim_id: claim.id,
      processor: financeUser,
      amount: 150.00,
      payment_date: "2026-09-10",
      payment_reference: "MBB-TRX-998877",
      payment_method: "BANK_TRANSFER",
    });

    expect(paidClaim.status).toBe("PAID");
    expect(paidClaim.payment?.payment_reference).toBe("MBB-TRX-998877");
  });

  it("should support clarification return and resubmission back to Finance Review", () => {
    // 1. Submit Claim
    const claim = db.submitClaim({
      submitted_by_user_id: leaderUser.id,
      claimant_name: "Volunteer Bob",
      claimant_email: "bob@example.com",
      claimant_phone: "+60 12-111 2222",
      ministry_id: "m-youth-01",
      claim_date: "2026-09-02",
      purpose: "Volunteer Dinner",
      declaration_accepted: true,
      expenses: [
        { temp_id: "t1", expense_date: "2026-09-01", expense_category_id: "cat-meals-02", cost_centre_id: "cc-youth-01", description: "Dinner", amount: 200.00, sort_order: 1 },
      ],
      attachments: [
        { temp_id: "t1", original_filename: "dinner.jpg", storage_path: "receipts/dinner.jpg", file_size: 1000, mime_type: "image/jpeg", file_category: "RECEIPT", uploaded_by: leaderUser.id },
      ],
    });

    // 2. Finance Returns for Clarification
    const returned = db.returnForClarification(claim.id, financeUser, "Please attach itemized tax invoice.");
    expect(returned.status).toBe("RETURNED_FOR_CLARIFICATION");
    expect(returned.clarification_reason).toBe("Please attach itemized tax invoice.");

    // 3. Submitter Resubmits
    const resubmitted = db.resubmitClaim({
      claim_id: claim.id,
      claimant: leaderUser,
      ministry_id: "m-youth-01",
      claim_date: "2026-09-02",
      purpose: "Volunteer Dinner",
      declaration_accepted: true,
      response_comment: "Attached tax invoice as requested.",
      expenses: [
        { temp_id: "t1", expense_date: "2026-09-01", expense_category_id: "cat-meals-02", cost_centre_id: "cc-youth-01", description: "Dinner (Itemized)", amount: 200.00, sort_order: 1 },
      ],
      attachments: [
        { temp_id: "t1", original_filename: "tax_invoice.pdf", storage_path: "receipts/tax_invoice.pdf", file_size: 1000, mime_type: "application/pdf", file_category: "RECEIPT", uploaded_by: leaderUser.id },
      ],
    });

    expect(resubmitted.status).toBe("PENDING_FINANCE_REVIEW");
    expect(resubmitted.workflow_steps?.length).toBe(1);
    expect(resubmitted.workflow_steps?.[0].status).toBe("IN_PROGRESS");
  });
});
