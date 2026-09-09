export function calculateTotalAmount(expenses: Array<{ amount: number | string }>): number {
  if (!expenses || !Array.isArray(expenses) || expenses.length === 0) {
    return 0.00;
  }
  const sum = expenses.reduce((acc, curr) => {
    const val = typeof curr.amount === "string" ? parseFloat(curr.amount) : curr.amount;
    return isNaN(val) ? acc : acc + val;
  }, 0);
  
  // Round safely to 2 decimal places
  return Math.round((sum + Number.EPSILON) * 100) / 100;
}

export function parseMoneyInput(val: string | number): number {
  if (typeof val === "number") return val;
  const cleaned = val.replace(/[^0-9.-]+/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : Math.round((num + Number.EPSILON) * 100) / 100;
}
