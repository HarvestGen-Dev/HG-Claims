import { Claim } from "@/lib/types/database";
import { formatDate, STATUS_MAP } from "./formatters";

export function generateClaimsCsv(claims: Claim[]): string {
  const headers = [
    "Claim Number",
    "Claim Date",
    "Status",
    "Submitted By",
    "Claimant Name",
    "Claimant Email",
    "Claimant Phone",
    "Claimant Bank",
    "Bank Account Number",
    "Team",
    "Receipt Date",
    "Vendor",
    "Description",
    "Amount",
    "Receipt Attached",
    "Payment Date",
    "Payment Ref",
  ];

  const escapeCsv = (str: string | number | null | undefined): string => {
    if (str === null || str === undefined) return `""`;
    const value = String(str);
    const safe = /^[\s]*[=+@-]/.test(value) ? `'${value}` : value;
    const s = safe.replace(/"/g, `""`);
    return `"${s}"`;
  };

  const rows: string[] = [headers.map(escapeCsv).join(",")];

  claims.forEach((claim) => {
    const claimExpenses = claim.expenses && claim.expenses.length > 0 ? claim.expenses : [null];

    claimExpenses.forEach((exp) => {
      const hasAttachment = exp
        ? (claim.attachments?.some((a) => a.expense_id === exp.id) ?? false)
        : ((claim.attachments?.length ?? 0) > 0);

      const row = [
        claim.claim_number || "DRAFT",
        claim.claim_date ? formatDate(claim.claim_date, "yyyy-MM-dd") : (claim.submitted_at ? formatDate(claim.submitted_at, "yyyy-MM-dd") : ""),
        STATUS_MAP[claim.status]?.label || claim.status,
        claim.submitted_by?.full_name || claim.submitted_by?.email || "",
        claim.claimant_name || claim.claimant?.full_name || "",
        claim.claimant_email || claim.claimant?.email || "",
        claim.claimant_phone || claim.claimant?.phone || "",
        claim.bank_name || "",
        claim.bank_account_number || "",
        claim.ministry?.name || "",
        exp ? formatDate(exp.expense_date, "yyyy-MM-dd") : "",
        exp?.vendor || "",
        exp?.description || "",
        exp ? Number(exp.amount).toFixed(2) : Number(claim.total_amount).toFixed(2),
        hasAttachment ? "Yes" : "No",
        claim.payment?.payment_date ? formatDate(claim.payment.payment_date, "yyyy-MM-dd") : "",
        claim.payment?.payment_reference || "",
      ];
      rows.push(row.map(escapeCsv).join(","));
    });
  });

  return "\uFEFF" + rows.join("\r\n"); // UTF-8 BOM for Excel compatibility
}

export function downloadCsv(filename: string, csvContent: string): void {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
