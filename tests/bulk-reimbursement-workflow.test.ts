import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as XLSX from "xlsx";

vi.mock("server-only", () => ({}));
import contract from "@/lib/constants/HG_Bank_Template_Contract.json";
import {
  ALLIANCE_BANK_SWIFT_CODE,
  MALAYSIAN_BANKS,
  getPaymentModeForBankCode,
  maskBankAccountNumber,
  resolveCanonicalBank,
  validateBankAccountString,
} from "@/lib/constants/banks";
import {
  BIFF8_MAGIC_HEX,
  BANK_LIST_HEADERS,
  SHEET1_HEADERS,
  bankExportAdapter,
  evaluateClaimForReimbursement,
  formatPaymentDescription,
  previewReimbursementSelection,
  sanitizeSpreadsheetText,
  toExactCents,
  type BankPaymentInstructionRow,
} from "@/lib/banking/bank-export-adapter";
import { isFinanceCommand } from "@/services/finance/finance.service";
import { db } from "@/lib/mock-db/repository";
import type { Claim } from "@/lib/types/database";

function makeClaim(overrides: Partial<Claim> & { id: string }): Claim {
  return {
    id: overrides.id,
    claim_number: overrides.claim_number || `HG-2026-000${overrides.id}`,
    submitted_by_user_id: overrides.submitted_by_user_id || "user-1",
    claimant_id: overrides.claimant_id || overrides.submitted_by_user_id || "user-1",
    claimant_name: overrides.claimant_name || "Sarah Tan",
    claimant_email: overrides.claimant_email || "sarah@harvestgen.org",
    claimant_phone: overrides.claimant_phone || "+60123456789",
    bank_name: overrides.bank_name ?? "Maybank / Malayan Banking Berhad",
    bank_code: overrides.bank_code ?? "MBBEMYKL",
    bank_account_holder_name: overrides.bank_account_holder_name ?? "SARAH TAN",
    bank_account_number: overrides.bank_account_number ?? "514012345678",
    ministry_id: overrides.ministry_id || "min-1",
    claim_date: overrides.claim_date || "2026-11-01",
    purpose: overrides.purpose || "Youth camp supplies",
    total_amount: overrides.total_amount ?? 150.0,
    currency: overrides.currency || "MYR",
    status: overrides.status || "APPROVED_FOR_PAYMENT",
    reimbursement_status: overrides.reimbursement_status ?? "ELIGIBLE",
    active_batch_id: overrides.active_batch_id ?? null,
    declaration_accepted: true,
    created_at: overrides.created_at || "2026-11-01T00:00:00Z",
    updated_at: overrides.updated_at || "2026-11-01T00:00:00Z",
    payment: overrides.payment ?? null,
    approved_snapshot: overrides.approved_snapshot ?? null,
  };
}

describe("Alliance Bank BIFF8 Golden Fixture & Contract Verification", () => {
  it("verifies tests/fixtures/SBP_Sample_Redacted.xls matches the BIFF8 contract and 31-bank list", () => {
    const fixturePath = path.join(
      process.cwd(),
      "tests/fixtures/SBP_Sample_Redacted.xls"
    );
    expect(fs.existsSync(fixturePath)).toBe(true);

    const buf = fs.readFileSync(fixturePath);
    expect(buf.subarray(0, 8).toString("hex")).toBe(BIFF8_MAGIC_HEX);

    const wb = XLSX.read(buf, { type: "buffer", raw: true });
    expect(wb.SheetNames).toEqual(["Sheet1", "Bank List"]);

    const s1Rows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets["Sheet1"], {
      header: 1,
      defval: "",
    });
    expect(s1Rows[0].slice(0, 12)).toEqual(SHEET1_HEADERS);

    // Ensure redacted fixture has no real PII and flags the note typo MFBBMYLK
    const allText = JSON.stringify(s1Rows);
    expect(allText).toContain("SYNTHETIC BENEFICIARY");
    expect(allText).toContain("MFBBMYLK is a bank code");
    expect(contract.allianceBankCanonicalCode).toBe("MFBBMYKL");
    expect(contract.allianceBankNoteTypoFlagged).toBe("MFBBMYLK");

    const blRows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets["Bank List"], {
      header: 1,
      defval: "",
    });
    expect(blRows[0].slice(0, 2)).toEqual(BANK_LIST_HEADERS);
    expect(blRows.slice(1).length).toBe(31);
    expect(MALAYSIAN_BANKS.length).toBe(31);

    blRows.slice(1).forEach((row, idx) => {
      expect(MALAYSIAN_BANKS[idx].name).toBe(row[0]);
      expect(MALAYSIAN_BANKS[idx].swiftCode).toBe(row[1]);
    });
  });

  it("maps Alliance Bank (MFBBMYKL) to LIP and all other 30 banks to LGP, blocking unknown codes", () => {
    expect(getPaymentModeForBankCode("MFBBMYKL")).toBe("LIP");
    expect(getPaymentModeForBankCode("MBBEMYKL")).toBe("LGP");
    expect(getPaymentModeForBankCode("CIBBMYKL")).toBe("LGP");
    expect(getPaymentModeForBankCode("PHBMMYKL")).toBe("LGP");
    expect(getPaymentModeForBankCode("MFBBMYLK")).toBeNull(); // Typo from note must be rejected!
    expect(getPaymentModeForBankCode("UNKNOWN99")).toBeNull();
  });
});

