import * as XLSX from "xlsx";
import { createHash } from "crypto";
import contract from "@/lib/constants/HG_Bank_Template_Contract.json";
import {
  ALLIANCE_BANK_SWIFT_CODE,
  BANK_TEMPLATE_VERSION,
  MALAYSIAN_BANKS,
  maskBankAccountNumber,
  resolveCanonicalBank,
  validateBankAccountString,
} from "@/lib/constants/banks";
import type { Claim } from "@/lib/types/database";

export const SHEET1_HEADERS = contract.sheet1Headers as readonly string[];
export const BANK_LIST_HEADERS = contract.bankListHeaders as readonly string[];
export const BIFF8_MAGIC_HEX = contract.biff8MagicHex; // "d0cf11e0a1b11ae1"

export interface BankPaymentInstructionRow {
  instructionId?: string;
  lineOrder: number;
  paymentMode: "LIP" | "LGP";
  beneficiaryUserId: string;
  beneficiaryName: string;
  beneficiaryAccountNumber: string;
  beneficiaryBankName: string;
  beneficiaryBankCode: string;
  amountCents: number;
  amount: number;
  paymentDescription: string;
  paymentReference?: string | null;
  beneficiaryNewIc?: string | null;
  beneficiaryOldIc?: string | null;
  beneficiaryBusinessReg?: string | null;
  beneficiaryOthers?: string | null;
  beneficiaryAddress?: string | null;
  claimIds: string[];
  claimNumbers: string[];
}

export interface ClaimEligibilityEvaluation {
  claimId: string;
  claimNumber: string;
  claimantUserId: string;
  claimantName: string;
  beneficiaryName: string;
  bankName: string;
  bankCode: string;
  bankAccountNumber: string;
  maskedAccountNumber: string;
  paymentMode: "LIP" | "LGP" | null;
  amountCents: number;
  amount: number;
  currency: string;
  eligible: boolean;
  blockers: string[];
}

export interface ReimbursementPreviewResult {
  templateVersion: string;
  evaluatedClaims: ClaimEligibilityEvaluation[];
  selectedEligibleClaims: ClaimEligibilityEvaluation[];
  excludedClaimIds: string[];
  blockedClaims: ClaimEligibilityEvaluation[];
  proposedInstructions: BankPaymentInstructionRow[];
  totalSelectedClaims: number;
  totalTransfers: number;
  totalAmountCents: number;
  totalAmount: number;
  previewDigest: string;
}

export interface BankExportOptions {
  /**
   * Controls Excel cell type for column 3 (Beneficiary Account / DuitNow ID Number).
   * Defaults to "text" to preserve leading zeroes and prevent scientific notation.
   */
  accountCellMode?: "text" | "numeric";
}

/**
 * Converts a MYR decimal amount to exact integer sen (cents).
 * Throws if the value is non-finite, <= 0, or has more than 2 decimal places.
 */
export function toExactCents(amount: number | string): number {
  const num = typeof amount === "string" ? Number(amount) : amount;
  if (!Number.isFinite(num) || num <= 0) {
    throw new Error("Amount must be a positive number greater than 0.00.");
  }
  const scaled = num * 100;
  const rounded = Math.round(scaled);
  if (Math.abs(scaled - rounded) > 1e-6) {
    throw new Error("Amount must have at most two decimal places.");
  }
  return rounded;
}

export function centsToMyrNumber(cents: number): number {
  if (!Number.isInteger(cents) || cents <= 0) {
    throw new Error("Cents amount must be a positive integer.");
  }
  return Number((cents / 100).toFixed(2));
}

export function formatPaymentDescription(year: number, sequenceNumber: number): string {
  const yy = String(year).slice(-2);
  const seq = String(sequenceNumber).padStart(4, "0");
  return `P${yy}${seq}`;
}

/**
 * Escapes potentially dangerous spreadsheet formula prefixes (=, +, -, @, tab, CR)
 * while trimming surrounding whitespace and stripping control characters.
 */
