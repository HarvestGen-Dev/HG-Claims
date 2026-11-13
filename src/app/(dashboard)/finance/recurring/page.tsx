"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { ClaimStatusBadge } from "@/components/claims/ClaimStatusBadge";
import {
  iamClient,
  masterDataClient,
  claimsClient,
  workspaceStore,
} from "@/lib/domains";
import { formatCurrency, formatDate } from "@/lib/utils/formatters";
import type { RecurringPayment } from "@/lib/types/database";
import {
  maskBankAccountNumber,
  resolveCanonicalBank,
  validateBankAccountString,
} from "@/lib/constants/banks";
import { cn } from "@/lib/utils/cn";
import {
  User,
  Building2,
  Calendar,
  AlertCircle,
  ArrowRight,
  Sparkles,
} from "lucide-react";

const initial = {
  utility: "Monthly Allowance",
  payee_id: "",
  ministry_id: "",
  expense_category_id: "",
  amount_mode: "FIXED" as "FIXED" | "VARIABLE",
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
    return workspaceStore.subscribeDomains(
      ["finance", "claims", "iam", "master-data"],
      sync,
    );
  }, []);

  const profiles = iamClient.getProfiles();
  const teams = masterDataClient.getMinistries();
  const categories = masterDataClient.getCategories();

  const selectedPayee = profiles.find((p) => p.id === data.payee_id);
  const missingBankDetails =
    selectedPayee?.payment_method === "BANK_TRANSFER" &&
    (!resolveCanonicalBank(
      selectedPayee.bank_code || selectedPayee.bank_name,
    ) ||
      !selectedPayee.bank_account_holder_name?.trim() ||
      !validateBankAccountString(selectedPayee.bank_account_number || "")
        .valid);

  async function run(action: string, payload: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      const r = await workspaceStore.dispatchDomainCommand(
        "/api/v1/finance",
        action,
        payload,
        { skipRefresh: true },
      );
      // The command already succeeded. A refresh failure must not invite a second save.
      void workspaceStore
        .refreshDomain("/api/v1/finance", { forceFresh: true })
        .catch(() =>
          setError(
            "Changes were saved, but the list could not refresh. Reload to see them.",
          ),
        );
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

  const openNewForm = () => {
    setId(undefined);
    setData({
      ...initial,
      start_date: new Date().toLocaleDateString("en-CA", {
        timeZone: "Asia/Kuala_Lumpur",
      }),
    });
    setError("");
    setFormOpen(true);
  };

  return (
    <AppLayout>
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-foreground">
              Recurring payments
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Automate monthly claims for member bank transfers (stipends,
              allowances) and utility bills. Drafts appear 14 days before they
              are due and follow the assigned team’s approval rules after
              submission.
            </p>
          </div>
          <div className="grid w-full gap-2 sm:w-auto sm:grid-flow-col">
            <Button disabled={busy} onClick={openNewForm}>
              Add recurring bill
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={async () => {
                const r = await run("run_recurring_payments", {});
                if (r) {
                  setResult(
                    `Generated ${r.generated} draft(s) and sent ${r.reminded} reminder(s).${r.skipped_invalid_payees ? ` ${r.skipped_invalid_payees} schedule(s) need updated payment details.` : ""}`,
                  );
                }
              }}
            >
              Generate due drafts
            </Button>
          </div>
        </header>

        <p className="text-xs text-muted-foreground bg-muted/40 p-3 rounded-lg border border-border">
          Scheduling uses Asia/Kuala_Lumpur dates. Variable bills show last
          month’s amount and receive one reminder if still blank 7 days before
          due. Claims follow your church team&apos;s approval rules (Team Lead
          &amp; Finance).
        </p>

        {result && (
          <div
            role="status"
            className="flex items-center gap-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 p-3 text-sm text-emerald-800 dark:text-emerald-200"
          >
            <Sparkles className="size-4 shrink-0 text-emerald-600" />
            <span>{result}</span>
          </div>
        )}

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
              Configure recurring claims for church members (bank transfer) or
              utility providers. Each period automatically generates a claim
              subjected to team lead &amp; finance approval.
            </DialogDescription>
          </DialogHeader>

          <form
            className="space-y-5"
            onSubmit={async (e) => {
              e.preventDefault();
              if (busy || missingBankDetails) return;
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
            {/* Form Fields Container */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Recipient / Payee Selection (Full Width) */}
              <div className="space-y-1.5 sm:col-span-2">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <label
                    htmlFor="recurring-payee"
                    className="text-sm font-medium text-foreground"
                  >
                    Payee (Member or Supplier){" "}
                    <span className="text-red-500">*</span>
                  </label>
                  <Link
                    className="text-xs text-primary hover:underline"
                    href="/admin/suppliers"
                  >
                    Manage directory suppliers
                  </Link>
                </div>
                <Select
                  id="recurring-payee"
                  aria-label="Payee"
                  className="w-full"
                  value={data.payee_id}
                  onChange={(e) => {
                    const payeeId = e.target.value;
                    const p = profiles.find((prof) => prof.id === payeeId);
                    const utilities = [
                      "Unifi",
                      "Indah Water",
                      "TNB",
                      "Air Selangor",
                    ];
                    if (p?.payment_method === "JOMPAY") {
                      const utility = utilities.includes(data.utility)
                        ? data.utility
                        : "Unifi";
                      const fixed = ["Unifi", "Indah Water"].includes(utility);
                      setData({
                        ...data,
                        payee_id: payeeId,
                        utility,
                        amount_mode: fixed ? "FIXED" : "VARIABLE",
                        fixed_amount: fixed ? data.fixed_amount : "",
                      });
                    } else {
                      setData({ ...data, payee_id: payeeId });
                    }
                  }}
                  required
                >
                  <option value="">Choose member or supplier...</option>
                  <optgroup label="Members & Staff (Bank Account Transfer)">
                    {profiles
                      .filter(
                        (p) =>
                          !p.is_payee_only &&
                          p.status === "ACTIVE" &&
                          p.payment_method === "BANK_TRANSFER",
                      )
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.full_name} ({p.email}) — Bank Transfer
                        </option>
                      ))}
                  </optgroup>
                  <optgroup label="Directory Payees & Utilities">
                    {profiles
                      .filter((p) => p.is_payee_only && p.status === "ACTIVE")
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.full_name} —{" "}
                          {p.payment_method === "BANK_TRANSFER"
                            ? "Bank Transfer"
                            : `JomPAY (${p.jompay_biller_code || "Biller"})`}
                        </option>
                      ))}
                  </optgroup>
                </Select>
              </div>

              {/* Payee Details Snapshot Card (Full Width) */}
              {selectedPayee && (
                <div className="sm:col-span-2 rounded-lg border border-border bg-muted/40 p-3 text-xs space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 flex-wrap items-center gap-1.5 break-words font-semibold text-foreground">
                      {selectedPayee.is_payee_only ? (
                        <Building2 className="size-3.5 text-muted-foreground" />
                      ) : (
                        <User className="size-3.5 text-muted-foreground" />
                      )}
                      <span className="min-w-0 [overflow-wrap:anywhere]">
                        {selectedPayee.full_name}
                      </span>
                      <span className="text-[11px] font-normal text-muted-foreground">
                        (
                        {selectedPayee.is_payee_only
                          ? "Directory Payee"
                          : "Church Member / Staff"}
                        )
                      </span>
                    </div>
                    <span
                      className={cn(
                        "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium",
                        selectedPayee.payment_method === "BANK_TRANSFER"
                          ? "bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300"
                          : "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
                      )}
                    >
                      {selectedPayee.payment_method === "BANK_TRANSFER"
                        ? "Bank Account Transfer"
                        : "JomPAY"}
                    </span>
                  </div>

                  {selectedPayee.payment_method === "BANK_TRANSFER" ? (
                    <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 pt-0.5">
                      <span>
                        <strong>Bank:</strong>{" "}
                        {selectedPayee.bank_name ||
                          selectedPayee.bank_code ||
                          "Not set"}
                      </span>
                      <span>
                        <strong>Account Holder:</strong>{" "}
                        {selectedPayee.bank_account_holder_name ||
                          selectedPayee.full_name}
                      </span>
                      <span>
                        <strong>Account No:</strong>{" "}
                        {maskBankAccountNumber(
                          selectedPayee.bank_account_number || "",
                        )}
                      </span>
                    </div>
                  ) : (
                    <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 pt-0.5">
                      <span>
                        <strong>Biller:</strong>{" "}
                        {selectedPayee.jompay_biller_name} (
                        {selectedPayee.jompay_biller_code})
                      </span>
                      <span>
                        <strong>Ref 1:</strong>{" "}
                        {selectedPayee.jompay_reference_1}
                      </span>
                      {selectedPayee.jompay_reference_2 && (
                        <span>
                          <strong>Ref 2:</strong>{" "}
                          {selectedPayee.jompay_reference_2}
                        </span>
                      )}
                    </div>
                  )}
                  {missingBankDetails && (
                    <p className="text-sm text-destructive">
                      Ask this payee to complete their bank, account number and
                      account holder details before saving.
                    </p>
                  )}
                </div>
              )}

              {/* Title / Utility Field */}
              <div className="space-y-1.5">
                <label
                  htmlFor="recurring-utility"
                  className="block text-sm font-medium text-foreground"
                >
                  Payment / Bill title <span className="text-red-500">*</span>
                </label>
                {selectedPayee?.payment_method === "JOMPAY" ? (
                  <Select
                    id="recurring-utility"
                    aria-label="Utility"
                    className="w-full"
                    value={data.utility}
                    onChange={(e) => {
                      const utility = e.target.value;
                      setData({
                        ...data,
                        utility,
                        amount_mode: ["Unifi", "Indah Water"].includes(utility)
                          ? "FIXED"
                          : "VARIABLE",
                        fixed_amount: ["Unifi", "Indah Water"].includes(utility)
                          ? data.fixed_amount
                          : "",
                      });
                    }}
                  >
                    {["Unifi", "Indah Water", "TNB", "Air Selangor"].map(
                      (u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ),
                    )}
                  </Select>
                ) : (
                  <div>
                    <Input
                      id="recurring-utility"
                      aria-label="Utility"
                      list="recurring-suggestions"
                      placeholder="e.g. Monthly Staff Allowance, Rent..."
                      value={data.utility}
                      onChange={(e) =>
                        setData({ ...data, utility: e.target.value })
                      }
                      required
                    />
                    <datalist id="recurring-suggestions">
                      <option value="Monthly Staff Allowance" />
                      <option value="Monthly Pastoral Stipend" />
                      <option value="Rental Reimbursement" />
                      <option value="Telephone Subsidy" />
                      <option value="Unifi" />
                      <option value="Indah Water" />
                      <option value="TNB" />
                      <option value="Air Selangor" />
                    </datalist>
                  </div>
                )}
              </div>

              {/* Amount Mode Toggle */}
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-foreground">
                  Amount Mode <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={selectedPayee?.payment_method === "JOMPAY"}
                    onClick={() => setData({ ...data, amount_mode: "FIXED" })}
                    className={cn(
                      "flex-1 h-11 px-3 text-xs font-medium rounded-lg border transition-colors",
                      data.amount_mode === "FIXED"
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-muted/50 text-muted-foreground border-border hover:bg-muted",
                      selectedPayee?.payment_method === "JOMPAY" &&
                        "opacity-60 cursor-not-allowed",
                    )}
                  >
                    Fixed Amount
                  </button>
                  <button
                    type="button"
                    disabled={selectedPayee?.payment_method === "JOMPAY"}
                    onClick={() =>
                      setData({
                        ...data,
                        amount_mode: "VARIABLE",
                        fixed_amount: "",
                      })
                    }
                    className={cn(
                      "flex-1 h-11 px-3 text-xs font-medium rounded-lg border transition-colors",
                      data.amount_mode === "VARIABLE"
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-muted/50 text-muted-foreground border-border hover:bg-muted",
                      selectedPayee?.payment_method === "JOMPAY" &&
                        "opacity-60 cursor-not-allowed",
                    )}
                  >
                    Variable Amount
                  </button>
                </div>
              </div>

              {/* Amount Input (or Note for Variable) */}
              <div className="space-y-1.5 sm:col-span-2">
                {data.amount_mode === "FIXED" ? (
                  <div>
                    <label
                      htmlFor="recurring-fixed-amount"
                      className="block text-sm font-medium text-foreground"
                    >
                      Fixed amount (RM) <span className="text-red-500">*</span>
                    </label>
                    <Input
                      id="recurring-fixed-amount"
                      aria-label="Fixed amount (RM)"
                      type="number"
                      step="0.01"
                      min="0.01"
                      placeholder="0.00"
                      value={data.fixed_amount}
                      onChange={(e) =>
                        setData({ ...data, fixed_amount: e.target.value })
                      }
                      required
                    />
                  </div>
                ) : (
                  <div className="rounded-lg bg-muted/40 border border-border p-3 text-xs text-muted-foreground flex items-center gap-2">
                    <Calendar className="size-4 shrink-0 text-muted-foreground" />
                    <span>
                      Variable amount: Each generated monthly draft leaves
                      amount blank for Finance or claimant entry, with a
                      reminder 7 days before due date.
                    </span>
                  </div>
                )}
              </div>

              {/* Team Field */}
              <div className="space-y-1.5">
                <label
                  htmlFor="recurring-team"
                  className="block text-sm font-medium text-foreground"
                >
                  Team <span className="text-red-500">*</span>
                </label>
                <Select
                  id="recurring-team"
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
                <p className="text-[11px] text-muted-foreground">
                  Approval routes to this team&apos;s Lead and Finance.
                </p>
              </div>

              {/* Category Field */}
              <div className="space-y-1.5">
                <label
                  htmlFor="recurring-category"
                  className="block text-sm font-medium text-foreground"
                >
                  What was it?
                </label>
                <Select
                  id="recurring-category"
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
              </div>

              {/* Due day of month */}
              <div className="space-y-1.5">
                <label
                  htmlFor="recurring-due-day"
                  className="block text-sm font-medium text-foreground"
                >
                  Due day of month <span className="text-red-500">*</span>
                </label>
                <Input
                  id="recurring-due-day"
                  aria-label="Due day of month"
                  type="number"
                  min="1"
                  max="31"
                  value={data.due_day}
                  onChange={(e) =>
                    setData({ ...data, due_day: e.target.value })
                  }
                  required
                />
                <span className="text-xs text-muted-foreground block">
                  Days beyond month end use its final day.
                </span>
              </div>

              <div className="grid min-w-0 gap-4 sm:col-span-2 sm:grid-cols-2">
                {/* Start Date */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="recurring-start-date"
                    className="block text-sm font-medium text-foreground"
                  >
                    Start date <span className="text-red-500">*</span>
                  </label>
                  <Input
                    id="recurring-start-date"
                    aria-label="Start date"
                    type="date"
                    value={data.start_date}
                    onChange={(e) =>
                      setData({ ...data, start_date: e.target.value })
                    }
                    required
                  />
                </div>

                {/* End Date */}
                <div className="min-w-0 space-y-1.5">
                  <label
                    htmlFor="recurring-end-date"
                    className="block text-sm font-medium text-foreground"
                  >
                    End date (optional)
                  </label>
                  <Input
                    id="recurring-end-date"
                    aria-label="End date (optional)"
                    type="date"
                    min={data.start_date || undefined}
                    value={data.end_date}
                    onChange={(e) =>
                      setData({ ...data, end_date: e.target.value })
                    }
                  />
                </div>
              </div>
            </div>

            {/* Active Toggle */}
            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="recurring-active"
                checked={data.is_active}
                onChange={(e) =>
                  setData({ ...data, is_active: e.target.checked })
                }
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
              />
              <label
                htmlFor="recurring-active"
                className="text-sm font-medium text-foreground cursor-pointer"
              >
                Active recurring schedule
              </label>
            </div>

            {error && (
              <div
                role="alert"
                className="rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 p-3 text-sm text-red-700 dark:text-red-300 flex items-center gap-2"
              >
                <AlertCircle className="size-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <DialogFooter className="mt-6 grid grid-cols-1 gap-2 sm:flex">
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
              <Button
                className="row-start-1 sm:row-auto"
                loading={busy}
                disabled={missingBankDetails}
              >
                Save recurring bill
              </Button>
            </DialogFooter>
          </form>
        </Dialog>

        {!formOpen && error && (
          <p role="alert" className="text-red-700 text-sm">
            {error}
          </p>
        )}

        {/* Recurring Schedules List */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">
            Configured recurring schedules
          </h2>
          <ul className="divide-y rounded-lg border bg-card">
            {!schedules.length && (
              <li className="p-4 text-sm text-muted-foreground text-center">
                No recurring bills configured. Click &quot;Add recurring
                bill&quot; to set up member allowances or utility bills.
              </li>
            )}
            {schedules.map((s) => {
              const prof = profiles.find((p) => p.id === s.payee_id);
              const isBankTransfer = prof?.payment_method === "BANK_TRANSFER";
              const isMember = prof && !prof.is_payee_only;
              return (
                <li
                  key={s.id}
                  className="grid min-w-0 gap-3 p-3 transition-colors hover:bg-muted/30 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-4"
                >
                  <div className="min-w-0 space-y-1 break-words">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-foreground">{s.utility}</p>
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
                          s.is_active
                            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
                            : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
                        )}
                      >
                        {s.is_active ? "Active" : "Inactive"}
                      </span>
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
                          isBankTransfer
                            ? "bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300"
                            : "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
                        )}
                      >
                        {isBankTransfer ? "Bank Transfer" : "JomPAY"}
                      </span>
                      {isMember && (
                        <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">
                          Member / Staff
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {s.amount_mode === "FIXED"
                        ? Number(s.fixed_amount) > 0
                          ? formatCurrency(s.fixed_amount)
                          : "Fixed amount needed"
                        : "Variable amount"}{" "}
                      · Due day {s.due_day} of each month
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Recipient:{" "}
                      <strong>{prof?.full_name || "Saved payee"}</strong> ·
                      Team:{" "}
                      {teams.find((t) => t.id === s.ministry_id)?.name ||
                        "Team"}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => edit(s)}>
                      Edit
                    </Button>
                    {s.is_active && (
                      <Button
                        variant="ghost"
                        size="sm"
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
              );
            })}
          </ul>
        </section>

        {/* Generated Bills & Claims Section */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">
              Generated bills &amp; claims
            </h2>
            <span className="text-xs text-muted-foreground">
              Subject to Team Lead &amp; Finance approval
            </span>
          </div>

          <ul className="divide-y border rounded-lg bg-card">
            {!claims.filter((c) => c.recurring_schedule_id).length && (
              <li className="p-4 text-sm text-muted-foreground text-center">
                No bills have been generated yet. Due bills generate 14 days in
                advance.
              </li>
            )}
            {claims
              .filter((c) => c.recurring_schedule_id)
              .map((c) => (
                <li
                  key={c.id}
                  className="grid min-w-0 gap-3 p-3 transition-colors hover:bg-muted/30 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-4"
                >
                  <div className="min-w-0 space-y-1 break-words">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <Link
                        href={`/claims/${c.id}`}
                        className="flex min-w-0 max-w-full items-center gap-1.5 font-medium text-foreground hover:underline"
                      >
                        <span className="min-w-0 [overflow-wrap:anywhere]">
                          {c.purpose || "Recurring payment"}
                        </span>
                        <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
                      </Link>
                      <time
                        dateTime={c.recurring_due_date || undefined}
                        className="whitespace-nowrap text-xs text-muted-foreground"
                      >
                        Due {formatDate(c.recurring_due_date)}
                      </time>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Claimant / Payee: <strong>{c.claimant_name}</strong> ·{" "}
                      {c.payee_payment_method === "BANK_TRANSFER"
                        ? `Bank Transfer (${c.bank_name || "Bank"})`
                        : "JomPAY"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    <ClaimStatusBadge status={c.status} />
                    <span className="text-sm font-semibold text-foreground tabular-nums">
                      {c.total_amount
                        ? formatCurrency(c.total_amount)
                        : "Amount needed"}
                    </span>
                    <Link
                      className={cn(
                        buttonVariants({
                          variant: c.status === "DRAFT" ? "default" : "outline",
                          size: "sm",
                        }),
                      )}
                      href={
                        c.status === "DRAFT"
                          ? `/claims/${c.id}/edit`
                          : `/claims/${c.id}`
                      }
                    >
                      {c.status === "DRAFT" ? "Review & Submit" : "View"}
                    </Link>
                  </div>
                </li>
              ))}
          </ul>
        </section>
      </div>
    </AppLayout>
  );
}
