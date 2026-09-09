"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { 
  FileText, 
  Calendar, 
  Building2, 
  PieChart, 
  DollarSign, 
  CreditCard, 
  Send, 
  Save, 
  ArrowLeft,
  CheckCircle2,
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

  // Active payment methods configured by admin
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

  // Filter cost centres for selected ministry if applicable
  const availableCostCentres = costCentres.filter(
    cc => !cc.ministry_id || cc.ministry_id === ministryId
  );

  const validateForm = (isSubmit: boolean) => {
    if (!user) throw new Error("Please log in to submit a claim");
    if (isSubmit) {
      if (!programmeEvent.trim()) throw new Error("Programme or Event name is required");
      if (!purpose.trim()) throw new Error("Ministry purpose / reason is required");
      if (!costCentreId) throw new Error("Please select a budget cost centre");
      if (!declarationAccepted) throw new Error("You must confirm and accept the declaration to submit your claim");

      if (expenses.length === 0) throw new Error("At least one expense line item is required");
      for (let i = 0; i < expenses.length; i++) {
        const exp = expenses[i];
        if (!exp.description.trim()) throw new Error(`Expense item #${i + 1} requires a description`);
        if (formConfig.require_vendor_name && (!exp.vendor || !exp.vendor.trim())) {
          throw new Error(`Expense item #${i + 1} requires a merchant / vendor name (configured by admin).`);
        }
        const numAmount = typeof exp.amount === "string" ? parseFloat(exp.amount) : exp.amount;
        if (isNaN(numAmount) || numAmount <= 0) {
          throw new Error(`Expense item #${i + 1} amount must be greater than RM 0.00`);
        }
      }

      if (formConfig.require_receipt_for_all_expenses && attachments.length === 0) {
        throw new Error("Please upload at least one supporting receipt document before submitting (configured by admin).");
      }
    }
  };

  const handleSaveDraft = async () => {
    try {
      setIsSavingDraft(true);
      setError(null);
      validateForm(false);

      const saved = db.saveClaimDraft({
        id: initialClaim?.id,
        claimant_id: user!.id,
        ministry_id: ministryId,
        programme_event: programmeEvent || "Untitled Draft",
        cost_centre_id: costCentreId || costCentres[0]?.id || "",
        claim_date: claimDate,
        purpose: purpose || "Draft expense",
        payment_method: paymentMethod as any,
        internal_reference: internalRef || undefined,
        expenses: expenses.map((e, idx) => ({
          expense_date: e.expense_date || today,
          expense_category_id: e.expense_category_id || categories[0]?.id || "",
          vendor: e.vendor,
          description: e.description || "Draft item",
          amount: typeof e.amount === "string" ? parseFloat(e.amount) || 0 : e.amount,
          notes: e.notes,
          sort_order: idx + 1,
        })),
        attachments,
      });

      router.push(`/claims/${saved.id}`);
    } catch (err: any) {
      setError(err.message || "Failed to save draft claim");
    } finally {
      setIsSavingDraft(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      setError(null);
      validateForm(true);

      const submitted = db.submitClaim({
        id: initialClaim?.id,
        claimant_id: user!.id,
        ministry_id: ministryId,
        programme_event: programmeEvent.trim(),
        cost_centre_id: costCentreId,
        claim_date: claimDate,
        purpose: purpose.trim(),
        payment_method: paymentMethod as any,
        internal_reference: internalRef || undefined,
        declaration_accepted: true,
        expenses: expenses.map((e, idx) => ({
          expense_date: e.expense_date,
          expense_category_id: e.expense_category_id,
          vendor: e.vendor,
          description: e.description,
          amount: typeof e.amount === "string" ? parseFloat(e.amount) : e.amount,
          notes: e.notes,
          sort_order: idx + 1,
        })),
        attachments,
      });

      router.push(`/claims/${submitted.id}`);
    } catch (err: any) {
      setError(err.message || "Failed to submit claim for approval");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Top Header & Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-400"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
              {isEditMode ? `Edit Claim ${initialClaim?.claim_number || ""}` : "New Expense Claim"}
            </h1>
            <p className="text-xs text-slate-500">
              Submit ministry expenses for reimbursement or official record
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleSaveDraft}
            disabled={isSavingDraft || isSubmitting}
            className="flex items-center gap-1.5"
          >
            <Save className="w-4 h-4 text-slate-500" />
            <span>{isSavingDraft ? "Saving..." : "Save Draft"}</span>
          </Button>

          <Button
            type="submit"
            disabled={isSubmitting || isSavingDraft}
            className="flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white"
          >
            <Send className="w-4 h-4" />
            <span>{isSubmitting ? "Submitting..." : "Submit Claim"}</span>
          </Button>
        </div>
      </div>

      {/* Admin Configured Guidance Banner */}
      {formConfig.form_guidance_banner && (
        <div className="p-3.5 rounded-2xl bg-emerald-50/80 border border-emerald-200 text-emerald-950 text-xs flex items-center gap-2.5 shadow-2xs">
          <HelpCircle className="w-4 h-4 text-emerald-700 shrink-0" />
          <span>{formConfig.form_guidance_banner}</span>
        </div>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="w-4 h-4" />
          <AlertTitle>Validation Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* SECTION A: Claimant Information */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2 text-slate-800">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold">
              A
            </span>
            Claimant Profile
          </CardTitle>
          <CardDescription className="text-xs">
            Auto-populated from your church staff / volunteer profile.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs">
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
              <span className="text-slate-400 block mb-0.5">Full Name</span>
              <strong className="text-slate-800 dark:text-slate-200 text-sm font-semibold">{user?.full_name}</strong>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
              <span className="text-slate-400 block mb-0.5">Email Address</span>
              <strong className="text-slate-800 dark:text-slate-200 font-semibold">{user?.email}</strong>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
              <span className="text-slate-400 block mb-0.5">Mobile Phone</span>
              <strong className="text-slate-800 dark:text-slate-200 font-semibold">{user?.phone || "+60 12-345 6789"}</strong>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 flex justify-between items-start">
              <div>
                <span className="text-slate-400 block mb-0.5">Bank Details</span>
                <strong className="text-slate-800 dark:text-slate-200 font-semibold">
                  {user?.bank_name || "Maybank"} ({user?.bank_account_number || "114012345678"})
                </strong>
              </div>
              <Link href="/profile" className="text-[11px] text-emerald-600 hover:text-emerald-700 hover:underline font-semibold ml-2">
                Edit
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* SECTION B: Claim Information */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2 text-slate-800">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold">
              B
            </span>
            Claim & Ministry Details
          </CardTitle>
          <CardDescription className="text-xs">
            Specify the ministry event, budget cost centre, and ministry purpose.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {/* Ministry */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5 text-slate-400" />
                  Ministry / Department *
                </span>
                {!formConfig.allow_claimant_change_ministry && (
                  <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
                    <Lock className="w-2.5 h-2.5" /> Assigned Only
                  </span>
                )}
              </label>
              <select
                value={ministryId}
                onChange={(e) => setMinistryId(e.target.value)}
                disabled={!formConfig.allow_claimant_change_ministry}
                className="flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:bg-slate-100 disabled:cursor-not-allowed dark:border-slate-700 dark:bg-slate-900"
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
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                <FileText className="w-3.5 h-3.5 text-slate-400" />
                Programme / Event *
              </label>
              <Input
                type="text"
                placeholder="e.g. Youth Camp, Sunday Service, Missions Outreach"
                value={programmeEvent}
                onChange={(e) => setProgrammeEvent(e.target.value)}
                required
              />
            </div>

            {/* Cost Centre */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                <PieChart className="w-3.5 h-3.5 text-slate-400" />
                Budget / Cost Centre *
              </label>
              <select
                value={costCentreId}
                onChange={(e) => setCostCentreId(e.target.value)}
                className="flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:border-slate-700 dark:bg-slate-900"
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
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                Claim Submission Date *
              </label>
              <Input
                type="date"
                value={claimDate}
                onChange={(e) => setClaimDate(e.target.value)}
                required
              />
            </div>

            {/* Payment Method */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                <CreditCard className="w-3.5 h-3.5 text-slate-400" />
                Payment Method *
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as any)}
                className="flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:border-slate-700 dark:bg-slate-900"
              >
                {activePaymentMethods.map((pm: any) => (
                  <option key={pm.code} value={pm.code}>{pm.label}</option>
                ))}
              </select>
            </div>

            {/* Internal Reference */}
            {formConfig.enable_internal_reference !== false && (
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Internal Reference (Optional)
                </label>
                <Input
                  type="text"
                  placeholder="e.g. YC-2026-SETUP"
                  value={internalRef}
                  onChange={(e) => setInternalRef(e.target.value)}
                />
              </div>
            )}

            {/* Ministry Purpose */}
            <div className="col-span-1 sm:col-span-2 md:col-span-3 space-y-1">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Ministry Purpose / Reason *
              </label>
              <Textarea
                rows={2}
                placeholder="Explain the church ministry context and justification for this expense..."
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                required
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* SECTION C: Expense Line Items */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2 text-slate-800">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold">
              C
            </span>
            Expense Line Items Breakdown
          </CardTitle>
          <CardDescription className="text-xs">
            Add one or more receipt lines. Amounts must be exact matching your official receipts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ExpenseItemsEditor
            expenses={expenses}
            categories={categories}
            onChange={setExpenses}
          />
        </CardContent>
      </Card>

      {/* SECTION D: Supporting Documents */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2 text-slate-800">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold">
              D
            </span>
            Supporting Documents & Receipts
          </CardTitle>
          <CardDescription className="text-xs">
            Attach photo / scan of tax invoices, official receipts, or delivery orders (Max {formConfig.max_file_size_mb || 10}MB per file).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ReceiptUploader
            attachments={attachments}
            onChange={setAttachments}
            userId={user?.id || "u-jaeden-01"}
          />
        </CardContent>
      </Card>

      {/* SECTION E: Declaration */}
      <Card className="border-emerald-200 bg-emerald-50/30 dark:border-emerald-900/60 dark:bg-emerald-950/20">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2 text-emerald-900 dark:text-emerald-300">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-white text-xs font-bold">
              E
            </span>
            Claimant Confirmation & Declaration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="flex items-start gap-3 text-xs text-slate-700 dark:text-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={declarationAccepted}
              onChange={(e) => setDeclarationAccepted(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-emerald-400 text-emerald-600 focus:ring-emerald-500 accent-emerald-600"
              required
            />
            <span className="leading-relaxed">
              <strong>I confirm that: </strong>
              {formConfig.declaration_text || "These expenses were incurred for legitimate church ministry purposes, have not previously been claimed, and are supported by authentic receipts."}
            </span>
          </label>

          <div className="flex items-center justify-between pt-4 border-t border-emerald-200/60 dark:border-emerald-900/40">
            <Button
              type="button"
              variant="outline"
              onClick={handleSaveDraft}
              disabled={isSavingDraft || isSubmitting}
              className="border-slate-300 text-slate-700"
            >
              <Save className="w-4 h-4 mr-1.5" />
              Save Incomplete Draft
            </Button>

            <Button
              type="submit"
              disabled={isSubmitting || isSavingDraft || !declarationAccepted}
              className="bg-emerald-700 hover:bg-emerald-800 text-white shadow-md px-6"
            >
              <Send className="w-4 h-4 mr-1.5" />
              Submit Official Claim
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
