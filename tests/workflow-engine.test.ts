import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/mock-db/repository";
import { Profile } from "@/lib/types/database";

describe("Approval Workflow Engine", () => {
  const claimantUser: Profile = {
    id: "test-claimant-1",
    email: "test.claimant@example.com",
    full_name: "Test Claimant",
    status: "ACTIVE",
    roles: ["CLAIMANT"],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const leaderUser: Profile = {
    id: "test-leader-1",
    email: "test.leader@example.com",
    full_name: "Test Leader",
    status: "ACTIVE",
    roles: ["MINISTRY_LEADER"],
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

  const finalApproverUser: Profile = {
    id: "test-approver-1",
    email: "test.approver@example.com",
    full_name: "Test Final Approver",
    status: "ACTIVE",
    roles: ["FINAL_APPROVER"],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  it("should route claims <= RM500 directly from Leader to Finance (2 steps)", () => {
    const claim = db.submitClaim({
      claimant_id: claimantUser.id,
      ministry_id: "m-youth-01",
      programme_event: "Youth Camp",
      cost_centre_id: "cc-youth-01",
      claim_date: "2026-09-02",
      purpose: "Youth camp logistics",
      payment_method: "PERSONAL_REIMBURSEMENT",
      declaration_accepted: true,
      expenses: [
        {
          expense_date: "2026-09-01",
          expense_category_id: "cat-trans-01",
          description: "Grab to venue",
          amount: 45.00,
          sort_order: 1,
        },
        {
          expense_date: "2026-09-02",
          expense_category_id: "cat-meals-02",
          description: "Volunteer lunch",
          amount: 180.50,
          sort_order: 2,
        },
      ],
    });

    expect(claim.total_amount).toBe(225.50);
    expect(claim.status).toBe("PENDING_MINISTRY_APPROVAL");
    expect(claim.workflow_steps?.length).toBe(2);
    expect(claim.workflow_steps?.[0].approver_role).toBe("MINISTRY_LEADER");
    expect(claim.workflow_steps?.[1].approver_role).toBe("FINANCE_OFFICER");
  });

  it("should route claims > RM500 to Leader, Finance, and Final Approver (3 steps)", () => {
    const claim = db.submitClaim({
      claimant_id: claimantUser.id,
      ministry_id: "m-youth-01",
      programme_event: "Annual Youth Retreat",
      cost_centre_id: "cc-youth-01",
      claim_date: "2026-09-02",
      purpose: "Retreat campsite deposit",
      payment_method: "PERSONAL_REIMBURSEMENT",
      declaration_accepted: true,
      expenses: [
        {
          expense_date: "2026-09-01",
          expense_category_id: "cat-event-06",
          description: "Campsite deposit",
          amount: 1200.00,
          sort_order: 1,
        },
      ],
    });

    expect(claim.total_amount).toBe(1200.00);
    expect(claim.workflow_steps?.length).toBe(3);
    expect(claim.workflow_steps?.[0].approver_role).toBe("MINISTRY_LEADER");
    expect(claim.workflow_steps?.[1].approver_role).toBe("FINANCE_OFFICER");
    expect(claim.workflow_steps?.[2].approver_role).toBe("FINAL_APPROVER");
  });

  it("should prevent a claimant from approving their own claim", () => {
    const claim = db.submitClaim({
      claimant_id: claimantUser.id,
      ministry_id: "m-youth-01",
      programme_event: "Personal claim",
      cost_centre_id: "cc-youth-01",
      claim_date: "2026-09-02",
      purpose: "Supplies",
      payment_method: "PERSONAL_REIMBURSEMENT",
      declaration_accepted: true,
      expenses: [
        {
          expense_date: "2026-09-01",
          expense_category_id: "cat-supplies-04",
          description: "Pens",
          amount: 50.00,
          sort_order: 1,
        },
      ],
    });

    expect(() => {
      db.approveStep(claim.id, claimantUser, "Self approval attempt");
    }).toThrow(/cannot approve your own/i);
  });

  it("should complete full approval and payment lifecycle successfully", () => {
    // 1. Submit Claim (RM 225.50)
    const claim = db.submitClaim({
      claimant_id: claimantUser.id,
      ministry_id: "m-youth-01",
      programme_event: "Youth Camp",
      cost_centre_id: "cc-youth-01",
      claim_date: "2026-09-02",
      purpose: "Youth camp logistics",
      payment_method: "PERSONAL_REIMBURSEMENT",
      declaration_accepted: true,
      expenses: [
        { expense_date: "2026-09-01", expense_category_id: "cat-trans-01", description: "Grab", amount: 45.00, sort_order: 1 },
        { expense_date: "2026-09-02", expense_category_id: "cat-meals-02", description: "Lunch", amount: 180.50, sort_order: 2 },
      ],
    });

    // 2. Leader Approves
    const afterLeader = db.approveStep(claim.id, leaderUser, "Leader approved");
    expect(afterLeader.status).toBe("PENDING_FINANCE_REVIEW");

    // 3. Finance Approves
    const afterFinance = db.approveStep(claim.id, financeUser, "Finance approved");
    expect(afterFinance.status).toBe("APPROVED_FOR_PAYMENT");

    // 4. Finance Records Payment
    const paidClaim = db.recordPayment({
      claim_id: claim.id,
      processor: financeUser,
      amount: 225.50,
      payment_date: "2026-09-10",
      payment_reference: "MBB-TRX-839291",
      payment_method: "BANK_TRANSFER",
    });

    expect(paidClaim.status).toBe("PAID");
    expect(paidClaim.payment?.payment_reference).toBe("MBB-TRX-839291");
  });
});
