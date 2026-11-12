"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ClaimStatusBadge } from "@/components/claims/ClaimStatusBadge";
import {
  iamClient,
  masterDataClient,
  claimsClient,
  workspaceStore,
} from "@/lib/domains";
import { formatCurrency } from "@/lib/utils/formatters";
import type { RecurringPayment } from "@/lib/types/database";
import { maskBankAccountNumber } from "@/lib/constants/banks";
const initial = {
  utility: "Unifi" as RecurringPayment["utility"],
  payee_id: "",
  ministry_id: "",
  expense_category_id: "",
  amount_mode: "FIXED",
  fixed_amount: "",
  due_day: "1",
  start_date: new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Kuala_Lumpur",
  }),
  end_date: "",
  is_active: true,
};
export default function RecurringPage() {
  const [schedules, setSchedules] = useState(
    workspaceStore.getState().recurringPayments,
  );
  const [claims, setClaims] = useState(claimsClient.getClaims());
  const [data, setData] = useState(initial);
  const [id, setId] = useState<string>();
  const [formOpen, setFormOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  useEffect(() => {
    const sync = () => {
      setSchedules(workspaceStore.getState().recurringPayments);
      setClaims(claimsClient.getClaims());
    };
    void workspaceStore
      .refreshDomain("/api/v1/finance")
      .catch(() =>
        setError("Unable to refresh recurring bills. Please reload the page."),
      );
    return workspaceStore.subscribeDomains(["finance", "claims"], sync);
  }, []);
  const profiles = iamClient.getProfiles();
  const teams = masterDataClient.getMinistries();
  const categories = masterDataClient.getCategories();
  async function run(action: string, payload: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      const r = await workspaceStore.dispatchDomainCommand(
        "/api/v1/finance",
        action,
        payload,
      );
      await workspaceStore.refreshDomain("/api/v1/claims");
      return r;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save.");
      return null;
    } finally {
      setBusy(false);
    }
  }
  function edit(s: RecurringPayment) {
    setFormOpen(true);
    setError("");
    setId(s.id);
    setData({
      utility: s.utility,
      payee_id: s.payee_id,
      ministry_id: s.ministry_id,
      expense_category_id: s.expense_category_id,
      amount_mode: s.amount_mode,
      fixed_amount: s.fixed_amount == null ? "" : String(s.fixed_amount),
      due_day: String(s.due_day),
      start_date: s.start_date,
      end_date: s.end_date || "",
      is_active: s.is_active,
    });
  }
  return (
    <AppLayout>
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <header className="flex flex-wrap justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Recurring utility bills</h1>
            <p className="text-sm text-muted-foreground">
              Drafts appear 14 days before the due date. Finance reviews and
              submits each bill.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => {
                setId(undefined);
                setData({
                  ...initial,
                  start_date: new Date().toLocaleDateString("en-CA", {
                    timeZone: "Asia/Kuala_Lumpur",
                  }),
                });
                setError("");
                setFormOpen(true);
              }}
            >
              Add recurring bill
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={async () => {
                const r = await run("run_recurring_payments", {});
                if (r)
                  setResult(
                    `Generated ${r.generated} draft(s); ${r.reminded} reminder(s).`,
                  );
              }}
            >
              Generate due drafts
            </Button>
          </div>
        </header>
        <p className="text-sm text-muted-foreground">
          Scheduling uses Asia/Kuala_Lumpur dates. Variable bills show last
          month’s amount and receive one reminder if still blank 7 days before
          due.
        </p>
        {result && <p role="status">{result}</p>}
        <Dialog
          open={formOpen}
          onOpenChange={(open) => {
            if (!busy) setFormOpen(open);
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {id ? "Edit recurring bill" : "Configure recurring bill"}
            </DialogTitle>
            <DialogDescription>
              Changes apply to future drafts. Existing bills keep their saved
              payment details and amounts.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              const r = await run("save_recurring_payment", {
                id,
                ...data,
                fixed_amount:
                  data.amount_mode === "FIXED" ? data.fixed_amount : null,
                expense_category_id: data.expense_category_id || undefined,
                end_date: data.end_date || null,
              });
              if (r) {
                setId(undefined);
                setData(initial);
                setFormOpen(false);
              }
            }}
          >
            <div className="grid sm:grid-cols-2 gap-4">
              <label>
                Utility
                <Select
                  aria-label="Utility"
                  className="w-full"
                  value={data.utility}
                  onChange={(e) => {
                    const utility = e.target
                      .value as RecurringPayment["utility"];
                    setData({
                      ...data,
                      utility,
                      payee_id: "",
                      amount_mode: ["Unifi", "Indah Water"].includes(utility)
                        ? "FIXED"
                        : "VARIABLE",
                      fixed_amount: "",
                    });
                  }}
                >
                  {["Unifi", "Indah Water", "TNB", "Air Selangor"].map((u) => (
                    <option key={u}>{u}</option>
                  ))}
                </Select>
              </label>
              <label>
                Payee (Bank Transfer or JomPAY)
                <Select
                  aria-label="Payee"
                  className="w-full"
                  value={data.payee_id}
                  onChange={(e) =>
                    setData({ ...data, payee_id: e.target.value })
                  }
                  required
                >
                  <option value="">Choose payee</option>
                  {profiles
                    .filter(
                      (p) =>
                        p.is_payee_only &&
                        (p.payment_method === "JOMPAY" ||
                          p.payment_method === "BANK_TRANSFER") &&
                        p.status === "ACTIVE",
                    )
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.full_name} ({p.payment_method === "BANK_TRANSFER" ? "Bank Transfer" : "JomPAY"})
                      </option>
                    ))}
                </Select>
                <Link className="text-sm underline" href="/admin/suppliers">
                  Manage payees
                </Link>
              </label>
              {data.payee_id && (() => {
                const p = profiles.find((prof) => prof.id === data.payee_id);
                if (!p) return null;
                return (
                  <div className="sm:col-span-2 rounded-lg bg-muted/40 p-3 text-xs space-y-1">
                    <p className="font-semibold text-zinc-900 dark:text-zinc-100">
                      Payment method: {p.payment_method === "BANK_TRANSFER" ? "Bank Account Transfer" : "JomPAY"}
                    </p>
                    {p.payment_method === "BANK_TRANSFER" ? (
                      <p className="text-muted-foreground">
                        {p.bank_name || p.bank_code} · {p.bank_account_holder_name} · {maskBankAccountNumber(p.bank_account_number || "")}
                      </p>
                    ) : (
                      <p className="text-muted-foreground">
                        Biller: {p.jompay_biller_name} ({p.jompay_biller_code}) · Ref 1: {p.jompay_reference_1}
                      </p>
                    )}
                  </div>
                );
              })()}
              <label>
                Team
                <Select
                  aria-label="Team"
                  className="w-full"
                  value={data.ministry_id}
                  onChange={(e) =>
                    setData({ ...data, ministry_id: e.target.value })
                  }
                  required
                >
                  <option value="">Choose Team</option>
                  {teams
                    .filter((t) => t.is_active)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                </Select>
              </label>
              <label>
                What was it?
                <Select
                  aria-label="What was it?"
                  className="w-full"
                  value={data.expense_category_id}
                  onChange={(e) =>
                    setData({ ...data, expense_category_id: e.target.value })
                  }
                >
                  <option value="">Utilities (default)</option>
                  {categories
                    .filter((c) => c.is_active && c.code.startsWith("V2_"))
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </Select>
              </label>
              {data.amount_mode === "FIXED" ? (
                <label>
                  Fixed amount (RM)
                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={data.fixed_amount}
                    onChange={(e) =>
                      setData({ ...data, fixed_amount: e.target.value })
                    }
                    required
                  />
                </label>
              ) : (
                <p className="text-sm self-center">
                  Variable amount — enter the new amount on each generated
                  draft.
                </p>
              )}
              <label>
                Due day of month
                <Input
                  type="number"
                  min="1"
                  max="31"
                  value={data.due_day}
                  onChange={(e) =>
                    setData({ ...data, due_day: e.target.value })
                  }
                  required
                />
                <span className="text-xs text-muted-foreground">
                  Days beyond month end use its final day.
                </span>
              </label>
              <label>
                Start date
                <Input
                  type="date"
                  value={data.start_date}
                  onChange={(e) =>
                    setData({ ...data, start_date: e.target.value })
                  }
                  required
                />
              </label>
              <label>
                End date (optional)
                <Input
                  type="date"
                  value={data.end_date}
                  onChange={(e) =>
                    setData({ ...data, end_date: e.target.value })
                  }
                />
              </label>
            </div>
            <label className="flex gap-2">
              <input
                type="checkbox"
                checked={data.is_active}
                onChange={(e) =>
                  setData({ ...data, is_active: e.target.checked })
                }
              />
              Active
            </label>
            <div className="flex gap-2">
              <Button loading={busy}>Save recurring bill</Button>
              {
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    setId(undefined);
                    setData(initial);
                    setFormOpen(false);
                  }}
                >
                  Cancel
                </Button>
              }
            </div>
            {error && (
              <p role="alert" className="text-sm text-red-700">
                {error}
              </p>
            )}
          </form>
        </Dialog>
        {!formOpen && error && (
          <p role="alert" className="text-red-700 text-sm">
            {error}
          </p>
        )}
        <ul className="divide-y rounded-lg border">
          {!schedules.length && (
            <li className="p-4 text-sm text-muted-foreground">
              No recurring bills configured. Add one of the four supported
              utilities to get started.
            </li>
          )}
          {schedules.map((s) => (
            <li key={s.id} className="p-4 flex flex-wrap justify-between gap-3">
              <div>
                <p className="font-medium">
                  {s.utility} · {s.is_active ? "Active" : "Inactive"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {s.amount_mode === "FIXED"
                    ? Number(s.fixed_amount) > 0
                      ? formatCurrency(s.fixed_amount)
                      : "Fixed amount needed"
                    : "Variable amount"}{" "}
                  · Due day {s.due_day}
                </p>
                <p className="text-sm text-muted-foreground">
                  {(() => {
                    const prof = profiles.find((p) => p.id === s.payee_id);
                    const method = prof?.payment_method === "BANK_TRANSFER" ? "Bank Transfer" : "JomPAY";
                    return `${prof?.full_name || "Saved payee"} (${method})`;
                  })()}{" "}
                  · {teams.find((t) => t.id === s.ministry_id)?.name || "Team"}
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => edit(s)}>
                  Edit
                </Button>
                {s.is_active && (
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() =>
                      void run("deactivate_recurring_payment", { id: s.id })
                    }
                  >
                    Deactivate
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
        <section>
          <h2 className="font-semibold mb-3">Generated bills</h2>
          <ul className="divide-y border rounded-lg">
            {claims
              .filter((c) => c.recurring_schedule_id)
              .map((c) => (
                <li
                  key={c.id}
                  className="p-4 flex flex-wrap justify-between gap-3"
                >
                  <Link href={`/claims/${c.id}`} className="underline">
                    {c.purpose} · Due {c.recurring_due_date}
                  </Link>
                  <ClaimStatusBadge status={c.status} />
                  <span>
                    {c.total_amount
                      ? formatCurrency(c.total_amount)
                      : "Amount needed"}
                  </span>
                </li>
              ))}
          </ul>
        </section>
      </div>
    </AppLayout>
  );
}
