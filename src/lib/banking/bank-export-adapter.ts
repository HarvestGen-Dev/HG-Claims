import * as XLSX from "xlsx";
import { createHash } from "crypto";
import contract from "@/lib/constants/HG_Bank_Template_Contract.json";
import {
  ALLIANCE_BANK_SWIFT_CODE,
  BANK_TEMPLATE_VERSION,
  MALAYSIAN_BANKS,
  validateBankAccountString,
} from "@/lib/constants/banks";
import {
  SHEET1_HEADERS,
  BANK_LIST_HEADERS,
  BIFF8_MAGIC_HEX,
  toExactCents,
  centsToMyrNumber,
  formatPaymentDescription,
  sanitizeSpreadsheetText,
  evaluateClaimForReimbursement,
  previewReimbursementSelection,
  type BankPaymentInstructionRow,
  type ClaimEligibilityEvaluation,
  type ReimbursementPreviewResult,
  type BankExportOptions,
} from "./reimbursement-preview";

export {
  SHEET1_HEADERS,
  BANK_LIST_HEADERS,
  BIFF8_MAGIC_HEX,
  toExactCents,
  centsToMyrNumber,
  formatPaymentDescription,
  sanitizeSpreadsheetText,
  evaluateClaimForReimbursement,
  previewReimbursementSelection,
  type BankPaymentInstructionRow,
  type ClaimEligibilityEvaluation,
  type ReimbursementPreviewResult,
  type BankExportOptions,
};

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
