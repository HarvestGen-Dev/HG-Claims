import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import * as XLSX from "xlsx";
import template from "@/lib/banking/templates/jompay-bulk-b1.json";
import { jompayExportAdapter as adapter } from "@/lib/banking/jompay-export-adapter";
import { JOMPAY_COLUMNS, JOMPAY_TEMPLATE_VERSION } from "@/lib/banking/jompay";
import type { ReimbursementBatch } from "@/lib/types/database";

const batch = () =>
  ({
    payment_method: "JOMPAY",
    template_version: JOMPAY_TEMPLATE_VERSION,
    status: "FINALIZED",
    claim_count: 2,
    transfer_count: 2,
    total_amount_cents: 27560,
    instructions: [
      {
        line_order: 2,
        claim_count: 1,
        amount_cents: 100,
        jompay_snapshot: {
          biller_code: "0008888",
          reference_1: "00012345678901234567890",
          reference_2: "",
          biller_name: "Unifi",
          fail_email_1: "configured@test.invalid",
        },
      },
      {
        line_order: 1,
        claim_count: 1,
        amount_cents: 27460,
        jompay_snapshot: {
          biller_code: "0008888",
          reference_1: "00012345678901234567890",
          reference_2: "0007",
          biller_name: "Unifi",
          fail_email_1: "configured@test.invalid",
        },
      },
    ],
  }) as unknown as ReimbursementBatch;
