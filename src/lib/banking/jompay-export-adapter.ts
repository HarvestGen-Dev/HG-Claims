import { createHash } from "node:crypto";
import * as XLSX from "xlsx";
import template from "./templates/jompay-bulk-b1.json";
import {
  JOMPAY_COLUMNS,
  JOMPAY_TEMPLATE_VERSION,
  getJompayReviewRows,
} from "./jompay";
import type { ReimbursementBatch } from "@/lib/types/database";

type Archive = {
  FullPaths: string[];
  FileIndex: { content: Uint8Array; size: number; ct?: Date; mt?: Date }[];
};
const zip = XLSX.CFB as {
  read: (data: Buffer, options: { type: "buffer" }) => Archive;
  write: (
    data: Archive,
    options: { type: "buffer"; fileType: "zip" },
  ) => Buffer;
};
const sheetPath = "Root Entry/xl/worksheets/sheet1.xml";

function literal(value: string): string {
  // Inline-string cells never interpret a reference, email or name as a formula.
  if (
    value.length > 32767 ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/.test(value)
  ) {
    throw new Error("A JomPAY field contains unsupported spreadsheet text.");
  }
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export const jompayExportAdapter = {
  templateVersion: JOMPAY_TEMPLATE_VERSION,
  renderXlsx(batch: ReimbursementBatch): Buffer {
    if (
      ![JOMPAY_TEMPLATE_VERSION, "JOMPAY_TEMPLATE_PENDING"].includes(
        batch.template_version,
      )
    ) {
      throw new Error("Unsupported JomPAY template version.");
    }
    if (batch.status === "VOIDED")
      throw new Error("Cannot export a voided JomPAY batch.");
    const rows = getJompayReviewRows(batch);
    if (!rows.length || rows.length > 1048575)
      throw new Error(
        "Choose a nonempty JomPAY batch within the worksheet row limit.",
      );
    if (
      rows.length !== Number(batch.claim_count) ||
      rows.length !== Number(batch.transfer_count)
    ) {
      throw new Error(
        "JomPAY batch must contain exactly one instruction per bill.",
      );
    }
    const lineOrders = (batch.instructions || []).map((i) => i.line_order);
    if (
      lineOrders.some((n) => !Number.isInteger(n) || n < 1) ||
      new Set(lineOrders).size !== rows.length
    ) {
      throw new Error("Invalid JomPAY bill ordering.");
    }
    if (
      rows.some(
        (row) =>
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row[4]) ||
          (row[5] && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row[5])),
      )
    ) {
      throw new Error("Invalid frozen JomPAY failure email address.");
    }
    const sum = (batch.instructions || []).reduce(
      (n, i) => n + Number(i.amount_cents),
      0,
    );
    if (
      !Number.isSafeInteger(sum) ||
      sum !== Number(batch.total_amount_cents)
    ) {
      throw new Error("JomPAY batch total does not match its frozen bills.");
    }
    const source = Buffer.from(template.base64, "base64");
    if (
      createHash("sha256").update(source).digest("hex") !==
      template.sanitizedTemplateSha256
    ) {
      throw new Error("JomPAY template integrity check failed.");
    }
    const archive = zip.read(source, { type: "buffer" });
    const entry = archive.FileIndex[archive.FullPaths.indexOf(sheetPath)];
    if (!entry) throw new Error("JomPAY template worksheet is missing.");
    let xml = Buffer.from(entry.content).toString("utf8");
    const header = xml.match(/<sheetData>([\s\S]*?)<\/sheetData>/)?.[1];
    if (!header || !xml.includes('<dimension ref="A1:G1"'))
      throw new Error("Unexpected JomPAY template layout.");
    const data = rows
      .map((row, index) => {
        const r = index + 2;
        return `<row r="${r}" spans="1:7">${row
          .map(
            (v, c) =>
              `<c r="${String.fromCharCode(65 + c)}${r}" s="3" t="inlineStr"><is><t xml:space="preserve">${literal(v)}</t></is></c>`,
          )
          .join("")}</row>`;
      })
      .join("");
    // Keep original header, green fill, widths, column formats and print settings.
    // Only the data region/dimension changes. Sample bills are absent from the asset.
    xml = xml
      .replace(
        /<sheetData>[\s\S]*?<\/sheetData>/,
        () => `<sheetData>${header}${data}</sheetData>`,
      )
      .replace(
        '<dimension ref="A1:G1"',
        `<dimension ref="A1:G${rows.length + 1}"`,
      );
    entry.content = Buffer.from(xml, "utf8");
    entry.size = entry.content.length;
    for (const file of archive.FileIndex) {
      file.ct = new Date("1980-01-01T00:00:00Z");
      file.mt = new Date("1980-01-01T00:00:00Z");
    }
    return Buffer.from(zip.write(archive, { type: "buffer", fileType: "zip" }));
  },
  parseAndVerifyXlsx(buffer: Buffer, batch: ReimbursementBatch) {
    if (buffer.subarray(0, 4).toString("hex") !== "504b0304")
      throw new Error("Invalid JomPAY XLSX file.");
    const wb = XLSX.read(buffer, { type: "buffer", raw: true, cellNF: true });
    if (wb.SheetNames.length !== 1 || wb.SheetNames[0] !== "Sheet1")
      throw new Error("JomPAY worksheet layout changed.");
    const ws = wb.Sheets.Sheet1;
    const expected = [[...JOMPAY_COLUMNS], ...getJompayReviewRows(batch)];
    if (ws["!ref"] !== `A1:G${expected.length}`)
      throw new Error("JomPAY worksheet dimensions changed.");
    expected.forEach((row, r) =>
      row.forEach((value, c) => {
        const cell = ws[XLSX.utils.encode_cell({ r, c })];
        if (
          !cell ||
          cell.t !== "s" ||
          cell.f ||
          cell.v !== value ||
          (r > 0 && cell.z !== "@")
        ) {
          throw new Error(
            "JomPAY workbook differs from its frozen instructions.",
          );
        }
      }),
    );
    return {
      sha256: createHash("sha256").update(buffer).digest("hex"),
      rows: expected.slice(1),
    };
  },
};
