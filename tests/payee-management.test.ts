import { describe, it, expect } from "vitest";
import { payeeForm, payeePayload, isBankDetailsVerified } from "@/lib/payees";
import type { Profile } from "@/lib/types/database";
describe("supplier payment methods", () => {
  it("sends only JomPAY fields, retains leading zeros and no bank fields", () => {
    const form = {
      ...payeeForm(),
      payment_method: "JOMPAY" as const,
      full_name: " Utility ",
      bank_account_number: "old",
      jompay_biller_name: " TNB ",
      jompay_biller_code: " 000123 ",
      jompay_reference_1: " 000456 ",
      jompay_reference_2: "",
    };
    const body = payeePayload(form);
    expect(body).toMatchObject({
      full_name: "Utility",
      payment_method: "JOMPAY",
      jompay_biller_code: "000123",
      jompay_reference_1: "000456",
    });
    expect(body).not.toHaveProperty("bank_account_number");
    expect(body).not.toHaveProperty("roles");
  });
  it("sends only bank fields for a bank payee and includes its captured revision", () => {
    const profile = { id: "payee", payment_revision: 3 } as Profile;
    const body = payeePayload(
      {
        ...payeeForm(),
        bank_code: "MBBEMYKL",
        bank_account_number: "000123",
        bank_account_holder_name: "Name",
      },
      profile,
    );
    expect(body).toMatchObject({
      id: "payee",
      expected_payment_revision: 3,
      bank_account_number: "000123",
    });
    expect(body).not.toHaveProperty("jompay_biller_code");
  });
  it("never treats JomPAY or missing revision metadata as verified bank details", () => {
    expect(isBankDetailsVerified({} as Profile)).toBe(false);
    expect(
      isBankDetailsVerified({
        payment_method: "JOMPAY",
        payment_revision: 1,
        verified_payment_revision: 1,
      } as Profile),
    ).toBe(false);
    expect(
      isBankDetailsVerified({
        payment_method: "BANK_TRANSFER",
        payment_revision: 2,
        verified_payment_revision: 1,
      } as Profile),
    ).toBe(false);
    expect(
      isBankDetailsVerified({
        payment_method: "BANK_TRANSFER",
        payment_revision: 2,
        verified_payment_revision: 2,
      } as Profile),
    ).toBe(true);
  });
});