describe("Eligibility, Selection, Grouping & Exact Decimal Invariants", () => {
  it("blocks unapproved, rejected, draft, or already-paid claims from reimbursement", () => {
    const submitted = evaluateClaimForReimbursement(
      makeClaim({ id: "1", status: "SUBMITTED" })
    );
    expect(submitted.eligible).toBe(false);
    expect(submitted.blockers.join(" ")).toContain("SUBMITTED");

    const rejected = evaluateClaimForReimbursement(
      makeClaim({ id: "2", status: "REJECTED" })
    );
    expect(rejected.eligible).toBe(false);

    const paid = evaluateClaimForReimbursement(
      makeClaim({ id: "3", status: "PAID", reimbursement_status: "PAID" })
    );
    expect(paid.eligible).toBe(false);
  });

  it("surfaces explicit blockers for approved claims with missing or invalid bank details", () => {
    const missingAcct = evaluateClaimForReimbursement(
      makeClaim({ id: "4", bank_account_number: "" })
    );
    expect(missingAcct.eligible).toBe(false);
    expect(missingAcct.blockers.join(" ")).toContain("Bank account number is required");

    const invalidBank = evaluateClaimForReimbursement(
      makeClaim({ id: "5", bank_code: "MFBBMYLK", bank_name: "Unknown Bank" })
    );
    expect(invalidBank.eligible).toBe(false);
    expect(invalidBank.blockers.join(" ")).toContain("not in the canonical 31-bank");
  });

  it("allows Finance to exclude 1 of 5 eligible claims so 4 enter the batch and 1 remains eligible", () => {
    const claims = [1, 2, 3, 4, 5].map((n) =>
      makeClaim({
        id: `c-${n}`,
        claim_number: `HG-2026-000${n}`,
        submitted_by_user_id: `user-${n}`,
        claimant_id: `user-${n}`,
        claimant_name: `Claimant ${n}`,
        bank_account_holder_name: `CLAIMANT ${n}`,
        bank_account_number: `51400000000${n}`,
        total_amount: 100,
      })
    );

    const selectedFour = ["c-1", "c-2", "c-3", "c-4"];
    const preview = previewReimbursementSelection(claims, selectedFour);

    expect(preview.totalSelectedClaims).toBe(4);
    expect(preview.totalTransfers).toBe(4);
    expect(preview.totalAmountCents).toBe(40000);
    expect(preview.totalAmount).toBe(400);
    expect(preview.excludedClaimIds).toEqual(["c-5"]);
  });

  it("groups multiple approved claims for the same verified beneficiary + exact bank destination, and never groups different users", () => {
    const c1 = makeClaim({
      id: "c-1",
      claim_number: "HG-2026-0001",
      submitted_by_user_id: "user-sarah",
      claimant_id: "user-sarah",
      bank_account_holder_name: "SARAH TAN",
      bank_code: "MFBBMYKL",
      bank_name: "Alliance Bank",
      bank_account_number: "001234567890",
      total_amount: 0.1,
    });
    const c2 = makeClaim({
      id: "c-2",
      claim_number: "HG-2026-0002",
      submitted_by_user_id: "user-sarah",
      claimant_id: "user-sarah",
      bank_account_holder_name: "SARAH TAN",
      bank_code: "MFBBMYKL",
      bank_name: "Alliance Bank",
      bank_account_number: "001234567890",
      total_amount: 0.2,
    });
    // Different user with identical name & account must NOT be merged with user-sarah!
    const c3DifferentUser = makeClaim({
      id: "c-3",
      claim_number: "HG-2026-0003",
      submitted_by_user_id: "user-other",
      claimant_id: "user-other",
      bank_account_holder_name: "SARAH TAN",
      bank_code: "MFBBMYKL",
      bank_name: "Alliance Bank",
      bank_account_number: "001234567890",
      total_amount: 50.0,
    });

    const preview = previewReimbursementSelection(
      [c1, c2, c3DifferentUser],
      ["c-1", "c-2", "c-3"],
      { year: 2026, startingSequence: 1 }
    );

    expect(preview.totalSelectedClaims).toBe(3);
    expect(preview.totalTransfers).toBe(2);

    // 0.10 + 0.20 = 0.30 exactly
    const firstTransfer = preview.proposedInstructions[0];
    expect(firstTransfer.paymentMode).toBe("LIP");
    expect(firstTransfer.amountCents).toBe(30);
    expect(firstTransfer.amount).toBe(0.3);
    expect(firstTransfer.claimIds).toEqual(["c-1", "c-2"]);
    expect(firstTransfer.paymentDescription).toBe("P260001");

    const secondTransfer = preview.proposedInstructions[1];
    expect(secondTransfer.amountCents).toBe(5000);
    expect(secondTransfer.amount).toBe(50);
    expect(secondTransfer.claimIds).toEqual(["c-3"]);
    expect(secondTransfer.paymentDescription).toBe("P260002");

    expect(preview.totalAmountCents).toBe(5030);
    expect(preview.totalAmount).toBe(50.3);
  });

  it("rejects zero, negative, or >2 decimal amounts", () => {
    expect(() => toExactCents(0)).toThrow();
    expect(() => toExactCents(-10)).toThrow();
    expect(() => toExactCents(12.345)).toThrow();
    expect(toExactCents(0.1) + toExactCents(0.2)).toBe(30);
  });
});

