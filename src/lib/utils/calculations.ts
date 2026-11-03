/** Parse a decimal amount without binary floating point arithmetic. */
export function moneyToCents(value: string | number): number | null {
  if (typeof value === "number" && !Number.isFinite(value)) return null;
  const input = String(value).trim().replace(/^RM\s*/i, "");
  if (!/^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(input)) return null;
  const normalized = input.replace(/,/g, "");
  const negative = normalized.startsWith("-");
  const [whole, fraction = ""] = (negative ? normalized.slice(1) : normalized).split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? (negative ? -cents : cents) : null;
}

export function calculateTotalAmount(expenses: Array<{ amount: number | string }>): number {
  if (!Array.isArray(expenses)) return 0;
  let totalCents = 0;
  for (const expense of expenses) {
    const cents = moneyToCents(expense.amount);
    if (cents !== null) totalCents += cents;
  }
  return totalCents / 100;
}

export function parseMoneyInput(value: string | number): number {
  return (moneyToCents(value) ?? 0) / 100;
}
