import { describe, it, expect } from "vitest";
import { calculateTotalAmount, parseMoneyInput } from "@/lib/utils/calculations";

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
});
