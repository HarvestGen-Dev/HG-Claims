import type { PayeePaymentMethod, Profile } from "@/lib/types/database";

export function payeeForm(profile?: Profile) {
  return {
    full_name: profile?.full_name || "",
    payment_method: (profile?.payment_method ||
      "BANK_TRANSFER") as PayeePaymentMethod,
    bank_code: profile?.bank_code || "",
    bank_account_holder_name: profile?.bank_account_holder_name || "",
    bank_account_number: profile?.bank_account_number || "",
    jompay_biller_name: profile?.jompay_biller_name || "",
    jompay_biller_code: profile?.jompay_biller_code || "",
    jompay_reference_1: profile?.jompay_reference_1 || "",
    jompay_reference_2: profile?.jompay_reference_2 || "",
  };
}
export function payeePayload(
  data: ReturnType<typeof payeeForm>,
  profile?: Profile,
) {
  return {
    id: profile?.id,
    expected_payment_revision: profile?.payment_revision,
    full_name: data.full_name.trim(),
    payment_method: data.payment_method,
    ...(data.payment_method === "JOMPAY"
      ? {
          jompay_biller_name: data.jompay_biller_name.trim(),
          jompay_biller_code: data.jompay_biller_code.trim(),
          jompay_reference_1: data.jompay_reference_1.trim(),
          jompay_reference_2: data.jompay_reference_2.trim(),
        }
      : {
          bank_code: data.bank_code,
          bank_account_holder_name: data.bank_account_holder_name.trim(),
          bank_account_number: data.bank_account_number.trim(),
        }),
  };
}
export function isBankDetailsVerified(profile: Profile) {
  return (
    profile.payment_method !== "JOMPAY" &&
    Number.isInteger(profile.payment_revision) &&
    Number(profile.payment_revision) > 0 &&
    profile.verified_payment_revision === profile.payment_revision
  );
}
export const paymentFieldLabels: Record<string, string> = {
  method: "Payment method",
  bank: "Bank",
  holder: "Account holder",
  account: "Account number",
  biller: "Biller name",
  code: "Biller Code",
  r1: "Reference 1",
  r2: "Reference 2",
};
export interface PaymentDetailChange {
  id: string;
  created_at: string;
  actor_name?: string;
  changed_fields: string[];
  old_value: Record<string, string | null>;
  new_value: Record<string, string | null>;
}