export function sanitizeSpreadsheetText(value?: string | null, maxLength = 140): string {
  if (!value) return "";
  const cleaned = String(value)
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[\x00-\x1F\x7F]/g, "")
    .trim();
  if (!cleaned) return "";
  const safe = /^[=+\-@]/.test(cleaned) ? `'${cleaned}` : cleaned;
  return safe.slice(0, maxLength);
}

/**
 * Evaluates a single claim's eligibility for bulk bank reimbursement.
 */
export function evaluateClaimForReimbursement(claim: Claim): ClaimEligibilityEvaluation {
  const blockers: string[] = [];

  if (claim.status !== "APPROVED_FOR_PAYMENT" && claim.status !== "APPROVED") {
    blockers.push(`Claim status is ${claim.status} (must be APPROVED_FOR_PAYMENT).`);
  }
  if (claim.payment) {
    blockers.push("Claim already has a recorded payment.");
  }
  if (
    claim.reimbursement_status &&
    ["RESERVED_IN_BATCH", "EXPORTED_PENDING_CONFIRMATION", "SUBMITTED_TO_BANK", "PAID"].includes(
      claim.reimbursement_status
    )
  ) {
    blockers.push(`Claim is already ${claim.reimbursement_status}.`);
  }
  if (claim.active_batch_id) {
    blockers.push("Claim is already reserved in an active reimbursement batch.");
  }

  const currency = (claim.currency || "MYR").toUpperCase();
  if (currency !== "MYR") {
    blockers.push(`Unsupported currency ${currency} (only MYR is supported for SBP bulk payment).`);
  }

  let amountCents = 0;
  try {
    amountCents = toExactCents(claim.total_amount);
  } catch (err) {
    blockers.push(err instanceof Error ? err.message : "Invalid claim total amount.");
  }

  const claimantUserId = (claim.claimant_id || claim.submitted_by_user_id || "").trim();
  if (!claimantUserId) {
    blockers.push("Missing verified beneficiary user ID.");
  }

  const snapshot = claim.approved_snapshot || null;
  const rawBeneficiaryName = (
    snapshot?.bank_account_holder_name ||
    claim.bank_account_holder_name ||
    claim.claimant_name ||
    claim.claimant?.full_name ||
    ""
  ).trim();
  if (!rawBeneficiaryName) {
    blockers.push("Missing beneficiary legal account-holder name.");
  }

  const rawBankCodeOrName =
    snapshot?.bank_code ||
    claim.bank_code ||
    snapshot?.bank_name ||
    claim.bank_name ||
    "";
  const resolvedBank = resolveCanonicalBank(rawBankCodeOrName);
  if (!resolvedBank) {
    blockers.push(
      rawBankCodeOrName
        ? `Bank "${rawBankCodeOrName}" is not in the canonical 31-bank Alliance Bank directory.`
        : "Missing beneficiary bank selection."
    );
  }

  const rawAccount =
    snapshot?.bank_account_number || claim.bank_account_number || "";
  const accountValidation = validateBankAccountString(rawAccount);
  if (!accountValidation.valid) {
    blockers.push(accountValidation.error || "Invalid beneficiary bank account number.");
  }

  return {
    claimId: claim.id,
    claimNumber: claim.claim_number || claim.id,
    claimantUserId,
    claimantName: claim.claimant_name || rawBeneficiaryName,
    beneficiaryName: rawBeneficiaryName,
    bankName: resolvedBank?.name || rawBankCodeOrName || "",
    bankCode: resolvedBank?.swiftCode || "",
    bankAccountNumber: accountValidation.normalized,
    maskedAccountNumber: maskBankAccountNumber(accountValidation.normalized),
    paymentMode: resolvedBank ? resolvedBank.paymentMode : null,
    amountCents,
    amount: amountCents > 0 ? Number((amountCents / 100).toFixed(2)) : 0,
    currency,
    eligible: blockers.length === 0,
    blockers,
  };
}

/**
 * Previews grouping and validation for a set of candidate claims and selected IDs.
 * Pure function — does not mutate database state.
 */
