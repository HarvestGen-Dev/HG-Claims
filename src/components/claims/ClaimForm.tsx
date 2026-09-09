"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { 
  FileText, 
  Calendar, 
  Building2, 
  PieChart, 
  CreditCard, 
  Send, 
  Save, 
  ArrowLeft,
  AlertCircle,
  HelpCircle,
  Lock
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { ExpenseItemsEditor, ExpenseItemDraft } from "./ExpenseItemsEditor";
import { ReceiptUploader, AttachmentDraft } from "./ReceiptUploader";
import { useAuth } from "@/lib/auth/context";
import { db } from "@/lib/mock-db/repository";
import { Claim, Ministry, ExpenseCategory, CostCentre } from "@/lib/types/database";

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
    form_guidance_banner: "Please ensure all receipts are itemized and clear before submitting for approval.",
    max_file_size_mb: 10,
    max_attachment_count: 15,
    allowed_payment_methods: [
      { code: "PERSONAL_REIMBURSEMENT", label: "Personal payment (Reimbursement to claimant)", enabled: true },
      { code: "CHURCH_CARD", label: "Church Corporate Card", enabled: true },
      { code: "DIRECT_VENDOR_PAYMENT", label: "Direct Church Payment to Vendor", enabled: true },
      { code: "OTHER", label: "Other", enabled: true }
    ]
  };

  const today = new Date().toISOString().split("T")[0];

  const activePaymentMethods = (formConfig.allowed_payment_methods || []).filter((pm: any) => pm.enabled !== false);
  const defaultPaymentMethod = activePaymentMethods[0]?.code || "PERSONAL_REIMBURSEMENT";

  // Form State
  const [ministryId, setMinistryId] = useState(initialClaim?.ministry_id || user?.ministry_id || ministries[0]?.id || "");
  const [programmeEvent, setProgrammeEvent] = useState(initialClaim?.programme_event || "");
  const [costCentreId, setCostCentreId] = useState(initialClaim?.cost_centre_id || costCentres[0]?.id || "");
  const [claimDate, setClaimDate] = useState(initialClaim?.claim_date || today);
  const [purpose, setPurpose] = useState(initialClaim?.purpose || "");
  const [paymentMethod, setPaymentMethod] = useState(initialClaim?.payment_method || defaultPaymentMethod);
  const [internalRef, setInternalRef] = useState(initialClaim?.internal_reference || "");
  const [declarationAccepted, setDeclarationAccepted] = useState(initialClaim?.declaration_accepted || false);

  // Expense Items
  const [expenses, setExpenses] = useState<ExpenseItemDraft[]>(
    initialClaim?.expenses && initialClaim.expenses.length > 0
      ? initialClaim.expenses.map(e => ({
          id: e.id,
          expense_date: e.expense_date,
          expense_category_id: e.expense_category_id,
          vendor: e.vendor || "",
          description: e.description,
          amount: e.amount,
          notes: e.notes || "",
          sort_order: e.sort_order,
        }))
      : [
          {
            expense_date: today,
            expense_category_id: categories[0]?.id || "",
            vendor: "",
            description: "",
            amount: "",
            notes: "",
            sort_order: 1,
          },
        ]
  );

  // Attachments
  const [attachments, setAttachments] = useState<AttachmentDraft[]>(
    initialClaim?.attachments && initialClaim.attachments.length > 0
      ? initialClaim.attachments.map(a => ({
          id: a.id,
          original_filename: a.original_filename,
          file_size: a.file_size,
          mime_type: a.mime_type,
          storage_path: a.storage_path,
          file_category: a.file_category,
          uploaded_by: a.uploaded_by,
          signed_url: a.signed_url,
        }))
      : []
  );

  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);

  const availableCostCentres = costCentres.filter(
    (cc) => !cc.ministry_id || cc.ministry_id === ministryId
  );

  const validate = (): string | null => {
    if (!programmeEvent.trim()) return "Please specify the programme or event name.";
    if (!purpose.trim()) return "Please provide the ministry purpose and justification.";
    if (!ministryId) return "Please select a ministry.";
    if (!costCentreId) return "Please select a budget cost centre.";
    if (!claimDate) return "Please provide the claim date.";

    if (expenses.length === 0) return "Please add at least one expense line item.";

    for (let i = 0; i < expenses.length; i++) {
      const e = expenses[i];
      if (!e.description.trim()) return `Item #${i + 1}: Description is required.`;
      const amt = typeof e.amount === "string" ? parseFloat(e.amount) : e.amount;
      if (isNaN(amt) || amt <= 0) return `Item #${i + 1}: Please enter a valid positive amount.`;
      if (!e.expense_category_id) return `Item #${i + 1}: Category is required.`;
      if (formConfig.require_vendor_name && !e.vendor?.trim()) {
        return `Item #${i + 1}: Vendor/merchant name is required by church policy.`;
      }
    }

    if (formConfig.require_receipt_for_all_expenses && attachments.length === 0) {
      return "Supporting receipt files are required. Please upload at least one receipt.";
    }

    return null;
  };

  const handleSaveDraft = async () => {
    setIsSavingDraft(true);
    setError(null);
    try {
      const validExpenses = expenses.filter(e => e.description.trim() || e.amount);
      const totalAmount = validExpenses.reduce((sum, e) => {
        const val = typeof e.amount === "string" ? parseFloat(e.amount) : e.amount;
        return isNaN(val) ? sum : sum + val;
      }, 0);

      const claimData = {
        id: (isEditMode && initialClaim?.id) ? initialClaim.id : undefined,
        claimant_id: user?.id || "u-jaeden-01",
        ministry_id: ministryId,
        cost_centre_id: costCentreId,
        claim_date: claimDate,
        purpose: purpose || "Draft expense claim",
        programme_event: programmeEvent || "Untitled Event",
        payment_method: paymentMethod as any,
        internal_reference: internalRef || undefined,
        expenses: validExpenses.map((e, idx) => ({
          expense_date: e.expense_date,
          expense_category_id: e.expense_category_id,
          vendor: e.vendor || undefined,
          description: e.description || "Draft item",
          amount: typeof e.amount === "string" ? parseFloat(e.amount) || 0 : e.amount || 0,
          notes: e.notes || undefined,
          sort_order: idx + 1,
        })),
        attachments: attachments.map(a => ({
          original_filename: a.original_filename,
          file_size: a.file_size,
          mime_type: a.mime_type,
          storage_path: a.storage_path,
          file_category: a.file_category,
          uploaded_by: user?.id || "u-jaeden-01",
          signed_url: a.signed_url,
        })),
      };

      const savedClaim = db.saveClaimDraft(claimData);
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
      window.scrollTo({ top: 0, behavior: "smooth" });
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
        id: (isEditMode && initialClaim?.id) ? initialClaim.id : undefined,
        claimant_id: user?.id || "u-jaeden-01",
        ministry_id: ministryId,
        cost_centre_id: costCentreId,
        claim_date: claimDate,
        purpose,
        programme_event: programmeEvent,
        payment_method: paymentMethod as any,
        internal_reference: internalRef || undefined,
        declaration_accepted: true,
        expenses: expenses.map((e, idx) => ({
          expense_date: e.expense_date,
          expense_category_id: e.expense_category_id,
          vendor: e.vendor || undefined,
          description: e.description,
          amount: typeof e.amount === "string" ? parseFloat(e.amount) : e.amount,
          notes: e.notes || undefined,
          sort_order: idx + 1,
        })),
        attachments: attachments.map(a => ({
          original_filename: a.original_filename,
          file_size: a.file_size,
          mime_type: a.mime_type,
          storage_path: a.storage_path,
          file_category: a.file_category,
          uploaded_by: user?.id || "u-jaeden-01",
          signed_url: a.signed_url,
        })),
      };

      const submitted = db.submitClaim(claimData);
      router.push(`/claims/${submitted.id}`);
    } catch (err: any) {
      setError(err?.message || "Failed to submit expense claim.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-4xl mx-auto pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-zinc-200/80 dark:border-zinc-800">
        <div className="flex items-center gap-3">
          <Link href="/claims">
            <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0 text-zinc-500 hover:text-zinc-900">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
              {isEditMode ? `Edit Claim ${initialClaim?.claim_number || ""}` : "New Expense Claim"}
            </h1>
            <p className="text-xs text-zinc-500">
              Submit ministry expense receipts for leader review and reimbursement payout.
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
        <Alert variant="destructive" className="text-xs">
          <AlertCircle className="w-4 h-4" />
          <AlertTitle className="text-xs font-semibold">Please check your submission</AlertTitle>
          <AlertDescription className="text-xs">{error}</AlertDescription>
        </Alert>
      )}

      {/* STEP 1: Claimant Profile */}
      <Card className="border border-zinc-200/80 dark:border-zinc-800 shadow-2xs">
        <CardHeader className="py-3 px-4 border-b border-zinc-100 dark:border-zinc-800/80">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] font-bold text-zinc-400">01</span>
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
                Claimant Profile
              </CardTitle>
            </div>
            <Link href="/profile" className="text-[11px] text-zinc-500 hover:text-zinc-900 hover:underline">
              Edit in Profile
            </Link>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div className="p-2.5 rounded-lg bg-zinc-50/70 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800">
              <span className="text-[10px] text-zinc-400 uppercase tracking-wider block mb-0.5">Name</span>
              <strong className="text-zinc-900 dark:text-zinc-100 font-medium">{user?.full_name}</strong>
            </div>
            <div className="p-2.5 rounded-lg bg-zinc-50/70 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800">
              <span className="text-[10px] text-zinc-400 uppercase tracking-wider block mb-0.5">Email</span>
              <strong className="text-zinc-900 dark:text-zinc-100 font-medium truncate block">{user?.email}</strong>
            </div>
            <div className="p-2.5 rounded-lg bg-zinc-50/70 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800">
              <span className="text-[10px] text-zinc-400 uppercase tracking-wider block mb-0.5">Phone</span>
              <strong className="text-zinc-900 dark:text-zinc-100 font-medium">{user?.phone || "+60 12-345 6789"}</strong>
            </div>
            <div className="p-2.5 rounded-lg bg-zinc-50/70 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800">
              <span className="text-[10px] text-zinc-400 uppercase tracking-wider block mb-0.5">Bank Account</span>
              <strong className="text-zinc-900 dark:text-zinc-100 font-medium truncate block">
                {user?.bank_name || "Maybank"} • {user?.bank_account_number || "114012345678"}
              </strong>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* STEP 2: Ministry & Context */}
      <Card className="border border-zinc-200/80 dark:border-zinc-800 shadow-2xs">
        <CardHeader className="py-3 px-4 border-b border-zinc-100 dark:border-zinc-800/80">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] font-bold text-zinc-400">02</span>
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
              Claim & Ministry Context
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
            {/* Ministry */}
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider flex items-center justify-between">
                <span>Ministry / Department *</span>
                {!formConfig.allow_claimant_change_ministry && (
                  <span className="text-[10px] text-zinc-400 flex items-center gap-0.5">
                    <Lock className="w-2.5 h-2.5" /> Locked
                  </span>
                )}
              </label>
              <select
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

            {/* Programme / Event */}
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
                Programme / Event *
              </label>
              <Input
                type="text"
                placeholder="e.g. Youth Camp, Sunday Service"
                value={programmeEvent}
                onChange={(e) => setProgrammeEvent(e.target.value)}
                className="h-8 text-xs bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800"
                required
              />
            </div>

            {/* Cost Centre */}
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
                Cost Centre *
              </label>
              <select
                value={costCentreId}
                onChange={(e) => setCostCentreId(e.target.value)}
                className="flex h-8 w-full rounded-lg border border-zinc-200 bg-white px-2.5 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                required
              >
                {availableCostCentres.map((cc) => (
                  <option key={cc.id} value={cc.id}>
                    {cc.code} - {cc.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Claim Date */}
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
                Submission Date *
              </label>
              <Input
                type="date"
                value={claimDate}
                onChange={(e) => setClaimDate(e.target.value)}
                className="h-8 text-xs bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 font-mono"
                required
              />
            </div>

            {/* Payment Method */}
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
                Payment Method *
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as any)}
                className="flex h-8 w-full rounded-lg border border-zinc-200 bg-white px-2.5 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
              >
                {activePaymentMethods.map((pm: any) => (
                  <option key={pm.code} value={pm.code}>{pm.label}</option>
                ))}
              </select>
            </div>

            {/* Internal Reference */}
            {formConfig.enable_internal_reference !== false && (
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
                  Reference Code (Optional)
                </label>
                <Input
                  type="text"
                  placeholder="e.g. YC-2026-SETUP"
                  value={internalRef}
                  onChange={(e) => setInternalRef(e.target.value)}
                  className="h-8 text-xs bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 font-mono"
                />
              </div>
            )}

            {/* Ministry Purpose */}
            <div className="col-span-1 sm:col-span-2 md:col-span-3 space-y-1">
              <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
                Ministry Purpose / Justification *
              </label>
              <Textarea
                rows={2}
                placeholder="Explain the church ministry justification for these expenses..."
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                className="text-xs bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 resize-y"
                required
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* STEP 3: Line Items */}
      <Card className="border border-zinc-200/80 dark:border-zinc-800 shadow-2xs">
        <CardHeader className="py-3 px-4 border-b border-zinc-100 dark:border-zinc-800/80">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] font-bold text-zinc-400">03</span>
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
              Expense Line Items Breakdown
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          <ExpenseItemsEditor
            expenses={expenses}
            categories={categories}
            onChange={setExpenses}
          />
        </CardContent>
      </Card>

      {/* STEP 4: Supporting Documents */}
      <Card className="border border-zinc-200/80 dark:border-zinc-800 shadow-2xs">
        <CardHeader className="py-3 px-4 border-b border-zinc-100 dark:border-zinc-800/80">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] font-bold text-zinc-400">04</span>
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
              Receipts & Tax Invoices
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          <ReceiptUploader
            attachments={attachments}
            onChange={setAttachments}
            userId={user?.id || "u-jaeden-01"}
          />
        </CardContent>
      </Card>

      {/* STEP 5: Declaration & Final Action */}
      <Card className="border border-zinc-200/80 bg-zinc-50/50 dark:border-zinc-800 dark:bg-zinc-900/30 shadow-2xs">
        <CardHeader className="py-3 px-4 border-b border-zinc-100 dark:border-zinc-800/80">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] font-bold text-zinc-400">05</span>
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
              Claimant Confirmation & Submission
            </CardTitle>
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
              {formConfig.declaration_text || "These expenses were incurred for legitimate church ministry purposes, have not previously been claimed, and are supported by authentic receipts."}
            </span>
          </label>

          <div className="flex items-center justify-between pt-3 border-t border-zinc-200/80 dark:border-zinc-800">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleSaveDraft}
              disabled={isSavingDraft || isSubmitting}
              className="h-8 text-xs border-zinc-200 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 gap-1.5"
            >
              <Save className="w-3.5 h-3.5 text-zinc-400" />
              <span>Save Incomplete Draft</span>
            </Button>

            <Button
              type="submit"
              size="sm"
              disabled={isSubmitting || isSavingDraft || !declarationAccepted}
              className="h-8 text-xs bg-emerald-700 hover:bg-emerald-800 text-white font-medium px-5 shadow-2xs gap-1.5"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Submit Official Claim</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