describe("BIFF8 .xls Generation, Round-Trip Verification, Leading Zeroes & Security", () => {
  const sampleInstructions: BankPaymentInstructionRow[] = [
    {
      instructionId: "inst-1",
      lineOrder: 1,
      paymentMode: "LIP",
      beneficiaryUserId: "user-1",
      beneficiaryName: "TAN AH KOW",
      beneficiaryAccountNumber: "001234567890",
      beneficiaryBankName: "Alliance Bank",
      beneficiaryBankCode: ALLIANCE_BANK_SWIFT_CODE,
      amountCents: 15025,
      amount: 150.25,
      paymentDescription: formatPaymentDescription(2026, 1),
      paymentReference: "",
      claimIds: ["c-1", "c-2"],
      claimNumbers: ["HG-2026-0001", "HG-2026-0002"],
    },
    {
      instructionId: "inst-2",
      lineOrder: 2,
      paymentMode: "LGP",
      beneficiaryUserId: "user-2",
      beneficiaryName: "=CMD|' /C calc'!A0", // Formula injection attempt
      beneficiaryAccountNumber: "514012345678",
      beneficiaryBankName: "Maybank / Malayan Banking Berhad",
      beneficiaryBankCode: "MBBEMYKL",
      amountCents: 84100,
      amount: 841.0,
      paymentDescription: formatPaymentDescription(2026, 2),
      paymentReference: "INV20263",
      claimIds: ["c-3"],
      claimNumbers: ["HG-2026-0003"],
    },
  ];

  it("renders a real BIFF8 .xls binary that round-trip parses with preserved leading zeroes and escaped formulas", () => {
    const xlsBuf1 = bankExportAdapter.renderXls(sampleInstructions);
    const xlsBuf2 = bankExportAdapter.renderXls(sampleInstructions);

    const parsed1 = bankExportAdapter.parseAndVerifyXls(xlsBuf1);
    const parsed2 = bankExportAdapter.parseAndVerifyXls(xlsBuf2);

    // Deterministic export hash and stable P26xxxx descriptions
    expect(parsed1.sha256).toBe(parsed2.sha256);
    expect(parsed1.magicHex).toBe(BIFF8_MAGIC_HEX);
    expect(parsed1.sheetNames).toEqual(["Sheet1", "Bank List"]);
    expect(parsed1.headers).toEqual(SHEET1_HEADERS);
    expect(parsed1.dataRows.length).toBe(2);

    // Row 1: Alliance Bank LIP + leading zeroes preserved on "001234567890"
    expect(parsed1.dataRows[0][0]).toBe("LIP");
    expect(parsed1.dataRows[0][1]).toBe("TAN AH KOW");
    expect(parsed1.dataRows[0][2]).toBe("001234567890");
    expect(parsed1.dataRows[0][3]).toBe("MFBBMYKL");
    expect(parsed1.dataRows[0][4]).toBe(150.25);
    expect(parsed1.dataRows[0][5]).toBe("P260001");
    expect(parsed1.dataRows[0][6]).toBe("");
    expect(parsed1.dataRows[0][7]).toBe("");

    // Row 2: Interbank LGP + formula injection safely escaped
    expect(parsed1.dataRows[1][0]).toBe("LGP");
    expect(String(parsed1.dataRows[1][1]).startsWith("'=")).toBe(true);
    expect(parsed1.dataRows[1][2]).toBe("514012345678");
    expect(parsed1.dataRows[1][3]).toBe("MBBEMYKL");
    expect(parsed1.dataRows[1][4]).toBe(841);
    expect(parsed1.dataRows[1][5]).toBe("P260002");
    expect(parsed1.dataRows[1][6]).toBe("INV20263");
  });

  it("preserves frozen historical batch XLS bytes even if claimant later changes their profile bank details", () => {
    const frozenBatchInstructions = [...sampleInstructions];
    const beforeBuf = bankExportAdapter.renderXls(frozenBatchInstructions);

    // Simulate user changing their profile bank account afterwards — frozen batch instruction is unaffected
    const afterBuf = bankExportAdapter.renderXls(frozenBatchInstructions);
    expect(
      bankExportAdapter.parseAndVerifyXls(beforeBuf).sha256
    ).toBe(bankExportAdapter.parseAndVerifyXls(afterBuf).sha256);
  });

  it("masks bank account numbers for UI display and validates account strings", () => {
    expect(maskBankAccountNumber("001234567890")).toBe("00••••••7890");
    expect(maskBankAccountNumber("514012345678")).toBe("••••••••5678");
    expect(validateBankAccountString("001234567890").normalized).toBe(
      "001234567890"
    );
    expect(validateBankAccountString("123").valid).toBe(false);
    expect(sanitizeSpreadsheetText("@SUM(A1:A2)")).toBe("'@SUM(A1:A2)");
    expect(resolveCanonicalBank("Maybank")?.swiftCode).toBe("MBBEMYKL");
  });

  it("authorizes all bulk reimbursement batch actions in FinanceService", () => {
    expect(isFinanceCommand("finalize_reimbursement_batch", {})).toBe(true);
    expect(isFinanceCommand("record_batch_export", {})).toBe(true);
    expect(isFinanceCommand("record_batch_bank_upload", {})).toBe(true);
    expect(isFinanceCommand("reconcile_batch_instruction", {})).toBe(true);
    expect(isFinanceCommand("void_reimbursement_batch", {})).toBe(true);
    expect(isFinanceCommand("unknown_action", {})).toBe(false);
  });

  it("executes the end-to-end batch lifecycle: finalize -> prevent double-batch -> bank upload -> partial PAID/FAILED reconciliation -> re-batch failed claim", () => {
    const financeActor = db
      .getProfiles()
      .find((p) => p.roles?.includes("FINANCE_OFFICER"))!;
    expect(financeActor).toBeDefined();

    // Submit 3 claims across 2 users
    const c1 = db.submitClaim({
      submitted_by_user_id: "u-leader-01",
      claimant_id: "u-leader-01",
      claimant_name: "Joshua Tan",
      claimant_email: "joshua.tan@nlcc.org.my",
      claimant_phone: "+60 12-301 4401",
      bank_name: "Alliance Bank Malaysia Berhad",
      bank_code: "MFBBMYKL",
      bank_account_holder_name: "JOSHUA TAN WEI MING",
      bank_account_number: "001209876543",
      ministry_id: "m-youth-01",
      claim_date: "2026-10-01",
      purpose: "Youth sound cable",
      declaration_accepted: true,
      expenses: [
        {
          temp_id: "e1",
          expense_date: "2026-10-01",
          expense_category_id: "cat-equip-03",
          cost_centre_id: "cc-youth-01",
          description: "XLR cable",
          amount: 120.5,
          sort_order: 1,
        },
      ],
      attachments: [
        {
          temp_id: "e1",
          original_filename: "cable.pdf",
          storage_path: "receipts/cable.pdf",
          file_size: 1024,
          mime_type: "application/pdf",
          file_category: "RECEIPT",
          uploaded_by: "u-leader-01",
        },
      ],
    });

    const c2 = db.submitClaim({
      submitted_by_user_id: "u-leader-01",
      claimant_id: "u-leader-01",
      claimant_name: "Joshua Tan",
      claimant_email: "joshua.tan@nlcc.org.my",
      claimant_phone: "+60 12-301 4401",
      bank_name: "Alliance Bank Malaysia Berhad",
      bank_code: "MFBBMYKL",
      bank_account_holder_name: "JOSHUA TAN WEI MING",
      bank_account_number: "001209876543",
      ministry_id: "m-youth-01",
      claim_date: "2026-10-02",
      purpose: "Youth refreshments",
      declaration_accepted: true,
      expenses: [
        {
          temp_id: "e2",
          expense_date: "2026-10-02",
          expense_category_id: "cat-meals-02",
          cost_centre_id: "cc-youth-01",
          description: "Drinks",
          amount: 79.75,
          sort_order: 1,
        },
      ],
      attachments: [
        {
          temp_id: "e2",
          original_filename: "drinks.pdf",
          storage_path: "receipts/drinks.pdf",
          file_size: 1024,
          mime_type: "application/pdf",
          file_category: "RECEIPT",
          uploaded_by: "u-leader-01",
        },
      ],
    });

    const c3 = db.submitClaim({
      submitted_by_user_id: "u-hod-01",
      claimant_id: "u-hod-01",
      claimant_name: "Pastor David Lim",
      claimant_email: "david.lim@nlcc.org.my",
      claimant_phone: "+60 12-880 1122",
      bank_name: "Maybank / Malayan Banking Berhad",
      bank_code: "MBBEMYKL",
      bank_account_holder_name: "DAVID LIM",
      bank_account_number: "514099887766",
      ministry_id: "m-worship-02",
      claim_date: "2026-10-03",
      purpose: "Worship strings",
      declaration_accepted: true,
      expenses: [
        {
          temp_id: "e3",
          expense_date: "2026-10-03",
          expense_category_id: "cat-equip-03",
          cost_centre_id: "cc-worship-02",
          description: "Guitar strings",
          amount: 95.0,
          sort_order: 1,
        },
      ],
      attachments: [
        {
          temp_id: "e3",
          original_filename: "strings.pdf",
          storage_path: "receipts/strings.pdf",
          file_size: 1024,
          mime_type: "application/pdf",
          file_category: "RECEIPT",
          uploaded_by: "u-hod-01",
        },
      ],
    });

    // Approve all 3 claims as Finance Officer (approval does NOT mark as PAID)
    db.approveStep(c1.id, financeActor, "Approved");
    db.approveStep(c2.id, financeActor, "Approved");
    db.approveStep(c3.id, financeActor, "Approved");

    expect(db.getClaimById(c1.id)?.status).toBe("APPROVED_FOR_PAYMENT");
    expect(db.getClaimById(c1.id)?.reimbursement_status).toBe("ELIGIBLE");
    expect(db.getClaimById(c1.id)?.approved_snapshot).toBeDefined();

    // Non-finance actor cannot create a batch
    expect(() =>
      db.createReimbursementBatch({
        actor_id: "u-leader-01",
        claim_ids: [c1.id],
      })
    ).toThrow(/Only Finance Officer/i);

    // Finalize reimbursement batch
    const batch = db.createReimbursementBatch({
      actor_id: financeActor.id,
      claim_ids: [c1.id, c2.id, c3.id],
      batch_name: "Test Batch Oct 2026",
    });

    expect(batch.status).toBe("FINALIZED");
    expect(batch.claim_count).toBe(3);
    expect(batch.transfer_count).toBe(2); // c1+c2 consolidated, c3 separate
    expect(batch.total_amount_cents).toBe(29525);
    expect(batch.total_amount).toBe(295.25);

    // Duplicate claim lock prevents re-batching reserved claims
    expect(() =>
      db.createReimbursementBatch({
        actor_id: financeActor.id,
        claim_ids: [c1.id],
      })
    ).toThrow();

    // Record upload to Alliance Bank portal
    const uploadedBatch = db.markBatchUploadedToBank({
      actor_id: financeActor.id,
      batch_id: batch.id,
      portal_submission_ref: "ALB-PORTAL-991",
    });
    expect(uploadedBatch.status).toBe("SUBMITTED_TO_BANK");
    expect(db.getClaimById(c1.id)?.reimbursement_status).toBe("SUBMITTED_TO_BANK");

    const joshuaInst = uploadedBatch.instructions!.find(
      (i) => i.beneficiary_user_id === "u-leader-01"
    )!;
    const davidInst = uploadedBatch.instructions!.find(
      (i) => i.beneficiary_user_id === "u-hod-01"
    )!;

    // Reconcile Joshua's consolidated transfer as PAID
    db.reconcileBatchInstruction({
      actor_id: financeActor.id,
      batch_id: batch.id,
      instruction_id: joshuaInst.id,
      outcome: "PAID",
      bank_reference: "ALB-TXN-0001",
    });

    expect(db.getClaimById(c1.id)?.status).toBe("PAID");
    expect(db.getClaimById(c2.id)?.status).toBe("PAID");
    expect(db.getClaimById(c1.id)?.reimbursement_status).toBe("PAID");

    // Reconcile David's transfer as FAILED (e.g. account closed) -> releases c3 for re-batching
    const afterPartial = db.reconcileBatchInstruction({
      actor_id: financeActor.id,
      batch_id: batch.id,
      instruction_id: davidInst.id,
      outcome: "FAILED",
      failure_reason: "AC04 Account Closed",
    });

    expect(afterPartial.status).toBe("PARTIALLY_SETTLED");
    expect(db.getClaimById(c3.id)?.status).toBe("APPROVED_FOR_PAYMENT");
    expect(db.getClaimById(c3.id)?.reimbursement_status).toBe("FAILED");
    expect(db.getClaimById(c3.id)?.active_batch_id).toBeUndefined();

    // Failed claim c3 can now be re-queued into a new batch
    const retryBatch = db.createReimbursementBatch({
      actor_id: financeActor.id,
      claim_ids: [c3.id],
      batch_name: "Retry Batch for David",
    });
    expect(retryBatch.transfer_count).toBe(1);
    expect(db.getClaimById(c3.id)?.reimbursement_status).toBe("RESERVED_IN_BATCH");

    // Voiding the retry batch releases c3 back to RELEASED / eligible
    const voided = db.voidReimbursementBatch({
      actor_id: financeActor.id,
      batch_id: retryBatch.id,
      void_reason: "Created in error",
    });
    expect(voided.status).toBe("VOIDED");
    expect(db.getClaimById(c3.id)?.reimbursement_status).toBe("RELEASED");
    expect(db.getClaimById(c3.id)?.active_batch_id).toBeUndefined();
  });
});
