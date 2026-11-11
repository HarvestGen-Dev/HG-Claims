import type { Profile } from "@/lib/types/database";
export function PayeeDetails({ payee }: { payee: Profile }) {
  const fields =
    payee.payment_method === "JOMPAY"
      ? [
          ["Biller name", payee.jompay_biller_name],
          ["Biller Code", payee.jompay_biller_code],
          ["Reference 1", payee.jompay_reference_1],
          ["Reference 2", payee.jompay_reference_2 || "Not provided"],
        ]
      : [
          ["Bank", payee.bank_name],
          ["Account holder", payee.bank_account_holder_name],
          ["Account number", payee.bank_account_number],
        ];
  return (
    <dl className="space-y-3 rounded-lg border bg-muted/30 p-4">
      {fields.map(([label, value]) => (
        <div key={label} className="space-y-1">
          <dt className="text-sm text-muted-foreground">{label}</dt>
          <dd className="text-sm font-medium break-all">
            {value || "Not provided"}
          </dd>
        </div>
      ))}
    </dl>
  );
}