type Archive = { FullPaths: string[]; FileIndex: { content: Uint8Array }[] };
function part(bytes: Buffer, name: string) {
  const zip = XLSX.CFB.read(bytes, { type: "buffer" }) as Archive;
  return Buffer.from(
    zip.FileIndex[zip.FullPaths.indexOf(`Root Entry/${name}`)].content,
  );
}
describe("supplied Alliance JomPAY B1 XLSX contract", () => {
  it("uses the measured, redacted source template with exactly its original headers", () => {
    const source = Buffer.from(template.base64, "base64");
    expect(createHash("sha256").update(source).digest("hex")).toBe(
      template.sanitizedTemplateSha256,
    );
    const wb = XLSX.read(source, { type: "buffer" });
    expect(wb.SheetNames).toEqual(["Sheet1"]);
    expect(XLSX.utils.sheet_to_json(wb.Sheets.Sheet1, { header: 1 })).toEqual([
      [...JOMPAY_COLUMNS],
    ]);
    expect(part(source, "xl/sharedStrings.xml").toString()).toContain(
      'uniqueCount="7"',
    );
    expect(part(source, "xl/workbook.xml").toString()).not.toContain("absPath");
  });
  it("exports separate rows, exact text identifiers, text cents and configured emails", () => {
    const b = batch(),
      bytes = adapter.renderXlsx(b);
    const checked = adapter.parseAndVerifyXlsx(bytes, b);
    expect(checked.rows).toEqual([
      [
        "0008888",
        "00012345678901234567890",
        "0007",
        "274.60",
        "configured@test.invalid",
        "",
        "Unifi",
      ],
      [
        "0008888",
        "00012345678901234567890",
        "",
        "1.00",
        "configured@test.invalid",
        "",
        "Unifi",
      ],
    ]);
    const ws = XLSX.read(bytes, { type: "buffer", cellNF: true }).Sheets.Sheet1;
    for (const c of ["A2", "B2", "C2", "D2", "E2", "F2", "G2"])
      expect(ws[c]).toMatchObject({ t: "s", z: "@" });
    expect(checked.sha256).toBe(
      createHash("sha256").update(bytes).digest("hex"),
    );
  });
  it("preserves the supplied header fill, widths, text amount column and print settings", () => {
    const original = Buffer.from(template.base64, "base64"),
      actual = adapter.renderXlsx(batch());
    expect(part(actual, "xl/styles.xml")).toEqual(
      part(original, "xl/styles.xml"),
    );
    const before = part(original, "xl/worksheets/sheet1.xml").toString(),
      after = part(actual, "xl/worksheets/sheet1.xml").toString();
    for (const pattern of [
      /<cols>.*?<\/cols>/,
      /<row r="1".*?<\/row>/,
      /<pageMargins[^>]*\/>/,
      /<pageSetup[^>]*\/>/,
    ])
      expect(after.match(pattern)?.[0]).toBe(before.match(pattern)?.[0]);
  });
  it("is byte-stable across repeated exports and directory changes", () => {
    const b = batch(),
      frozen = JSON.stringify(b),
      first = adapter.renderXlsx(b);
    expect(adapter.renderXlsx(JSON.parse(frozen))).toEqual(first);
    expect(JSON.stringify(b)).toBe(frozen);
  });
  it("keeps historical pending-template snapshots exportable without rewriting them", () => {
    const b = batch();
    b.template_version = "JOMPAY_TEMPLATE_PENDING";
    expect(
      adapter.parseAndVerifyXlsx(adapter.renderXlsx(b), b).rows,
    ).toHaveLength(2);
    expect(b.template_version).toBe("JOMPAY_TEMPLATE_PENDING");
  });
  it("escapes XML and stores formula-looking strings as literal text", () => {
    const b = batch();
    b.instructions![0].jompay_snapshot!.reference_1 = '=1+1 & <bill> "A"';
    const result = adapter.parseAndVerifyXlsx(adapter.renderXlsx(b), b);
    expect(result.rows[1][1]).toBe('=1+1 & <bill> "A"');
  });
  it.each([
    [
      "voided",
      (b: ReimbursementBatch) => {
        b.status = "VOIDED";
      },
    ],
    [
      "wrong method",
      (b: ReimbursementBatch) => {
        b.payment_method = "BANK_TRANSFER";
      },
    ],
    [
      "unknown version",
      (b: ReimbursementBatch) => {
        b.template_version = "UNKNOWN";
      },
    ],
    [
      "aggregated",
      (b: ReimbursementBatch) => {
        b.instructions![0].claim_count = 2;
      },
    ],
    [
      "invalid code",
      (b: ReimbursementBatch) => {
        b.instructions![0].jompay_snapshot!.biller_code = "abc";
      },
    ],
    [
      "missing reference",
      (b: ReimbursementBatch) => {
        b.instructions![0].jompay_snapshot!.reference_1 = " ";
      },
    ],
    [
      "invalid amount",
      (b: ReimbursementBatch) => {
        b.instructions![0].amount_cents = NaN;
      },
    ],
    [
      "negative amount",
      (b: ReimbursementBatch) => {
        b.instructions![0].amount_cents = -1;
      },
    ],
    [
      "fractional cents",
      (b: ReimbursementBatch) => {
        b.instructions![0].amount_cents = 1.5;
      },
    ],
    [
      "wrong total",
      (b: ReimbursementBatch) => {
        b.total_amount_cents = 1;
      },
    ],
    [
      "wrong bill count",
      (b: ReimbursementBatch) => {
        b.claim_count = 1;
      },
    ],
    [
      "duplicate order",
      (b: ReimbursementBatch) => {
        b.instructions![0].line_order = 1;
      },
    ],
    [
      "invalid email",
      (b: ReimbursementBatch) => {
        b.instructions![0].jompay_snapshot!.fail_email_1 = "bad";
      },
    ],
    [
      "invalid text",
      (b: ReimbursementBatch) => {
        b.instructions![0].jompay_snapshot!.reference_1 = "bad\u0000text";
      },
    ],
  ])("rejects %s frozen data", (_, change) => {
    const b = batch();
    change(b);
    expect(() => adapter.renderXlsx(b)).toThrow();
  });
  it("rejects a workbook whose cells differ from the approved snapshot", () => {
    const b = batch(),
      bytes = adapter.renderXlsx(b);
    b.instructions![0].amount_cents = 101;
    expect(() => adapter.parseAndVerifyXlsx(bytes, b)).toThrow(/frozen/);
  });
});
