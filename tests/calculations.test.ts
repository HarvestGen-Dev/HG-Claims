import { describe, it, expect } from "vitest";
import { calculateTotalAmount, moneyToCents, parseMoneyInput } from "@/lib/utils/calculations";
import { expenseItemSchema } from "@/lib/validations/claim";

describe("Calculations & Currency Precision", () => {
  it("should accurately calculate total from multiple expense items without floating point drift", () => {
    const expenses = [
      { amount: 45.00 },
      { amount: 180.50 },
    ];
    const total = calculateTotalAmount(expenses);
    expect(total).toBe(225.50);
  });

  it("should handle string and numeric inputs safely", () => {
    const expenses = [
      { amount: "45.00" },
      { amount: 180.5 },
    ];
    const total = calculateTotalAmount(expenses);
    expect(total).toBe(225.50);
  });

  it("should return 0.00 for empty or invalid expense lists", () => {
    expect(calculateTotalAmount([])).toBe(0.00);
  });

  it("should parse money inputs correctly", () => {
    expect(parseMoneyInput("RM 225.50")).toBe(225.50);
    expect(parseMoneyInput("1,500.00")).toBe(1500.00);
    expect(parseMoneyInput(45.99)).toBe(45.99);
  });

  it("sums decimal cents exactly and rejects malformed precision", () => {
    expect(calculateTotalAmount([{ amount: "0.10" }, { amount: "0.20" }])).toBe(0.3);
    expect(moneyToCents("RM 1,500.05")).toBe(150005);
    expect(moneyToCents("1.005")).toBeNull();
    expect(moneyToCents("12abc")).toBeNull();
    expect(moneyToCents(Number.POSITIVE_INFINITY)).toBeNull();
    expect(expenseItemSchema.safeParse({ expense_date: "2026-11-03", description: "Receipt", cost_centre_id: "centre", amount: 1.005 }).success).toBe(false);
  });
});
