"use client";
import { useEffect, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { PayeeDetails } from "@/components/finance/PayeeDetails";
import { iamClient, workspaceStore } from "@/lib/domains";
import { MALAYSIAN_BANKS, maskBankAccountNumber } from "@/lib/constants/banks";
import {
  payeeForm,
  payeePayload,
  isBankDetailsVerified,
  paymentFieldLabels,
  type PaymentDetailChange,
} from "@/lib/payees";
import { formatDateTime } from "@/lib/utils/formatters";
import type { PayeePaymentMethod, Profile } from "@/lib/types/database";

export default function SuppliersPage() {
  const [profiles, setProfiles] = useState(iamClient.getProfiles());
  const [dialog, setDialog] = useState<"edit" | "review" | "history" | null>(
    null,
  );
  const [selected, setSelected] = useState<Profile>();
  const [data, setData] = useState(payeeForm());
  const [checked, setChecked] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<PaymentDetailChange[]>([]);
  useEffect(
    () =>
      workspaceStore.subscribeDomains(["iam"], () =>
        setProfiles(iamClient.getProfiles()),
      ),
    [],
  );
  const suppliers = profiles.filter(
    (p) =>
      p.is_payee_only &&
      p.full_name.toLowerCase().includes(search.toLowerCase()) &&
      (status === "ALL" || p.status === status),
  );
  function close() {
    if (!busy) {
      setDialog(null);
      setError("");
    }
  }
  function edit(profile?: Profile) {
    setSelected(profile);
    setData(payeeForm(profile));
    setError("");
    setDialog("edit");
  }
  function review(profile: Profile) {
    setSelected(profile);
    setChecked(false);
    setError("");
    setDialog("review");
  }
  async function run(work: () => Promise<unknown>) {
    if (busy) return false;
    setBusy(true);
    setError("");
    try {
      await work();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to update supplier.");
      return false;
    } finally {
      setBusy(false);
    }
  }
  const field = (
    key: keyof ReturnType<typeof payeeForm>,
    label: string,
    required = true,
  ) => (
    <div key={key} className="space-y-1">
      <label htmlFor={`payee-${key}`} className="text-sm font-medium">
        {label}
      </label>
      <Input
        id={`payee-${key}`}
        value={data[key]}
        onChange={(e) => setData({ ...data, [key]: e.target.value })}
        required={required}
        disabled={busy}
        maxLength={key === "full_name" ? 150 : undefined}
      />
    </div>
  );
  return (
    <AppLayout>
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">
              Suppliers and payment details
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage payees here. Suppliers do not have user accounts or login
              roles.
            </p>
          </div>
          <Button onClick={() => edit()}>Add supplier</Button>
        </header>
        <p className="text-sm text-muted-foreground">
          JomPAY payees do not need verification. For Bank Transfer, Finance can
          review and verify the bank details.
        </p>
        {!dialog && error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="flex flex-col sm:flex-row gap-3">
          <Input
            aria-label="Search suppliers"
            placeholder="Search suppliers"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Select
            aria-label="Supplier status"
            className="sm:w-44"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="ALL">All suppliers</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </Select>
        </div>
        <ul className="divide-y border rounded-lg">
          {!suppliers.length && (
            <li className="p-5 text-sm text-muted-foreground">
              No suppliers match your search.
            </li>
          )}
          {suppliers.map((p) => (
            <li key={p.id} className="p-4 space-y-3">
              <div className="flex flex-wrap justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <p className="font-medium break-words">{p.full_name}</p>
                  <p className="text-sm text-muted-foreground">
                    {p.payment_method === "JOMPAY"
                      ? `JomPAY · Biller Code ${p.jompay_biller_code || "Not provided"}`
                      : `${p.bank_name || "Bank Transfer"} · ${maskBankAccountNumber(p.bank_account_number || "")}`}
                  </p>
                  <div className="flex gap-2 items-center">
                    {p.status !== "ACTIVE" && (
                      <Badge variant="secondary">Inactive</Badge>
                    )}
                    {p.payment_method === "JOMPAY" ? (
                      <span className="text-xs text-muted-foreground">
                        Verification not required
                      </span>
                    ) : (
                      <Badge
                        variant={
                          isBankDetailsVerified(p) ? "success" : "warning"
                        }
                      >
                        {isBankDetailsVerified(p) ? "Verified" : "Unverified"}
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 items-start">
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => edit(p)}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => review(p)}
                  >
                    {p.payment_method !== "JOMPAY" && !isBankDetailsVerified(p)
                      ? "Review bank details"
                      : "Details"}
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        const result =
                          await workspaceStore.dispatchDomainCommand(
                            "/api/v1/finance",
                            "payment_detail_history",
                            { id: p.id },
                            { skipRefresh: true },
                          );
                        setHistory(result.changes || []);
                        setSelected(p);
                        setDialog("history");
                      })
                    }
                  >
                    History
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() =>
                      void run(() =>
                        iamClient.updateProfile(p.id, {
                          status: p.status === "ACTIVE" ? "INACTIVE" : "ACTIVE",
                        }),
                      )
                    }
                  >
                    {p.status === "ACTIVE" ? "Deactivate" : "Activate"}
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
        <Dialog
          open={dialog === "edit"}
          onOpenChange={(open) => {
            if (!open) close();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {selected ? "Edit supplier" : "Add supplier"}
            </DialogTitle>
            <DialogDescription>
              {data.payment_method === "JOMPAY"
                ? "Save biller details for JomPAY. No bank account or verification is needed."
                : "Bank detail changes require a fresh Finance review. Existing frozen batches keep their saved details."}
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await run(() =>
                  workspaceStore.dispatchDomainCommand(
                    "/api/v1/iam",
                    "create_payee_profile",
                    payeePayload(data, selected),
                  ),
                )
              )
                setDialog(null);
            }}
            className="space-y-4"
          >
            {field("full_name", "Supplier name")}
            <div className="space-y-1">
              <label
                htmlFor="supplier-payment-method"
                className="text-sm font-medium"
              >
                Payment method
              </label>
              <Select
                id="supplier-payment-method"
                className="w-full"
                disabled={busy}
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
            {data.payment_method === "JOMPAY" ? (
              <>
                {field("jompay_biller_name", "Biller name")}
                {field("jompay_biller_code", "Biller Code")}
                {field("jompay_reference_1", "Reference 1")}
                {field("jompay_reference_2", "Reference 2 (optional)", false)}
              </>
            ) : (
              <>
                <div className="space-y-1">
                  <label
                    htmlFor="supplier-bank"
                    className="text-sm font-medium"
                  >
                    Bank
                  </label>
                  <Select
                    id="supplier-bank"
                    className="w-full"
                    disabled={busy}
                    required
                    value={data.bank_code}
                    onChange={(e) =>
                      setData({ ...data, bank_code: e.target.value })
                    }
                  >
                    <option value="">Choose bank</option>
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
            )}
            {error && (
              <p role="alert" className="text-sm text-red-700">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={close}
              >
                Cancel
              </Button>
              <Button type="submit" loading={busy}>
                {selected ? "Save changes" : "Add supplier"}
              </Button>
            </DialogFooter>
          </form>
        </Dialog>
        <Dialog
          open={dialog === "review"}
          onOpenChange={(open) => {
            if (!open) close();
          }}
        >
          <DialogHeader>
            <DialogTitle>Payment details</DialogTitle>
            <DialogDescription>{selected?.full_name}</DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <PayeeDetails payee={selected} />
              {selected.payment_method === "JOMPAY" ? (
                <p className="text-sm text-muted-foreground">
                  JomPAY payees do not need verification. These details will be
                  frozen when each claim is approved.
                </p>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    Verification records that Finance checked these bank details
                    against the supplier’s documents. It does not approve claims
                    or confirm payment.
                  </p>
                  {isBankDetailsVerified(selected) ? (
                    <p className="text-sm">
                      Verified
                      {selected.payment_verified_at
                        ? ` on ${formatDateTime(selected.payment_verified_at)}`
                        : ""}
                      .
                    </p>
                  ) : (
                    <label className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => setChecked(e.target.checked)}
                        className="mt-1"
                      />
                      I have checked these bank details.
                    </label>
                  )}
                </>
              )}
              {error && (
                <p role="alert" className="text-sm text-red-700">
                  {error}
                </p>
              )}
              <DialogFooter>
                <Button variant="outline" disabled={busy} onClick={close}>
                  Close
                </Button>
                {selected.payment_method !== "JOMPAY" &&
                  !isBankDetailsVerified(selected) && (
                    <Button
                      disabled={busy || !checked}
                      loading={busy}
                      onClick={async () => {
                        const ok = await run(async () => {
                          await workspaceStore.dispatchDomainCommand(
                            "/api/v1/finance",
                            "verify_payee",
                            {
                              id: selected.id,
                              payment_revision: selected.payment_revision,
                            },
                          );
                          await workspaceStore.refreshDomain("/api/v1/iam");
                        });
                        if (ok) setDialog(null);
                        else setChecked(false);
                      }}
                    >
                      Mark bank details verified
                    </Button>
                  )}
              </DialogFooter>
            </div>
          )}
        </Dialog>
        <Dialog
          open={dialog === "history"}
          onOpenChange={(open) => {
            if (!open) close();
          }}
        >
          <DialogHeader>
            <DialogTitle>Payment detail history</DialogTitle>
            <DialogDescription>
              {selected?.full_name}. Account numbers are masked.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {!history.length && (
              <p className="text-sm text-muted-foreground">
                No payment detail changes recorded.
              </p>
            )}
            {history.map((change) => (
              <section
                key={change.id}
                className="border rounded-lg p-3 space-y-2"
              >
                <p className="text-sm font-medium">
                  {formatDateTime(change.created_at)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {change.actor_name || "Finance"}
                </p>
                <dl className="space-y-2">
                  {change.changed_fields.map((key) => (
                    <div key={key} className="text-sm">
                      <dt className="font-medium">
                        {paymentFieldLabels[key] || key}
                      </dt>
                      <dd className="break-all">
                        <span className="text-muted-foreground">
                          {change.old_value[key] || "Not provided"}
                        </span>{" "}
                        → {change.new_value[key] || "Not provided"}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={close}>
              Close
            </Button>
          </DialogFooter>
        </Dialog>
      </div>
    </AppLayout>
  );
}
