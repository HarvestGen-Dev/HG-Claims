"use client";
import { useEffect, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { iamClient, workspaceStore } from "@/lib/domains";
import { MALAYSIAN_BANKS, maskBankAccountNumber } from "@/lib/constants/banks";
import type { PayeePaymentMethod, Profile } from "@/lib/types/database";
const empty = {
  full_name: "",
  payment_method: "BANK_TRANSFER" as PayeePaymentMethod,
  bank_code: "MBBEMYKL",
  bank_account_holder_name: "",
  bank_account_number: "",
  jompay_biller_name: "",
  jompay_biller_code: "",
  jompay_reference_1: "",
  jompay_reference_2: "",
};
export default function SuppliersPage() {
  const [profiles, setProfiles] = useState(iamClient.getProfiles());
  const [data, setData] = useState(empty);
  const [id, setId] = useState<string>();
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<unknown[] | null>(null);
  useEffect(
    () =>
      workspaceStore.subscribeDomains(["iam"], () =>
        setProfiles(iamClient.getProfiles()),
      ),
    [],
  );
  const field = (key: keyof typeof empty, label: string, required = true) => (
    <label key={key} className="block text-sm">
      {label}
      <Input
        value={data[key]}
        onChange={(e) => setData({ ...data, [key]: e.target.value })}
        required={required}
      />
    </label>
  );
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await workspaceStore.dispatchDomainCommand(
        "/api/v1/iam",
        "create_payee_profile",
        { id, ...data },
      );
      setId(undefined);
      setData(empty);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save supplier.");
    } finally {
      setBusy(false);
    }
  }
  function edit(p: Profile) {
    setId(p.id);
    setData({
      full_name: p.full_name,
      payment_method: p.payment_method || "BANK_TRANSFER",
      bank_code: p.bank_code || "MBBEMYKL",
      bank_account_holder_name: p.bank_account_holder_name || "",
      bank_account_number: p.bank_account_number || "",
      jompay_biller_name: p.jompay_biller_name || "",
      jompay_biller_code: p.jompay_biller_code || "",
      jompay_reference_1: p.jompay_reference_1 || "",
      jompay_reference_2: p.jompay_reference_2 || "",
    });
  }
  return (
    <AppLayout>
      <div className="space-y-5 max-w-4xl">
        <header>
          <h1 className="text-xl font-semibold">
            Suppliers and payment details
          </h1>
          <p className="text-sm text-muted-foreground">
            New or changed payment details remain Unverified until Finance
            confirms them.
          </p>
        </header>
        <Card>
          <CardContent className="p-4">
            <form onSubmit={save} className="space-y-4">
              <h2 className="font-semibold">
                {id ? "Edit supplier" : "Add supplier"}
              </h2>
              <div className="grid sm:grid-cols-2 gap-4">
                {field("full_name", "Supplier name")}
                <div>
                  <label htmlFor="supplier-payment-method">Payment method</label>
                  <Select
                    id="supplier-payment-method"
                    className="w-full"
                    value={data.payment_method}
                    onChange={(e) =>
                      setData({
                        ...data,
                        payment_method: e.target.value as PayeePaymentMethod,
                      })
                    }
                  >
                    <option value="BANK_TRANSFER">Bank Transfer</option>
                    <option value="JOMPAY">JomPAY</option>
                  </Select>
                </div>
                {data.payment_method === "BANK_TRANSFER" ? (
                  <>
                    <div>
                      <label htmlFor="supplier-bank">Bank</label>
                      <Select
                        id="supplier-bank"
                        className="w-full"
                        value={data.bank_code}
                        onChange={(e) =>
                          setData({ ...data, bank_code: e.target.value })
                        }
                      >
                        {MALAYSIAN_BANKS.map((b) => (
                          <option key={b.swiftCode} value={b.swiftCode}>
                            {b.name}
                          </option>
                        ))}
                      </Select>
                    </div>
                    {field("bank_account_holder_name", "Account holder name")}
                    {field("bank_account_number", "Account number")}
                  </>
                ) : (
                  <>
                    {field("jompay_biller_name", "Biller name")}
                    {field("jompay_biller_code", "Biller Code")}
                    {field("jompay_reference_1", "Reference 1")}
                    {field(
                      "jompay_reference_2",
                      "Reference 2 (optional)",
                      false,
                    )}
                  </>
                )}
              </div>
              <div className="flex gap-2">
                <Button loading={busy}>
                  {id ? "Save changes" : "Add supplier"}
                </Button>
                {id && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setId(undefined);
                      setData(empty);
                    }}
                  >
                    Cancel
                  </Button>
                )}
              </div>
              {error && (
                <p role="alert" className="text-sm text-red-700">
                  {error}
                </p>
              )}
            </form>
          </CardContent>
        </Card>
        <Input
          aria-label="Search suppliers"
          placeholder="Search suppliers"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <ul className="divide-y border rounded-lg">
          {profiles
            .filter(
              (p) =>
                p.is_payee_only &&
                p.full_name.toLowerCase().includes(search.toLowerCase()),
            )
            .map((p) => (
              <li key={p.id} className="p-4 space-y-3">
                <div className="flex flex-wrap justify-between gap-3">
                  <div>
                    <p className="font-medium">{p.full_name}</p>
                    <p className="text-sm text-muted-foreground">
                      {p.payment_method === "JOMPAY"
                        ? "JomPAY"
                        : `${p.bank_name} · ${maskBankAccountNumber(p.bank_account_number || "")}`}
                    </p>
                    <p className="text-sm">
                      {p.verified_payment_revision === p.payment_revision
                        ? "Verified"
                        : "Unverified"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="ghost"
                      onClick={async () => {
                        try {
                          await iamClient.updateProfile(p.id, {
                            status:
                              p.status === "ACTIVE" ? "INACTIVE" : "ACTIVE",
                          });
                        } catch (e) {
                          setError(
                            e instanceof Error
                              ? e.message
                              : "Unable to update supplier.",
                          );
                        }
                      }}
                    >
                      {p.status === "ACTIVE" ? "Deactivate" : "Activate"}
                    </Button>
                    <Button variant="outline" onClick={() => edit(p)}>
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      onClick={async () => {
                        try {
                          await workspaceStore.dispatchDomainCommand(
                            "/api/v1/finance",
                            "verify_payee",
                            { id: p.id, payment_revision: p.payment_revision },
                          );
                          await workspaceStore.refreshDomain("/api/v1/iam");
                        } catch (e) {
                          setError(
                            e instanceof Error
                              ? e.message
                              : "Unable to verify.",
                          );
                        }
                      }}
                    >
                      Confirm verified
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={async () => {
                        try {
                          const h = await workspaceStore.dispatchDomainCommand(
                            "/api/v1/finance",
                            "payment_detail_history",
                            { id: p.id },
                            { skipRefresh: true },
                          );
                          setHistory(h.changes);
                        } catch (e) {
                          setError(
                            e instanceof Error
                              ? e.message
                              : "Unable to load history.",
                          );
                        }
                      }}
                    >
                      History
                    </Button>
                  </div>
                </div>
              </li>
            ))}
        </ul>
        {history && (
          <section>
            <h2 className="font-semibold">Payment detail change history</h2>
            <p className="text-sm text-muted-foreground">
              Account numbers are encrypted in the audit trail.
            </p>
            <pre className="mt-3 text-xs overflow-auto max-h-80 border rounded-lg p-4">
              {JSON.stringify(history, null, 2)}
            </pre>
            <Button variant="ghost" onClick={() => setHistory(null)}>
              Close history
            </Button>
          </section>
        )}
      </div>
    </AppLayout>
  );
}
