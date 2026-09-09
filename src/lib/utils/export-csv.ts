import { Claim } from "@/lib/types/database";
import { formatCurrency, formatDate } from "./formatters";

export function generateClaimsCsv(claims: Claim[]): string {
  const headers = [
    "Claim Number",
    "Claimant Name",
    "Claimant Email",
    "Ministry",
    "Programme / Event",
    "Cost Centre",
    "Submission Date",
    "Expense Date",
    "Expense Category",
    "Description",
    "Vendor / Merchant",
    "Expense Amount (RM)",
    "Claim Total (RM)",
    "Payment Method",
    "Claim Status",
    "Payment Date",
    "Payment Reference",
  ];

  const escapeCsv = (str: string | number | null | undefined): string => {
    if (str === null || str === undefined) return '""';
    const s = String(str).replace(/"/g, '""');
    return `"${s}"`;
  };

  const rows: string[] = [headers.map(escapeCsv).join(",")];

  claims.forEach((claim) => {
    const claimExpenses = claim.expenses && claim.expenses.length > 0 ? claim.expenses : [null];

    claimExpenses.forEach((exp) => {
      const row = [
        claim.claim_number || "DRAFT",
        claim.claimant?.full_name || "",
        claim.claimant?.email || "",
        claim.ministry?.name || "",
        claim.programme_event,
        claim.cost_centre?.name || claim.cost_centre?.code || "",
        claim.submitted_at ? formatDate(claim.submitted_at, "yyyy-MM-dd") : "",
        exp ? formatDate(exp.expense_date, "yyyy-MM-dd") : "",
        exp?.expense_category?.name || "",
        exp?.description || "",
        exp?.vendor || "",
        exp ? Number(exp.amount).toFixed(2) : "",
        Number(claim.total_amount).toFixed(2),
        claim.payment_method,
        claim.status,
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
