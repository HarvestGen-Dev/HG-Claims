import type { Claim, ReimbursementBatch } from "@/lib/types/database";
import { moneyToCents } from "@/lib/utils/calculations";
export const JOMPAY_COLUMNS = [
  "Biller Code",
  "Reference 1",
  "Reference 2",
  "Amount",
  "Fail Email Address 1",
  "Fail Email Address 2",
  "Biller Name",
] as const;
export const JOMPAY_TEMPLATE_VERSION = "JOMPAY_BULK_B1_XLSX_V1";
export function previewJompayClaims(claims: Claim[]) {
  return claims.map((c) => {
    const details = c.approved_snapshot?.jompay;
    const cents = moneyToCents(c.total_amount);
    const valid =
      c.status === "APPROVED_FOR_PAYMENT" &&
      c.payee_payment_method === "JOMPAY" &&
      !c.active_batch_id &&
      !c.payment &&
      !!details &&
      /^\d+$/.test(details.biller_code) &&
      !!details.reference_1?.trim() &&
      cents !== null &&
      cents > 0;
    return { claimId: c.id, eligible: valid, amountCents: cents || 0, details };
  });
}
/** Frozen rows shared by the Finance preview and template-based export. */
export function getJompayReviewRows(batch: ReimbursementBatch): string[][] {
  if (batch.payment_method !== "JOMPAY")
    throw new Error("Choose a JomPAY batch.");
  return [...(batch.instructions || [])]
    .sort((a, b) => a.line_order - b.line_order)
    .map((i) => {
      const d = i.jompay_snapshot;
      if (
        i.claim_count !== 1 ||
        !d ||
        !/^\d+$/.test(d.biller_code) ||
        !d.reference_1?.trim() ||
        !d.biller_name?.trim() ||
        !Number.isSafeInteger(Number(i.amount_cents)) ||
        Number(i.amount_cents) <= 0
      )
        throw new Error("Invalid individual JomPAY bill snapshot.");
      return [
        d.biller_code,
        d.reference_1,
        d.reference_2 || "",
        `${Math.floor(Number(i.amount_cents) / 100)}.${String(Number(i.amount_cents) % 100).padStart(2, "0")}`,
        d.fail_email_1 || "",
        d.fail_email_2 || "",
        d.biller_name,
      ];
    });
}
