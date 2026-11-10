"use client";

import { CONTEXT_LABELS, needsBeneficiary, validateItemClassification } from "@/lib/claims-v2";
import { ReceiptUploader, AttachmentDraft as UploadDraft } from "./ReceiptUploader";
import type { DirectoryKind } from "@/lib/types/database";
import { Select } from "@/components/ui/select";
import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Send,
  Save,
  ArrowLeft,
  AlertCircle,
  HelpCircle,
  UserCheck,
  Landmark,
  Plus,
} from "lucide-react";
import {
  MALAYSIAN_BANKS,
  resolveCanonicalBank,
  validateBankAccountString,
} from "@/lib/constants/banks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { ExpenseItemsEditor, ExpenseItemDraft } from "./ExpenseItemsEditor";
import { useAuth } from "@/lib/auth/context";
import { claimsClient, iamClient, masterDataClient, workspaceStore } from "@/lib/domains";
import { Claim, Profile } from "@/lib/types/database";
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/utils/formatters";
import { calculateTotalAmount, moneyToCents, parseMoneyInput } from "@/lib/utils/calculations";
import { showToast } from "@/lib/utils/toast";


interface ClaimFormProps {
  initialClaim?: Claim | null;
  isEditMode?: boolean;
}

export function ClaimForm({ initialClaim, isEditMode = false }: ClaimFormProps) {
  const router = useRouter();
  const { user } = useAuth();

  const ministries = masterDataClient.getMinistries();
  const formConfig = masterDataClient.getSetting("claim_form_config") || {
    declaration_text: "I confirm that these expenses were incurred for legitimate ministry purposes in accordance with Harvest Generation financial policies, have not previously been claimed or reimbursed from any other source, and are supported by the authentic receipts and documents provided.",
    allow_claimant_change_ministry: true,
    require_vendor_name: false,
    require_receipt_for_all_expenses: false,
    enable_internal_reference: true,
    form_guidance_banner: "Add your receipts if available, then enter the payment and expense details.",
    max_file_size_mb: 10,
    max_attachment_count: 15,
  };

  const today = new Date().toISOString().split("T")[0];

  // 01: Claimant Details & Saved Bank Profile State
  const [profiles, setProfiles] = useState<Profile[]>(() => iamClient.getProfiles());
  const [selectedPayeeProfileId, setSelectedPayeeProfileId] = useState<string>(
    initialClaim?.claimant_id || user?.id || ""
  );
  const [profileSearchQuery, setProfileSearchQuery] = useState("");
  const refreshPayeeDetails = useRef(false);

  // Add New Claimant Bank Profile Modal State
  const [isAddBankProfileOpen, setIsAddBankProfileOpen] = useState(false);
  const [newProfileName, setNewProfileName] = useState("");
  const [newProfileEmail, setNewProfileEmail] = useState("");
  const [newProfilePhone, setNewProfilePhone] = useState("");
  const [newProfileBankCode, setNewProfileBankCode] = useState("MBBEMYKL");
  const [newProfileHolderName, setNewProfileHolderName] = useState("");
  const [newProfileAccountNumber, setNewProfileAccountNumber] = useState("");
  const [newProfileError, setNewProfileError] = useState<string | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const [claimantName, setClaimantName] = useState(
    initialClaim?.claimant_name ||
      initialClaim?.claimant?.full_name ||
      user?.full_name ||
      ""
  );
  const [claimantEmail, setClaimantEmail] = useState(
    initialClaim?.claimant_email || initialClaim?.claimant?.email || user?.email || ""
  );
  const [claimantPhone, setClaimantPhone] = useState(
    initialClaim?.claimant_phone || initialClaim?.claimant?.phone || user?.phone || ""
  );
  const initialResolvedBank = resolveCanonicalBank(
    initialClaim?.bank_code ||
      initialClaim?.bank_name ||
      user?.bank_code ||
      user?.bank_name ||
      "MBBEMYKL"
  );
  const [bankName, setBankName] = useState(
    initialResolvedBank?.name ||
      initialClaim?.bank_name ||
      user?.bank_name ||
      "Maybank / Malayan Banking Berhad"
  );
  const [bankCode, setBankCode] = useState(
    initialResolvedBank?.swiftCode || "MBBEMYKL"
  );
  const [bankAccountHolderName, setBankAccountHolderName] = useState(
    initialClaim?.bank_account_holder_name ||
      user?.bank_account_holder_name ||
      initialClaim?.claimant_name ||
      user?.full_name ||
      ""
  );
  const [bankAccountNumber, setBankAccountNumber] = useState(
    initialClaim?.bank_account_number || user?.bank_account_number || ""
  );

  const [generalAttachments, setGeneralAttachments] = useState<UploadDraft[]>(
    (initialClaim?.attachments || []).filter(a => !a.expense_id)
  );
  const savedClaimId = useRef<string | null>(null);
  const latestGeneralAttachments = useRef(generalAttachments);
  const attachLateReceipts = async (id: string, attachments: UploadDraft[]) => {
    for (const attachment of attachments) {
      try { await workspaceStore.dispatchDomainCommand("/api/v1/claims", "attach_receipt", { claim_id: id, attachment }); }
      catch(error) { showToast.error(error instanceof Error ? error.message : "Your receipt could not be attached."); }
    }
  };
  const onGeneralAttachmentsChange = (attachments: UploadDraft[]) => {
    const previous = new Set(latestGeneralAttachments.current.map(a => a.storage_path));
    latestGeneralAttachments.current = attachments;
    setGeneralAttachments(attachments); setDirty(true);
    if (savedClaimId.current) void attachLateReceipts(savedClaimId.current, attachments.filter(a => !previous.has(a.storage_path)));
  };
  const [payToSupplier, setPayToSupplier] = useState(Boolean(initialClaim?.claimant_id && initialClaim.claimant_id !== user?.id));
  const [contextKind, setContextKind] = useState<DirectoryKind | null>(initialClaim?.context_kind || null);
  const [contextValueId, setContextValueId] = useState(initialClaim?.context_value_id || "");
  const [contextName, setContextName] = useState(initialClaim?.context_name || "");
  const categories = masterDataClient.getCategories();
  const managedValues = workspaceStore.getState().managedClaimValues;

  // 02: Claim Details State
  const [ministryId, setMinistryId] = useState(
    initialClaim?.ministry_id || ""
  );
  const [claimDate, setClaimDate] = useState(initialClaim?.claim_date || today);
  const [purpose, setPurpose] = useState(initialClaim?.purpose || "");
  const [internalRef, setInternalRef] = useState(initialClaim?.internal_reference || "");

  // 03: Receipts State
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
            expense_category_id: e.expense_category_id || undefined,
            vendor: e.vendor || "",
            description: e.description,
            amount: initialClaim?.recurring_schedule_id && Number(e.amount) === 0 ? "" : e.amount,
            notes: e.notes || "",
            invoice_number: e.invoice_number || "",
            beneficiary_type: e.beneficiary_type || null,
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
            vendor: "",
            description: "",
            amount: "",
            notes: "",
            sort_order: 1,
            attachment: null,
          },
        ]
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
    const unsub = workspaceStore.subscribeDomains(["iam", "master-data"], () => {
      setProfiles(iamClient.getProfiles());
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (error) {
      errorRef.current?.focus();
      errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [error]);

  const handleSelectClaimantProfile = (profile: Profile) => {
    refreshPayeeDetails.current = true;
    setPayToSupplier(profile.id !== user?.id);
    setSelectedPayeeProfileId(profile.id);
    setClaimantName(profile.full_name || "");
    setClaimantEmail(profile.email || user?.email || "");
    setClaimantPhone(profile.phone || user?.phone || "");
    const resolved = resolveCanonicalBank(profile.bank_code || profile.bank_name);
    if (resolved) {
      setBankName(resolved.name);
      setBankCode(resolved.swiftCode);
    } else if (profile.bank_name) {
      setBankName(profile.bank_name);
    }
    setBankAccountHolderName(
      profile.bank_account_holder_name || profile.full_name || ""
    );
    setBankAccountNumber(profile.bank_account_number || "");
    setProfileSearchQuery(profile.full_name || "");

    setDirty(true);
  };

  const handleOpenAddBankProfile = (prefillName?: string) => {
    const nameToUse = (prefillName ?? profileSearchQuery ?? claimantName).trim();
    setNewProfileName(nameToUse);
    setNewProfileHolderName(nameToUse);
    setNewProfileEmail(claimantEmail || user?.email || "");
    setNewProfilePhone(claimantPhone || user?.phone || "");
    setNewProfileBankCode(bankCode || "MBBEMYKL");
    setNewProfileAccountNumber("");
    setNewProfileError(null);

    setIsAddBankProfileOpen(true);
  };

  const handleSaveNewBankProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setNewProfileError(null);
    if (!newProfileName.trim()) {
      setNewProfileError("Please enter the claimant's full name.");
      return;
    }
    const resolvedBank = resolveCanonicalBank(newProfileBankCode);
    if (!resolvedBank) {
      setNewProfileError("Please select a valid bank from the SBP directory.");
      return;
    }
    const acctValidation = validateBankAccountString(newProfileAccountNumber);
    if (!acctValidation.valid) {
      setNewProfileError(acctValidation.error || "Please enter a valid bank account number.");
      return;
    }

    setIsSavingProfile(true);
    try {
      const savedProfile = await iamClient.saveClaimantBankProfile({
        full_name: newProfileName.trim(),
        email: newProfileEmail.trim() || user?.email || undefined,
        phone: newProfilePhone.trim() || undefined,
        bank_name: resolvedBank.name,
        bank_code: resolvedBank.swiftCode,
        bank_account_holder_name:
          newProfileHolderName.trim() || newProfileName.trim(),
        bank_account_number: acctValidation.normalized,
        ministry_id: ministryId || null,
      });
      setProfiles(iamClient.getProfiles());
      handleSelectClaimantProfile(savedProfile);
      setIsAddBankProfileOpen(false);
      showToast.success(
        `${savedProfile.full_name}'s bank profile saved and linked to this claim.`,
        "Bank Profile Added"
      );
    } catch (err: any) {
      setNewProfileError(
        err instanceof Error ? err.message : "Failed to save claimant bank profile."
      );
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleFillMyDetails = () => {
    if (user) {
      setPayToSupplier(false);
      setSelectedPayeeProfileId(user.id);
      setClaimantName(user.full_name);
      setClaimantEmail(user.email);
      setClaimantPhone(user.phone || "");
      const resolved = resolveCanonicalBank(user.bank_code || user.bank_name);
      if (resolved) {
        setBankName(resolved.name);
        setBankCode(resolved.swiftCode);
      }
      setBankAccountHolderName(user.bank_account_holder_name || user.full_name);
      if (user.bank_account_number) setBankAccountNumber(user.bank_account_number);
      setProfileSearchQuery(user.full_name || "");
      setDirty(true);
    }
  };

  const validate = (): string | null => {
    if (payToSupplier && !selectedPayeeProfileId) return "Choose a supplier.";
    if (!claimantName.trim()) return "Please enter the claimant full name.";
    if (claimantEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(claimantEmail.trim())) {
      return "Please enter a valid claimant email address.";
    }

    const resolvedBank = resolveCanonicalBank(bankCode || bankName);
    if (!payToSupplier && !resolvedBank) return "Please select a supported bank.";
    const acctValidation = validateBankAccountString(bankAccountNumber);
    if (!payToSupplier && !acctValidation.valid) return acctValidation.error || "Please enter a valid bank account number.";
    if (!ministryId) return "Please select a ministry / department.";
    if (!claimDate) return "Please select the claim date.";
    const requiredContext = ministries.find(m => m.id === ministryId)?.context_kind;
    if (requiredContext && contextKind !== requiredContext) return "Complete the required team field.";
    if (contextKind && !contextName.trim()) return `${CONTEXT_LABELS[contextKind]} is required.`;

    if (expenses.length === 0) return "Please add at least one receipt.";

    for (let i = 0; i < expenses.length; i++) {
      const e = expenses[i];
      if (!e.expense_date) return `Receipt #${i + 1}: Date is required.`;
      const classificationError = validateItemClassification(e, categories);
      if (classificationError) return `Item ${i + 1}: ${classificationError}`;
      if (formConfig.require_vendor_name && !e.vendor?.trim()) return `Item ${i + 1}: Supplier / merchant is required.`;
      const amountCents = moneyToCents(e.amount);
      if (amountCents === null || amountCents <= 0) return `Receipt #${i + 1}: Enter a positive amount with at most two decimal places.`;
      if (formConfig.require_receipt_for_all_expenses && !e.attachment && generalAttachments.length === 0) {
        return `Receipt #${i + 1}: Please upload the supporting receipt file.`;
      }
    }

    return null;
  };

  const gatherAttachments = () => {
    const atts: any[] = [...generalAttachments];
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
      const validExpenses = expenses;
      const claimData = {
        id: isEditMode && initialClaim?.id ? initialClaim.id : undefined,
        submitted_by_user_id: user?.id || "u-sarah-02",
        claimant_id: selectedPayeeProfileId || initialClaim?.claimant_id || user?.id || "u-sarah-02",
        payee_profile_id: selectedPayeeProfileId || undefined,
        refresh_payee_details: refreshPayeeDetails.current,
        claimant_name: claimantName.trim() || user?.full_name || "Unknown Claimant",
        claimant_email: claimantEmail.trim() || user?.email || "",
        claimant_phone: claimantPhone.trim() || user?.phone || "",
        bank_name: resolveCanonicalBank(bankCode || bankName)?.name || bankName.trim() || undefined,
        bank_code: resolveCanonicalBank(bankCode || bankName)?.swiftCode || undefined,
        bank_account_holder_name: (bankAccountHolderName.trim() || claimantName.trim() || user?.full_name || "") || undefined,
        bank_account_number: bankAccountNumber.replace(/[\s\-]/g, "") || undefined,
        ministry_id: ministryId || undefined,
        context_kind: contextKind,
        context_value_id: contextValueId || null,
        context_name: contextName || null,
        claim_date: claimDate,
        purpose: purpose || "",
        internal_reference: internalRef || undefined,
        expenses: validExpenses.map((e, idx) => ({
          id: e.id,
          temp_id: e.temp_id,
          expense_date: e.expense_date,
          expense_category_id: e.expense_category_id,
          vendor: e.vendor || undefined,
          description: e.description || "",
          amount: parseMoneyInput(e.amount),
          notes: e.notes || undefined,
          invoice_number: e.invoice_number || undefined,
          beneficiary_type: needsBeneficiary(categories.find(c => c.id === e.expense_category_id)) ? e.beneficiary_type : null,
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

      const savedClaim = await claimsClient.saveClaimDraft({
        ...claimData,
        version: initialClaim?.version,
        request_key: requestKey.current,
      });
      savedClaimId.current = savedClaim.id;
      void attachLateReceipts(savedClaim.id, latestGeneralAttachments.current.filter(a => !claimData.attachments.some(sent => sent.storage_path === a.storage_path)));
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

    setIsSubmitting(true);
    setError(null);

    try {
      const claimData = {
        id: isEditMode && initialClaim?.id ? initialClaim.id : undefined,
        submitted_by_user_id: user?.id || "u-sarah-02",
        claimant_id: selectedPayeeProfileId || initialClaim?.claimant_id || user?.id || "u-sarah-02",
        payee_profile_id: selectedPayeeProfileId || undefined,
        refresh_payee_details: refreshPayeeDetails.current,
        claimant_name: claimantName.trim(),
        claimant_email: claimantEmail.trim(),
        claimant_phone: claimantPhone.trim(),
        bank_name: resolveCanonicalBank(bankCode || bankName)?.name || bankName.trim(),
        bank_code: resolveCanonicalBank(bankCode || bankName)?.swiftCode || bankCode,
        bank_account_holder_name: bankAccountHolderName.trim() || claimantName.trim(),
        bank_account_number: bankAccountNumber.replace(/[\s\-]/g, ""),
        ministry_id: ministryId || undefined,
        context_kind: contextKind,
        context_value_id: contextValueId || null,
        context_name: contextName || null,
        claim_date: claimDate,
        purpose: purpose.trim(),
        internal_reference: internalRef.trim() || undefined,

        expenses: expenses.map((e, idx) => ({
          id: e.id,
          temp_id: e.temp_id,
          expense_date: e.expense_date,
          expense_category_id: e.expense_category_id,
          vendor: e.vendor || undefined,
          description: e.description.trim(),
          amount: parseMoneyInput(e.amount),
          notes: e.notes || undefined,
          invoice_number: e.invoice_number || undefined,
          beneficiary_type: needsBeneficiary(categories.find(c => c.id === e.expense_category_id)) ? e.beneficiary_type : null,
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

      const submitted = await claimsClient.submitClaim({
        ...claimData,
        version: initialClaim?.version,
        request_key: requestKey.current,
      });
      savedClaimId.current = submitted.id;
      void attachLateReceipts(submitted.id, latestGeneralAttachments.current.filter(a => !claimData.attachments.some(sent => sent.storage_path === a.storage_path)));
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

  const totalAmount = calculateTotalAmount(expenses);

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
              {isEditMode ? `Edit Claim ${initialClaim?.claim_number || ""}` : "Submit Claim"}
            </h1>
            <p className="text-xs text-zinc-500">
              {initialClaim?.claim_number || "Enter the claim details and attach receipts."}
            </p>
          </div>
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

      <Card className="claim-section"><CardContent className="p-4 space-y-3">
        <h2 className="font-semibold">Receipt / invoice photos</h2>
        <p className="text-sm text-muted-foreground">Optional. You can submit while a photo is still uploading.</p>
        <ReceiptUploader attachments={generalAttachments} onChange={onGeneralAttachmentsChange} userId={user?.id || ""} maxFileSizeMb={formConfig.max_file_size_mb} />
      </CardContent></Card>
      {initialClaim?.recurring_schedule_id && <Alert><AlertDescription>Bill due {initialClaim.recurring_due_date}. Last month: {initialClaim.recurring_previous_amount == null ? "No previous bill" : formatCurrency(initialClaim.recurring_previous_amount)}.</AlertDescription></Alert>}
      {/* SECTION 01: Claimant Details */}
      <Card className="claim-section border border-zinc-200/80 dark:border-zinc-800 shadow-2xs">
        <CardHeader className="py-3 px-4 border-b border-zinc-100 dark:border-zinc-800/80">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] font-bold text-zinc-400">01</span>
              <CardTitle className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Claimant details
              </CardTitle>
            </div>
            <button
              type="button"
              onClick={handleFillMyDetails}
              className="inline-flex min-h-10 items-center gap-1 self-start text-sm font-medium text-zinc-800 hover:text-zinc-950 hover:underline dark:text-zinc-200"
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>Use my details</span>
            </button>
          </div>
        </CardHeader>
        <CardContent className="p-4 space-y-4">
          {/* Submitter Context Banner */}
          <div className="p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/60 dark:border-zinc-800 text-xs">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-zinc-600 dark:text-zinc-300">
              <span className="font-medium text-zinc-500">
                Submitted by
              </span>
              <span className="font-medium text-zinc-900 dark:text-zinc-100">
                {user?.full_name || "Claimant"}
              </span>
              <span className="break-all text-zinc-500">{user?.email}</span>
            </div>
          </div>

          <div className="space-y-3">
            <label htmlFor="payTo" className="block font-medium text-sm">Pay to</label>
            <Select id="payTo" value={payToSupplier ? "SUPPLIER" : "ME"} onChange={e => {
              if (e.target.value === "ME") { setPayToSupplier(false); handleFillMyDetails(); }
              else { setPayToSupplier(true); setSelectedPayeeProfileId(""); }
            }}><option value="ME">Me</option><option value="SUPPLIER">A supplier</option></Select>
            {payToSupplier && <>
              <Input aria-label="Search suppliers" placeholder="Search suppliers" value={profileSearchQuery} onChange={e => setProfileSearchQuery(e.target.value)} />
              <Select aria-label="Supplier" value={selectedPayeeProfileId} onChange={e => {
                if(e.target.value === "__ADD_NEW__") { handleOpenAddBankProfile(); return; }
                const profile = profiles.find(p => p.id === e.target.value); if(profile) handleSelectClaimantProfile(profile);
              }}><option value="">Choose a supplier</option>
                {profiles.filter(p => p.is_payee_only && p.status === "ACTIVE" && p.full_name.toLowerCase().includes(profileSearchQuery.toLowerCase())).map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                <option value="__ADD_NEW__">Add new supplier</option>
              </Select>
            </>}
            {payToSupplier && selectedPayeeProfileId && <div><p className="text-sm text-muted-foreground">Payment details are saved with this supplier. Finance will review them.</p><Button type="button" variant="ghost" onClick={() => { const p = profiles.find(p => p.id === selectedPayeeProfileId); if (p) handleSelectClaimantProfile(p); }}>Refresh supplier payment details</Button></div>}
          </div>

          {/* Claimant Snapshot Inputs */}
          {!payToSupplier && <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="space-y-1">
              <label htmlFor="claimantName" className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
                Payee name *
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
                Email (optional)
              </label>
              <Input
                type="email"
                id="claimantEmail"
                placeholder="e.g. sarah.lim@example.com"
                value={claimantEmail}
                onChange={(e) => setClaimantEmail(e.target.value)}
                className="h-8 text-xs bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="claimantPhone" className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
                Phone (optional)
              </label>
              <Input
                type="tel"
                id="claimantPhone"
                placeholder="e.g. +60 12-345 6789"
                value={claimantPhone}
                onChange={(e) => setClaimantPhone(e.target.value)}
                className="h-8 text-xs bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 font-mono"
              />
            </div>
          </div>}

          {/* Claimant Reimbursement Banking Details */}
          {!payToSupplier && <div className="pt-3 mt-1 border-t border-zinc-100 dark:border-zinc-800/80">
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-1.5">
                <Landmark className="w-3.5 h-3.5 text-zinc-900 dark:text-zinc-100" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-300">
                  Bank details
                </span>
              </div>
              {resolveCanonicalBank(bankCode || bankName) && (
                <span className="text-[10px] font-mono font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 px-2 py-0.5 rounded">
                  {resolveCanonicalBank(bankCode || bankName)?.swiftCode}
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="space-y-1">
                <label htmlFor="bankNameSelect" className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
                  Beneficiary Bank *
                </label>
                <Select
                  id="bankNameSelect"
                  value={resolveCanonicalBank(bankCode || bankName)?.swiftCode || ""}
                  onChange={(e) => {
                    const selected = resolveCanonicalBank(e.target.value);
                    if (selected) {
                      setBankCode(selected.swiftCode);
                      setBankName(selected.name);
                    }
                    setDirty(true);
                  }}
                  className="w-full"
                >
                  <option value="" disabled>
                    Select Bank from Directory...
                  </option>
                  {MALAYSIAN_BANKS.map((bank) => (
                    <option key={bank.swiftCode} value={bank.swiftCode}>
                      {bank.name}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="space-y-1">
                <label htmlFor="bankAccountHolderName" className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
                  Beneficiary Legal Name *
                </label>
                <Input
                  type="text"
                  id="bankAccountHolderName"
                  placeholder="Exact legal name on bank account"
                  value={bankAccountHolderName || claimantName}
                  onChange={(e) => setBankAccountHolderName(e.target.value)}
                  className="h-8 text-xs bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800"
                  required
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="bankAccountNumber" className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
                  Bank Account Number *
                </label>
                <Input
                  type="text"
                  id="bankAccountNumber"
                  inputMode="numeric"
                  placeholder="e.g. 514012345678"
                  value={bankAccountNumber}
                  onChange={(e) => setBankAccountNumber(e.target.value)}
                  className="h-8 text-xs bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 font-mono tracking-wider"
                  required
                />
                <p className="text-[10px] text-zinc-400">
                  Leading zeroes are preserved for bank transfer.
                </p>
              </div>
            </div>
          </div>}
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
                Team *
              </label>
              <Select
                id="ministryId"
                value={ministryId}
                onChange={(e) => { setMinistryId(e.target.value); const kind = ministries.find(m => m.id === e.target.value)?.context_kind || null; setContextKind(kind); setContextValueId(""); setContextName(""); }}
                className="w-full"
                required
              >
                <option value="">Select a Team</option>
                {ministries.filter((m) => m.is_active || m.id === initialClaim?.ministry_id).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </Select>
            </div>

            <div className="sm:col-span-3 space-y-2">
              {!ministries.find(m => m.id === ministryId)?.context_kind && <label className="flex gap-2 items-center text-sm"><input type="checkbox" checked={contextKind === "EVENT"} onChange={e => { setContextKind(e.target.checked ? "EVENT" : null); setContextValueId(""); setContextName(""); }} />This is for an event</label>}
              {contextKind && <>
                <label htmlFor="teamContext" className="block font-medium">{CONTEXT_LABELS[contextKind]} *</label>
                <Select id="teamContext" value={contextValueId || "OTHER"} onChange={e => { const value = managedValues.find(v => v.id === e.target.value); setContextValueId(value?.id || ""); setContextName(value?.name || ""); }}>
                  <option value="OTHER">Other – type the name</option>
                  {managedValues.filter(v => v.kind === contextKind && v.is_active).map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                </Select>
                {!contextValueId && <Input aria-label={CONTEXT_LABELS[contextKind]} value={contextName} onChange={e => setContextName(e.target.value)} required />}
              </>}
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
                  Reference code
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
                Summary (optional)
              </label>
              <Textarea
                rows={2}
                placeholder="What were these expenses for?"
                id="purpose"
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                className="text-xs bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 resize-y"
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
            userId={user?.id || "u-sarah-02"}
            maxFileSizeMb={formConfig.max_file_size_mb}
            onChange={(items) => {
              setExpenses(items);
              setDirty(true);
            }}
          />
        </CardContent>
      </Card>

      <Card className="claim-section"><CardContent className="p-4 space-y-4">
        <p className="text-sm">Claim total <strong className="font-mono">{formatCurrency(totalAmount)}</strong></p>
          <div className="claim-actions flex items-center justify-between border-t border-zinc-200/80 dark:border-zinc-800 pt-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleSaveDraft}
              loading={isSavingDraft}
              disabled={isSavingDraft || isSubmitting}
              className="h-8 text-xs border-zinc-200 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 gap-1.5"
            >
              {!isSavingDraft && <Save className="w-3.5 h-3.5 text-zinc-400" />}
              <span>{isSavingDraft ? "Saving..." : "Save Draft"}</span>
            </Button>

            <Button
              type="submit"
              size="sm"
              loading={isSubmitting}
              disabled={isSubmitting || isSavingDraft}
              className="h-8 text-xs bg-zinc-900 hover:bg-zinc-800 text-white font-medium px-5 shadow-2xs gap-1.5"
            >
              {!isSubmitting && <Send className="w-3.5 h-3.5" />}
              <span>{isSubmitting ? "Submitting..." : "Submit Claim"}</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Add New Claimant Bank Profile Modal */}
      <Dialog
        open={isAddBankProfileOpen}
        onOpenChange={(open) => {
          if (!open && !isSavingProfile) setIsAddBankProfileOpen(false);
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Landmark className="w-4 h-4 text-zinc-900" />
            <span>Add new supplier</span>
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSaveNewBankProfile} className="space-y-3.5 my-2 text-xs">
          <p className="text-zinc-500 leading-relaxed">
            Save the supplier’s bank details. Finance will review new payment details.
          </p>

          <div className="space-y-1">
            <label htmlFor="newProfileName" className="font-semibold text-zinc-700 block">
              Payee name <span className="text-red-500">*</span>
            </label>
            <Input
              id="newProfileName"
              type="text"
              placeholder="e.g. Hannah Wong"
              value={newProfileName}
              onChange={(e) => {
                const val = e.target.value;
                setNewProfileName(val);
                if (!newProfileHolderName || newProfileHolderName === newProfileName) {
                  setNewProfileHolderName(val);
                }
              }}
              disabled={isSavingProfile}
              className="h-9 text-xs"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor="newProfileEmail" className="font-semibold text-zinc-700 block">
                Email Address
              </label>
              <Input
                id="newProfileEmail"
                type="email"
                placeholder="claimant@harvestgen.org"
                value={newProfileEmail}
                onChange={(e) => setNewProfileEmail(e.target.value)}
                disabled={isSavingProfile}
                className="h-9 text-xs"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="newProfilePhone" className="font-semibold text-zinc-700 block">
                Mobile Phone
              </label>
              <Input
                id="newProfilePhone"
                type="tel"
                placeholder="+60 12-345 6789"
                value={newProfilePhone}
                onChange={(e) => setNewProfilePhone(e.target.value)}
                disabled={isSavingProfile}
                className="h-9 text-xs font-mono"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor="newProfileBankCode" className="font-semibold text-zinc-700 block">
              Beneficiary Bank (SBP Directory) <span className="text-red-500">*</span>
            </label>
            <Select
              id="newProfileBankCode"
              value={newProfileBankCode}
              onChange={(e) => setNewProfileBankCode(e.target.value)}
              disabled={isSavingProfile}
              className="w-full"
              required
            >
              {MALAYSIAN_BANKS.map((bank) => (
                <option key={bank.swiftCode} value={bank.swiftCode}>
                  {bank.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor="newProfileHolderName" className="font-semibold text-zinc-700 block">
                Beneficiary Legal Name <span className="text-red-500">*</span>
              </label>
              <Input
                id="newProfileHolderName"
                type="text"
                placeholder="Exact legal name on bank account"
                value={newProfileHolderName}
                onChange={(e) => setNewProfileHolderName(e.target.value)}
                disabled={isSavingProfile}
                className="h-9 text-xs"
                required
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="newProfileAccountNumber" className="font-semibold text-zinc-700 block">
                Bank Account Number <span className="text-red-500">*</span>
              </label>
              <Input
                id="newProfileAccountNumber"
                type="text"
                inputMode="numeric"
                placeholder="e.g. 514012345678"
                value={newProfileAccountNumber}
                onChange={(e) => setNewProfileAccountNumber(e.target.value)}
                disabled={isSavingProfile}
                className="h-9 text-xs font-mono tracking-wider"
                required
              />
            </div>
          </div>

          {newProfileError && (
            <div className="p-2.5 rounded bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-1.5">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <span>{newProfileError}</span>
            </div>
          )}

          <DialogFooter className="mt-4 gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsAddBankProfileOpen(false)}
              disabled={isSavingProfile}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              loading={isSavingProfile}
              disabled={isSavingProfile}
              className="bg-zinc-900 hover:bg-zinc-800 text-white gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{isSavingProfile ? "Saving Profile..." : "Save & Link Bank Profile"}</span>
            </Button>
          </DialogFooter>
        </form>
      </Dialog>

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
            loading={isSavingDraft}
            disabled={isSavingDraft || isSubmitting}
            onClick={async () => {
              setLeaveHref(null);
              await handleSaveDraft();
            }}
          >
            {isSavingDraft ? "Saving..." : "Save draft"}
          </Button>
        </DialogFooter>
      </Dialog>
    </form>
  );
}