export function previewReimbursementSelection(
  candidateClaims: Claim[],
  selectedClaimIds: string[],
  options?: { year?: number; startingSequence?: number }
): ReimbursementPreviewResult {
  const year = options?.year ?? new Date().getFullYear();
  const startSeq = options?.startingSequence ?? 1;
  const selectedSet = new Set(selectedClaimIds);

  const evaluatedClaims = candidateClaims.map(evaluateClaimForReimbursement);
  const selectedEvaluated = evaluatedClaims.filter((c) => selectedSet.has(c.claimId));
  const excludedClaimIds = evaluatedClaims
    .filter((c) => !selectedSet.has(c.claimId))
    .map((c) => c.claimId);

  const blockedClaims = selectedEvaluated.filter((c) => !c.eligible);
  const selectedEligibleClaims = selectedEvaluated.filter((c) => c.eligible);

  // Group strictly by verified beneficiary identity + exact bank destination + payment mode + currency + optional identity fields
  const groups = new Map<
    string,
    {
      evals: ClaimEligibilityEvaluation[];
      claims: Claim[];
    }
  >();

  const claimById = new Map(candidateClaims.map((c) => [c.id, c]));

  for (const ev of selectedEligibleClaims) {
    const srcClaim = claimById.get(ev.claimId)!;
    const snap = srcClaim.approved_snapshot || null;
    const newIc = (snap?.beneficiary_new_ic ?? srcClaim.beneficiary_new_ic ?? "").trim();
    const oldIc = (snap?.beneficiary_old_ic ?? srcClaim.beneficiary_old_ic ?? "").trim();
    const bizReg = (snap?.beneficiary_business_reg ?? srcClaim.beneficiary_business_reg ?? "").trim();
    const others = (snap?.beneficiary_others ?? srcClaim.beneficiary_others ?? "").trim();
    const address = (snap?.beneficiary_address ?? srcClaim.beneficiary_address ?? "").trim();

    const groupKey = [
      ev.claimantUserId,
      ev.beneficiaryName.toUpperCase().replace(/\s+/g, " "),
      ev.bankCode,
      ev.bankAccountNumber,
      ev.paymentMode,
      ev.currency,
      newIc,
      oldIc,
      bizReg,
      others,
      address,
    ].join("|");

    const existing = groups.get(groupKey);
    if (existing) {
      existing.evals.push(ev);
      existing.claims.push(srcClaim);
    } else {
      groups.set(groupKey, { evals: [ev], claims: [srcClaim] });
    }
  }

  const proposedInstructions: BankPaymentInstructionRow[] = [];
  let lineOrder = 1;

  for (const { evals, claims } of Array.from(groups.values())) {
    const firstEval = evals[0];
    const firstClaim = claims[0];
    const snap = firstClaim.approved_snapshot || null;
    const sumCents = evals.reduce((acc, item) => acc + item.amountCents, 0);

    proposedInstructions.push({
      lineOrder,
      paymentMode: firstEval.paymentMode!,
      beneficiaryUserId: firstEval.claimantUserId,
      beneficiaryName: firstEval.beneficiaryName,
      beneficiaryAccountNumber: firstEval.bankAccountNumber,
      beneficiaryBankName: firstEval.bankName,
      beneficiaryBankCode: firstEval.bankCode,
      amountCents: sumCents,
      amount: centsToMyrNumber(sumCents),
      paymentDescription: formatPaymentDescription(year, startSeq + lineOrder - 1),
      paymentReference: "",
      beneficiaryNewIc: (snap?.beneficiary_new_ic ?? firstClaim.beneficiary_new_ic ?? "") || null,
      beneficiaryOldIc: (snap?.beneficiary_old_ic ?? firstClaim.beneficiary_old_ic ?? "") || null,
      beneficiaryBusinessReg:
        (snap?.beneficiary_business_reg ?? firstClaim.beneficiary_business_reg ?? "") || null,
      beneficiaryOthers: (snap?.beneficiary_others ?? firstClaim.beneficiary_others ?? "") || null,
      beneficiaryAddress:
        (snap?.beneficiary_address ?? firstClaim.beneficiary_address ?? "") || null,
      claimIds: evals.map((e) => e.claimId),
      claimNumbers: evals.map((e) => e.claimNumber),
    });
    lineOrder++;
  }

  const totalAmountCents = proposedInstructions.reduce((acc, row) => acc + row.amountCents, 0);
  const sumClaimCents = selectedEligibleClaims.reduce((acc, ev) => acc + ev.amountCents, 0);

  if (totalAmountCents !== sumClaimCents) {
    throw new Error(
      `Batch invariant violation: instruction sum (${totalAmountCents}) !== claim sum (${sumClaimCents}).`
    );
  }

  const previewDigest = createHash("sha256")
    .update(
      JSON.stringify({
        templateVersion: BANK_TEMPLATE_VERSION,
        claims: selectedEligibleClaims
          .map((e) => ({
            id: e.claimId,
            cents: e.amountCents,
            user: e.claimantUserId,
            bank: e.bankCode,
            acct: e.bankAccountNumber,
          }))
          .sort((a, b) => a.id.localeCompare(b.id)),
      })
    )
    .digest("hex");

  return {
    templateVersion: BANK_TEMPLATE_VERSION,
    evaluatedClaims,
    selectedEligibleClaims,
    excludedClaimIds,
    blockedClaims,
    proposedInstructions,
    totalSelectedClaims: selectedEligibleClaims.length,
    totalTransfers: proposedInstructions.length,
    totalAmountCents,
    totalAmount: totalAmountCents > 0 ? centsToMyrNumber(totalAmountCents) : 0,
    previewDigest,
  };
}

