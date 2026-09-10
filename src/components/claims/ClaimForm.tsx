"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  FileText,
  Send,
  Save,
  ArrowLeft,
  AlertCircle,
  HelpCircle,
  Lock,
  UserCheck,
  Building2,
  Receipt
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { ExpenseItemsEditor, ExpenseItemDraft } from "./ExpenseItemsEditor";
import { useAuth } from "@/lib/auth/context";
import { db } from "@/lib/data/repository";
import { Claim, Ministry, ExpenseCategory, CostCentre } from "@/lib/types/database";
import { Dialog, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/utils/formatters";
import { showToast } from "@/lib/utils/toast";


interface ClaimFormProps {
  initialClaim?: Claim | null;
  isEditMode?: boolean;
}

export function ClaimForm({ initialClaim, isEditMode = false }: ClaimFormProps) {
  const router = useRouter();
  const { user } = useAuth();

  const ministries = db.getMinistries();
  const categories = db.getCategories();
  const costCentres = db.getCostCentres();
  const formConfig = db.getSetting("claim_form_config") || {
    declaration_text: "I confirm that these expenses were incurred for legitimate church ministry purposes in accordance with NewLife Community Church financial policies, have not previously been claimed or reimbursed from any other source, and are supported by the authentic receipts and documents provided.",
    allow_claimant_change_ministry: true,
    require_vendor_name: false,
    require_receipt_for_all_expenses: true,
    enable_internal_reference: true,
    form_guidance_banner: "Please ensure each receipt card has an attached receipt file and cost centre before submitting for approval.",
    max_file_size_mb: 10,
    max_attachment_count: 15,
  };

  const today = new Date().toISOString().split("T")[0];

  // 01: Claimant Details State
  const [claimantName, setClaimantName] = useState(
    initialClaim?.claimant_name || initialClaim?.claimant?.full_name || user?.full_name || ""
  );
  const [claimantEmail, setClaimantEmail] = useState(
    initialClaim?.claimant_email || initialClaim?.claimant?.email || user?.email || ""
  );
  const [claimantPhone, setClaimantPhone] = useState(
    initialClaim?.claimant_phone || initialClaim?.claimant?.phone || user?.phone || "+60 12-345 6789"
  );

  // 02: Claim Details State
  const [ministryId, setMinistryId] = useState(
    initialClaim?.ministry_id || user?.ministry_id || ministries[0]?.id || ""
  );
  const [claimDate, setClaimDate] = useState(initialClaim?.claim_date || today);
  const [purpose, setPurpose] = useState(initialClaim?.purpose || "");
  const [internalRef, setInternalRef] = useState(initialClaim?.internal_reference || "");

  // 03: Receipts State
  const defaultCostCentre = costCentres[0]?.id || "";
  const [expenses, setExpenses] = useState<ExpenseItemDraft[]>(
    initialClaim?.expenses && initialClaim.expenses.length > 0
      ? initialClaim.expenses.map((e) => {
          const matchingAttachment = (initialClaim.attachments || []).find(
            (a) => a.expense_id === e.id
          );
          return {
            id: e.id,
            temp_id: crypto.randomUUID(),
            expense_date: e.expense_date,
            expense_category_id: e.expense_category_id,
            cost_centre_id: e.cost_centre_id || initialClaim.cost_centre_id || defaultCostCentre,
            vendor: e.vendor || "",
            description: e.description,
            amount: e.amount,
            notes: e.notes || "",
            sort_order: e.sort_order,
            attachment: matchingAttachment
              ? {
                  id: matchingAttachment.id,
                  expense_id: e.id,
                  original_filename: matchingAttachment.original_filename,
                  file_size: matchingAttachment.file_size,
                  mime_type: matchingAttachment.mime_type,
                  storage_path: matchingAttachment.storage_path,
                  file_category: matchingAttachment.file_category,
                  uploaded_by: matchingAttachment.uploaded_by,
                  signed_url: matchingAttachment.signed_url,
                }
              : null,
          };
        })
      : [
          {
            temp_id: crypto.randomUUID(),
            expense_date: today,
            expense_category_id: categories[0]?.id || "",
            cost_centre_id: defaultCostCentre,
            vendor: "",
            description: "",
            amount: "",
            notes: "",
            sort_order: 1,
            attachment: null,
          },
        ]
  );

  // 04: Declaration State
  const [declarationAccepted, setDeclarationAccepted] = useState(
    initialClaim?.declaration_accepted || false
  );

  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const [dirty, setDirty] = useState(false);
  const [leaveHref, setLeaveHref] = useState<string | null>(null);
  const requestKey = useRef<string>();
  if (!requestKey.current && typeof window !== "undefined") requestKey.current = crypto.randomUUID();

  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const navigate = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element).closest<HTMLAnchorElement>("a[href]");
      if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
      const destination = new URL(link.href);
      if (destination.origin !== location.origin || destination.href === location.href || destination.hash) return;
      event.preventDefault();
      event.stopPropagation();
      setLeaveHref(destination.pathname + destination.search);
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", navigate, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", navigate, true);
    };
  }, [dirty]);

  useEffect(() => {
    if (error) {
      errorRef.current?.focus();
      errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [error]);

  const handleFillMyDetails = () => {
    if (user) {
      setClaimantName(user.full_name);
      setClaimantEmail(user.email);
      setClaimantPhone(user.phone || "+60 12-345 6789");
      setDirty(true);
    }
  };

  const validate = (): string | null => {
    if (!claimantName.trim()) return "Please enter the claimant full name.";
    if (!claimantEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(claimantEmail.trim())) {
      return "Please enter a valid claimant email address.";
    }
    if (!claimantPhone.trim()) return "Please enter the claimant phone number.";
    if (!ministryId) return "Please select a ministry / department.";
    if (!claimDate) return "Please select the claim date.";
    if (!purpose.trim()) return "Please provide the ministry purpose and justification.";

    if (expenses.length === 0) return "Please add at least one receipt.";

    for (let i = 0; i < expenses.length; i++) {
      const e = expenses[i];
      if (!e.expense_date) return `Receipt #${i + 1}: Date is required.`;
      if (!e.expense_category_id) return `Receipt #${i + 1}: Category is required.`;
      if (!e.cost_centre_id) return `Receipt #${i + 1}: Cost centre is required.`;
      if (!e.description.trim()) return `Receipt #${i + 1}: Item description is required.`;
      const amt = typeof e.amount === "string" ? parseFloat(e.amount) : e.amount;
      if (isNaN(amt) || amt <= 0) return `Receipt #${i + 1}: Please enter a valid positive amount.`;
      if (formConfig.require_vendor_name && !e.vendor?.trim()) {
        return `Receipt #${i + 1}: Vendor / merchant name is required by church policy.`;
      }
      if (formConfig.require_receipt_for_all_expenses && !e.attachment) {
        return `Receipt #${i + 1}: Please upload the supporting receipt file.`;
      }
    }

    return null;
  };

  const gatherAttachments = () => {
    const atts: any[] = [];
    expenses.forEach((e) => {
      if (e.attachment) {
        atts.push({
          ...e.attachment,
          temp_id: e.temp_id,
          expense_temp_id: e.temp_id,
          expense_id: e.id || e.temp_id || null,
        });
      }
    });
    return atts;
  };

  const handleSaveDraft = async () => {
    setIsSavingDraft(true);
    setError(null);
    try {
      const validExpenses = expenses.filter((e) => e.description.trim() || e.amount);
      const claimData = {
        id: isEditMode && initialClaim?.id ? initialClaim.id : undefined,
        submitted_by_user_id: user?.id || "u-sarah-02",
        claimant_id: initialClaim?.claimant_id || user?.id || "u-sarah-02",
        claimant_name: claimantName.trim() || user?.full_name || "Unknown Claimant",
        claimant_email: claimantEmail.trim() || user?.email || "",
        claimant_phone: claimantPhone.trim() || user?.phone || "",
        ministry_id: ministryId,
        claim_date: claimDate,
        purpose: purpose || "Draft expense claim",
        internal_reference: internalRef || undefined,
        expenses: validExpenses.map((e, idx) => ({
          id: e.id,
          temp_id: e.temp_id,
          expense_date: e.expense_date,
          expense_category_id: e.expense_category_id,
          cost_centre_id: e.cost_centre_id,
          vendor: e.vendor || undefined,
          description: e.description || "Draft receipt",
          amount: typeof e.amount === "string" ? parseFloat(e.amount) || 0 : e.amount || 0,
          notes: e.notes || undefined,
          sort_order: idx + 1,
          attachment: e.attachment
            ? {
                ...e.attachment,
                temp_id: e.temp_id,
                expense_temp_id: e.temp_id,
                expense_id: e.id || e.temp_id || null,
              }
            : undefined,
        })),
        attachments: gatherAttachments(),
      };

      const savedClaim = await db.saveClaimDraft({
        ...claimData,
        version: initialClaim?.version,
        request_key: requestKey.current,
      });
      setDirty(false);
      showToast.flashSuccess(
        isEditMode ? "Changes have been saved to the draft." : "Claim draft saved successfully.",
        "Draft Saved"
      );
      router.push(`/claims/${savedClaim.id}`);
    } catch (err: any) {
      setError(err?.message || "Failed to save draft.");
    } finally {
      setIsSavingDraft(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    if (!declarationAccepted) {
      setError("You must acknowledge and accept the confirmation declaration before submitting.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const claimData = {
        id: isEditMode && initialClaim?.id ? initialClaim.id : undefined,
        submitted_by_user_id: user?.id || "u-sarah-02",
        claimant_id: initialClaim?.claimant_id || user?.id || "u-sarah-02",
        claimant_name: claimantName.trim(),
        claimant_email: claimantEmail.trim(),
        claimant_phone: claimantPhone.trim(),
        ministry_id: ministryId,
        claim_date: claimDate,
        purpose: purpose.trim(),
        internal_reference: internalRef.trim() || undefined,
        declaration_accepted: true,
        expenses: expenses.map((e, idx) => ({
          id: e.id,
          temp_id: e.temp_id,
          expense_date: e.expense_date,
          expense_category_id: e.expense_category_id,
          cost_centre_id: e.cost_centre_id,
          vendor: e.vendor || undefined,
          description: e.description.trim(),
          amount: typeof e.amount === "string" ? parseFloat(e.amount) : e.amount,
          notes: e.notes || undefined,
          sort_order: idx + 1,
          attachment: e.attachment
            ? {
                ...e.attachment,
                temp_id: e.temp_id,
                expense_temp_id: e.temp_id,
                expense_id: e.id || e.temp_id || null,
              }
            : undefined,
        })),
        attachments: gatherAttachments(),
      };

      const submitted = await db.submitClaim({
        ...claimData,
        version: initialClaim?.version,
        request_key: requestKey.current,
      });
      setDirty(false);
      showToast.flashSuccess(
        isEditMode ? "Changes have been made and submitted for review." : "Claim has been submitted successfully.",
        "Claim Submitted"
      );
      router.push(`/claims/${submitted.id}`);
    } catch (err: any) {
      setError(err?.message || "Failed to submit expense claim.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const totalAmount = expenses.reduce((sum, item) => {
    const val = typeof item.amount === "string" ? parseFloat(item.amount) : item.amount;
    return isNaN(val) ? sum : sum + val;
  }, 0);

  return (
    <form
      onChangeCapture={() => setDirty(true)}
      onSubmit={handleSubmit}
      className="claim-form space-y-6 max-w-4xl mx-auto pb-12"
    >
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-zinc-200/80 dark:border-zinc-800">
        <div className="flex items-center gap-3">
          <Link href="/claims">
            <Button
              type="button"
              variant="ghost"
              aria-label="Back to claims"
              size="sm"
              className="h-8 w-8 p-0 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
              {isEditMode ? `Edit Claim ${initialClaim?.claim_number || ""}` : "New Expense Claim"}
            </h1>
            <p className="text-xs text-zinc-500">
              {initialClaim?.claim_number || "Ministry head expense reimbursement submission"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleSaveDraft}
            disabled={isSavingDraft || isSubmitting}
            className="h-8 text-xs border-zinc-200 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 gap-1.5"
          >
            <Save className="w-3.5 h-3.5 text-zinc-400" />
            <span>{isSavingDraft ? "Saving..." : "Save Draft"}</span>
          </Button>

          <Button
            type="submit"
            size="sm"
            disabled={isSubmitting || isSavingDraft}
            className="h-8 text-xs bg-emerald-700 hover:bg-emerald-800 text-white font-medium shadow-2xs gap-1.5"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{isSubmitting ? "Submitting..." : "Submit Claim"}</span>
          </Button>
        </div>
      </div>

      {/* Admin Guidance Banner */}
      {formConfig.form_guidance_banner && (
        <div className="p-3 rounded-lg bg-zinc-50 border border-zinc-200/80 text-zinc-700 text-xs flex items-center gap-2.5 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-300">
          <HelpCircle className="w-4 h-4 text-zinc-400 shrink-0" />
          <span>{formConfig.form_guidance_banner}</span>
        </div>
      )}

      {error && (
        <Alert ref={errorRef} tabIndex={-1} variant="destructive" className="text-xs">
          <AlertCircle className="w-4 h-4" />
          <AlertTitle className="text-xs font-semibold">Please check your submission</AlertTitle>
          <AlertDescription className="text-xs">{error}</AlertDescription>
        </Alert>
      )}

      {/* SECTION 01: Claimant Details */}
      <Card className="claim-section border border-zinc-200/80 dark:border-zinc-800 shadow-2xs">
        <CardHeader className="py-3 px-4 border-b border-zinc-100 dark:border-zinc-800/80">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] font-bold text-zinc-400">01</span>
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
                Claimant Details
              </CardTitle>
            </div>
            <button
              type="button"
              onClick={handleFillMyDetails}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 hover:text-emerald-800 hover:underline dark:text-emerald-400"
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>Fill my details (Self-claim)</span>
            </button>
          </div>
        </CardHeader>
        <CardContent className="p-4 space-y-4">
          {/* Submitter Context Banner */}
          <div className="p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/60 dark:border-zinc-800 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2 text-zinc-600 dark:text-zinc-300">
              <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
                Submitted By:
              </span>
              <span className="font-medium text-zinc-900 dark:text-zinc-100">
                {user?.full_name || "Ministry Head"}
              </span>
              <span className="text-[10px] text-zinc-400">({user?.email})</span>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-200/70 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
              Ministry Submitter
            </span>
          </div>

          {/* Claimant Snapshot Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="space-y-1">
              <label htmlFor="claimantName" className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
                Claimant Full Name *
              </label>
              <Input
                type="text"
                id="claimantName"
                placeholder="e.g. Sarah Lim"
                value={claimantName}
                onChange={(e) => setClaimantName(e.target.value)}
                className="h-8 text-xs bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800"
                required
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="claimantEmail" className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
                Claimant Email *
              </label>
              <Input
                type="email"
                id="claimantEmail"
                placeholder="e.g. sarah.lim@example.com"
                value={claimantEmail}
                onChange={(e) => setClaimantEmail(e.target.value)}
                className="h-8 text-xs bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800"
                required
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="claimantPhone" className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
                Claimant Phone *
              </label>
              <Input
                type="tel"
                id="claimantPhone"
                placeholder="e.g. +60 12-345 6789"
                value={claimantPhone}
                onChange={(e) => setClaimantPhone(e.target.value)}
                className="h-8 text-xs bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 font-mono"
                required
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* SECTION 02: Claim Details */}
      <Card className="claim-section border border-zinc-200/80 dark:border-zinc-800 shadow-2xs">
        <CardHeader className="py-3 px-4 border-b border-zinc-100 dark:border-zinc-800/80">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] font-bold text-zinc-400">02</span>
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
              Claim Details
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            {/* Ministry */}
            <div className="space-y-1">
              <label htmlFor="ministryId" className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider flex items-center justify-between">
                <span>Ministry / Department *</span>
                {!formConfig.allow_claimant_change_ministry && (
                  <span className="text-[10px] text-zinc-400 flex items-center gap-0.5">
                    <Lock className="w-2.5 h-2.5" /> Locked
                  </span>
                )}
              </label>
              <select
                id="ministryId"
                value={ministryId}
                onChange={(e) => setMinistryId(e.target.value)}
                disabled={!formConfig.allow_claimant_change_ministry}
                className="flex h-8 w-full rounded-lg border border-zinc-200 bg-white px-2.5 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-900 disabled:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                required
              >
                {ministries.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Claim Date */}
            <div className="space-y-1">
              <label htmlFor="claimDate" className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
                Submission Date *
              </label>
              <Input
                type="date"
                id="claimDate"
                value={claimDate}
                onChange={(e) => setClaimDate(e.target.value)}
                className="h-8 text-xs bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 font-mono"
                required
              />
            </div>

            {/* Internal Reference */}
            {formConfig.enable_internal_reference !== false && (
              <div className="space-y-1">
                <label htmlFor="internalRef" className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
                  Reference Code (Optional)
                </label>
                <Input
                  type="text"
                  placeholder="e.g. YC-2026-SETUP"
                  id="internalRef"
                  value={internalRef}
                  onChange={(e) => setInternalRef(e.target.value)}
                  className="h-8 text-xs bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 font-mono"
                />
              </div>
            )}

            {/* Ministry Purpose */}
            <div className="col-span-1 sm:col-span-3 space-y-1">
              <label htmlFor="purpose" className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
                Ministry Purpose / Justification *
              </label>
              <Textarea
                rows={2}
                placeholder="Explain the church ministry purpose and justification for these expenses..."
                id="purpose"
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                className="text-xs bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 resize-y"
                required
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* SECTION 03: Receipts */}
      <Card className="claim-section border border-zinc-200/80 dark:border-zinc-800 shadow-2xs">
        <CardHeader className="py-3 px-4 border-b border-zinc-100 dark:border-zinc-800/80">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] font-bold text-zinc-400">03</span>
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
              Receipts
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          <ExpenseItemsEditor
            expenses={expenses}
            categories={categories}
            costCentres={costCentres}
            ministryId={ministryId}
            userId={user?.id || "u-sarah-02"}
            maxFileSizeMb={formConfig.max_file_size_mb}
            onChange={(items) => {
              setExpenses(items);
              setDirty(true);
            }}
          />
        </CardContent>
      </Card>

      {/* SECTION 04: Declaration */}
      <Card className="claim-section border border-zinc-200/80 bg-zinc-50/50 dark:border-zinc-800 dark:bg-zinc-900/30 shadow-2xs">
        <CardHeader className="py-3 px-4 border-b border-zinc-100 dark:border-zinc-800/80">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] font-bold text-zinc-400">04</span>
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
                Declaration
              </CardTitle>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-zinc-500">Claim Total:</span>
              <strong className="font-mono text-sm text-emerald-700 dark:text-emerald-400">
                {formatCurrency(totalAmount)}
              </strong>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4 space-y-4">
          <label className="flex items-start gap-3 text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={declarationAccepted}
              onChange={(e) => setDeclarationAccepted(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-emerald-700 focus:ring-emerald-600 accent-emerald-700"
              required
            />
            <span className="leading-relaxed">
              <strong className="text-zinc-900 dark:text-zinc-100">Declaration: </strong>
              {formConfig.declaration_text ||
                "These expenses were incurred for legitimate church ministry purposes, have not previously been claimed, and are supported by authentic receipts."}
            </span>
          </label>

          <div className="claim-actions flex items-center justify-between border-t border-zinc-200/80 dark:border-zinc-800 pt-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleSaveDraft}
              disabled={isSavingDraft || isSubmitting}
              className="h-8 text-xs border-zinc-200 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 gap-1.5"
            >
              <Save className="w-3.5 h-3.5 text-zinc-400" />
              <span>{isSavingDraft ? "Saving..." : "Save Draft"}</span>
            </Button>

            <Button
              type="submit"
              size="sm"
              disabled={isSubmitting || isSavingDraft || !declarationAccepted}
              className="h-8 text-xs bg-emerald-700 hover:bg-emerald-800 text-white font-medium px-5 shadow-2xs gap-1.5"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{isSubmitting ? "Submitting..." : "Submit Claim"}</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={leaveHref !== null}
        onOpenChange={(open) => {
          if (!open) setLeaveHref(null);
        }}
      >
        <DialogTitle>Leave this claim?</DialogTitle>
        <p className="text-sm text-zinc-600 mt-3">Your changes have not been saved.</p>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => setLeaveHref(null)}>
            Keep editing
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              const href = leaveHref;
              setDirty(false);
              setLeaveHref(null);
              if (href) router.push(href);
            }}
          >
            Discard changes
          </Button>
          <Button
            type="button"
            onClick={() => {
              setLeaveHref(null);
              void handleSaveDraft();
            }}
          >
            Save draft
          </Button>
        </DialogFooter>
      </Dialog>
    </form>
  );
}
