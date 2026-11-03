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
export { ALLIANCE_BANK_SWIFT_CODE, BANK_TEMPLATE_VERSION, MALAYSIAN_BANKS };

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

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/**
 * Pure FIPS 180-4 SHA-256 hex digest for UTF-8 strings.
 * Avoids pulling Node's `crypto-browserify` polyfill into client bundles.
 */
export function sha256Hex(input: string): string {
  const bytes = new TextEncoder().encode(input);
  const bitLen = bytes.length * 8;
  const totalBytes = (((bytes.length + 8) >> 6) + 1) << 6;
  const padded = new Uint8Array(totalBytes);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(totalBytes - 8, Math.floor(bitLen / 0x100000000), false);
  view.setUint32(totalBytes - 4, bitLen >>> 0, false);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const w = new Uint32Array(64);
  for (let offset = 0; offset < totalBytes; offset += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i++) {
      const v0 = w[i - 15];
      const s0 = ((v0 >>> 7) | (v0 << 25)) ^ ((v0 >>> 18) | (v0 << 14)) ^ (v0 >>> 3);
      const v1 = w[i - 2];
      const s1 = ((v1 >>> 17) | (v1 << 15)) ^ ((v1 >>> 19) | (v1 << 13)) ^ (v1 >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((v) => v.toString(16).padStart(8, "0"))
    .join("");
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

  const previewDigest = sha256Hex(
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
  );

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