export class BankExportAdapter {
  readonly templateVersion = BANK_TEMPLATE_VERSION;
  private readonly validSwiftCodes = new Set(contract.banks.map((b) => b.swiftCode));

  /**
   * Validates that all payment instruction rows satisfy the Alliance Bank BIFF8 contract.
   */
  validate(instructions: BankPaymentInstructionRow[]): void {
    if (!Array.isArray(instructions) || instructions.length === 0) {
      throw new Error("Cannot export an empty reimbursement batch.");
    }

    const seenDescriptions = new Set<string>();

    for (let i = 0; i < instructions.length; i++) {
      const row = instructions[i];
      const label = `Row #${i + 1} (${row.paymentDescription || "unassigned"})`;

      if (!this.validSwiftCodes.has(row.beneficiaryBankCode)) {
        if (row.beneficiaryBankCode === contract.allianceBankNoteTypoFlagged) {
          throw new Error(
            `${label}: Bank code "${row.beneficiaryBankCode}" is the transposed note typo; use canonical "${ALLIANCE_BANK_SWIFT_CODE}".`
          );
        }
        throw new Error(
          `${label}: Unknown or unsupported SWIFT code "${row.beneficiaryBankCode}". Must be one of the 31 canonical Bank List codes.`
        );
      }

      const expectedMode =
        row.beneficiaryBankCode === ALLIANCE_BANK_SWIFT_CODE ? "LIP" : "LGP";
      if (row.paymentMode !== expectedMode) {
        throw new Error(
          `${label}: Invalid Payment Mode "${row.paymentMode}" for bank code "${row.beneficiaryBankCode}" (expected "${expectedMode}").`
        );
      }

      if (!row.beneficiaryName || !row.beneficiaryName.trim()) {
        throw new Error(`${label}: Beneficiary Name is required.`);
      }

      const acctCheck = validateBankAccountString(row.beneficiaryAccountNumber);
      if (!acctCheck.valid) {
        throw new Error(`${label}: ${acctCheck.error}`);
      }

      if (!Number.isInteger(row.amountCents) || row.amountCents <= 0) {
        throw new Error(`${label}: Amount in cents must be a positive integer.`);
      }
      const expectedAmount = centsToMyrNumber(row.amountCents);
      if (Math.abs(Number(row.amount) - expectedAmount) > 1e-6) {
        throw new Error(
          `${label}: Amount (${row.amount}) does not match exact cents (${expectedAmount}).`
        );
      }

      if (!row.paymentDescription || !/^P\d{6,}$/.test(row.paymentDescription.trim())) {
        throw new Error(
          `${label}: Payment Description "${row.paymentDescription}" must follow the running number format (e.g. P260001).`
        );
      }
      if (seenDescriptions.has(row.paymentDescription.trim())) {
        throw new Error(
          `${label}: Duplicate Payment Description "${row.paymentDescription}" within batch.`
        );
      }
      seenDescriptions.add(row.paymentDescription.trim());
    }
  }

  /**
   * Maps validated instruction models into the exact 12-column row arrays for Sheet1.
   */
  toPaymentRows(
    instructions: BankPaymentInstructionRow[]
  ): (string | number)[][] {
    this.validate(instructions);
    const ordered = [...instructions].sort((a, b) => a.lineOrder - b.lineOrder);

    return ordered.map((inst) => [
      inst.paymentMode,
      sanitizeSpreadsheetText(inst.beneficiaryName, 120),
      inst.beneficiaryAccountNumber.trim(),
      inst.beneficiaryBankCode.trim(),
      centsToMyrNumber(inst.amountCents),
      sanitizeSpreadsheetText(inst.paymentDescription, 20),
      sanitizeSpreadsheetText(inst.paymentReference || "", 40),
      sanitizeSpreadsheetText(inst.beneficiaryNewIc || "", 20),
      sanitizeSpreadsheetText(inst.beneficiaryOldIc || "", 20),
      sanitizeSpreadsheetText(inst.beneficiaryBusinessReg || "", 30),
      sanitizeSpreadsheetText(inst.beneficiaryOthers || "", 40),
      sanitizeSpreadsheetText(inst.beneficiaryAddress || "", 200),
    ]);
  }

  /**
   * Renders a genuine BIFF8 (.xls) binary Buffer with Sheet1 and Bank List.
   */
  renderXls(
    instructions: BankPaymentInstructionRow[],
    options?: BankExportOptions
  ): Buffer {
    const accountCellMode = options?.accountCellMode ?? "text";
    const paymentRows = this.toPaymentRows(instructions);

    const wb = XLSX.utils.book_new();

    // Build Sheet1 with exact 12 headers + contiguous payment rows (no notes, no totals, no sample rows)
    const sheet1AoA: (string | number)[][] = [
      [...SHEET1_HEADERS],
      ...paymentRows,
    ];
    const ws1 = XLSX.utils.aoa_to_sheet(sheet1AoA);

    // Enforce cell types on Sheet1 data rows
    for (let r = 1; r <= paymentRows.length; r++) {
      // Column C (index 2): Beneficiary Account / DuitNow ID Number
      const acctCellRef = XLSX.utils.encode_cell({ r, c: 2 });
      const acctValue = String(paymentRows[r - 1][2]);
      if (accountCellMode === "numeric" && !acctValue.startsWith("0") && /^\d{1,15}$/.test(acctValue)) {
        ws1[acctCellRef] = { t: "n", v: Number(acctValue), z: "0" };
      } else {
        ws1[acctCellRef] = { t: "s", v: acctValue, z: "@" };
      }

      // Column E (index 4): Amount (numeric with 2 decimal display)
      const amtCellRef = XLSX.utils.encode_cell({ r, c: 4 });
      const amtValue = Number(paymentRows[r - 1][4]);
      ws1[amtCellRef] = { t: "n", v: amtValue, z: "0.00" };
    }

    ws1["!cols"] = [
      { wch: 14 }, // Payment Mode
      { wch: 32 }, // Beneficiary Name
      { wch: 36 }, // Beneficiary Account / DuitNow ID Number
      { wch: 34 }, // Beneficiary Bank Code / DuitNow ID Type
      { wch: 14 }, // Amount
      { wch: 20 }, // Payment Description
      { wch: 20 }, // Payment Reference
      { wch: 22 }, // Beneficiary New IC No
      { wch: 22 }, // Beneficiary Old IC No
      { wch: 32 }, // Beneficiary Business Registration
      { wch: 22 }, // Beneficiary Others
      { wch: 36 }, // Beneficiary Address
    ];

    // Build Bank List worksheet with exact 2 headers + 31 canonical banks
    const bankListAoA: string[][] = [
      [...BANK_LIST_HEADERS],
      ...MALAYSIAN_BANKS.map((b) => [b.name, b.swiftCode]),
    ];
    const wsBankList = XLSX.utils.aoa_to_sheet(bankListAoA);
    wsBankList["!cols"] = [{ wch: 44 }, { wch: 16 }];

    XLSX.utils.book_append_sheet(wb, ws1, "Sheet1");
    XLSX.utils.book_append_sheet(wb, wsBankList, "Bank List");

    const out = XLSX.write(wb, { bookType: "biff8", type: "buffer" });
    return Buffer.isBuffer(out) ? out : Buffer.from(out);
  }

  /**
   * Round-trip parses a generated .xls buffer and verifies all contract invariants.
   */
  parseAndVerifyXls(buffer: Buffer) {
    if (!buffer || buffer.length < 8) {
      throw new Error("Invalid XLS buffer: too short.");
    }
    const magicHex = buffer.subarray(0, 8).toString("hex").toLowerCase();
    if (magicHex !== BIFF8_MAGIC_HEX) {
      throw new Error(
        `Invalid BIFF8 magic signature: expected ${BIFF8_MAGIC_HEX}, got ${magicHex}.`
      );
    }

    const wb = XLSX.read(buffer, { type: "buffer", raw: true });
    if (
      wb.SheetNames.length !== 2 ||
      wb.SheetNames[0] !== "Sheet1" ||
      wb.SheetNames[1] !== "Bank List"
    ) {
      throw new Error(
        `Invalid worksheet names/order: expected ["Sheet1", "Bank List"], got ${JSON.stringify(
          wb.SheetNames
        )}.`
      );
    }

    const s1 = wb.Sheets["Sheet1"];
    const s1Rows = XLSX.utils.sheet_to_json<(string | number)[]>(s1, {
      header: 1,
      defval: "",
      raw: true,
    });
    if (s1Rows.length < 2) {
      throw new Error("Sheet1 must contain 1 header row and at least 1 payment row.");
    }

    const headers = s1Rows[0].slice(0, 12);
    if (JSON.stringify(headers) !== JSON.stringify(SHEET1_HEADERS)) {
      throw new Error(
        `Sheet1 headers mismatch: expected ${JSON.stringify(
          SHEET1_HEADERS
        )}, got ${JSON.stringify(headers)}.`
      );
    }

    const bl = wb.Sheets["Bank List"];
    const blRows = XLSX.utils.sheet_to_json<string[]>(bl, {
      header: 1,
      defval: "",
      raw: true,
    });
    if (blRows.length !== 32) {
      throw new Error(`Bank List must contain 1 header + 31 bank rows, got ${blRows.length}.`);
    }
    if (JSON.stringify(blRows[0].slice(0, 2)) !== JSON.stringify(BANK_LIST_HEADERS)) {
      throw new Error(`Bank List headers mismatch: got ${JSON.stringify(blRows[0])}.`);
    }

    const dataRows = s1Rows.slice(1).map((r) => r.slice(0, 12));
    for (let i = 0; i < dataRows.length; i++) {
      const r = dataRows[i];
      if (String(r[0]) === "Notes" || String(r[0]).includes("LIP is for Alliance")) {
        throw new Error(`Row ${i + 2} contains explanatory Notes text in payment region.`);
      }
    }

    return {
      magicHex,
      sheetNames: wb.SheetNames,
      headers,
      dataRows,
      bankListHeader: blRows[0].slice(0, 2),
      bankListPairs: blRows.slice(1).map((r) => ({ bankName: r[0], swiftCode: r[1] })),
      sha256: createHash("sha256").update(buffer).digest("hex"),
    };
  }
}

export const bankExportAdapter = new BankExportAdapter();
