"use client";

import {
  needsBeneficiary,
  validateItemClassification,
} from "@/lib/claims-v2";
import type { AttachmentDraft } from "./ExpenseItemsEditor";
import { Select } from "@/components/ui/select";
import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Send,
  Save,
  ArrowLeft,
  AlertCircle,
  Landmark,
  Plus,
} from "lucide-react";
import {
  MALAYSIAN_BANKS,
  resolveCanonicalBank,
  validateBankAccountString,
  maskBankAccountNumber,
} from "@/lib/constants/banks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { ExpenseItemsEditor, ExpenseItemDraft } from "./ExpenseItemsEditor";
import { useAuth } from "@/lib/auth/context";
import {
  claimsClient,
  iamClient,
  masterDataClient,
  workspaceStore,
} from "@/lib/domains";
import { Claim, Profile } from "@/lib/types/database";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/utils/formatters";
import {
  calculateTotalAmount,
  moneyToCents,
  parseMoneyInput,
} from "@/lib/utils/calculations";
import { showToast } from "@/lib/utils/toast";

interface ClaimFormProps {
  initialClaim?: Claim | null;
  isEditMode?: boolean;
}

export function ClaimForm({
  initialClaim,
  isEditMode = false,
}: ClaimFormProps) {
  const router = useRouter();
  const { user } = useAuth();

  const ministries = masterDataClient.getMinistries();
  const formConfig = masterDataClient.getSetting("claim_form_config") || {
    declaration_text:
      "I confirm that these expenses were incurred for legitimate ministry purposes in accordance with Harvest Generation financial policies, have not previously been claimed or reimbursed from any other source, and are supported by the authentic receipts and documents provided.",
    allow_claimant_change_ministry: true,
    require_vendor_name: false,
    require_receipt_for_all_expenses: false,
    enable_internal_reference: true,
    form_guidance_banner:
      "Add your receipts if available, then enter the payment and expense details.",
    max_file_size_mb: 10,
    max_attachment_count: 15,
  };

  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Kuala_Lumpur",
  });

  // 01: Claimant Details & Saved Bank Profile State
  const [profiles, setProfiles] = useState<Profile[]>(() =>
    iamClient.getProfiles(),
  );
  const [selectedPayeeProfileId, setSelectedPayeeProfileId] = useState<string>(
    initialClaim?.claimant_id || user?.id || "",
  );
  const [profileSearchQuery, setProfileSearchQuery] = useState("");
  const [showPayeeDetails, setShowPayeeDetails] = useState(false);
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
      "",
  );
  const [claimantEmail, setClaimantEmail] = useState(
    initialClaim?.claimant_email ||
      initialClaim?.claimant?.email ||
      user?.email ||
      "",
  );
  const [claimantPhone, setClaimantPhone] = useState(
    initialClaim?.claimant_phone ||
      initialClaim?.claimant?.phone ||
      user?.phone ||
      "",
  );
  const initialResolvedBank = resolveCanonicalBank(
    initialClaim?.bank_code ||
      initialClaim?.bank_name ||
      user?.bank_code ||
      user?.bank_name ||
      "MBBEMYKL",
  );
  const [bankName, setBankName] = useState(
    initialResolvedBank?.name ||
      initialClaim?.bank_name ||
      user?.bank_name ||
      "Maybank / Malayan Banking Berhad",
  );
  const [bankCode, setBankCode] = useState(
    initialResolvedBank?.swiftCode || "MBBEMYKL",
  );
  const [bankAccountHolderName, setBankAccountHolderName] = useState(
    initialClaim?.bank_account_holder_name ||
      user?.bank_account_holder_name ||
      initialClaim?.claimant_name ||
      user?.full_name ||
      "",
  );
  const [bankAccountNumber, setBankAccountNumber] = useState(
    initialClaim?.bank_account_number || user?.bank_account_number || "",
  );

  // Preserve any historical attachments from an existing claim
  const [historicalAttachments] = useState<AttachmentDraft[]>(
    (initialClaim?.attachments || []).filter((a) => !a.expense_id),
  );
  const savedClaimId = useRef<string | null>(null);
  const attachLateReceipt = async (id: string, attachment: AttachmentDraft) => {
    try {
      await workspaceStore.dispatchDomainCommand(
        "/api/v1/claims",
        "attach_receipt",
        { claim_id: id, attachment },
      );
    } catch (error) {
      showToast.error(
        error instanceof Error
          ? error.message
          : "Your receipt could not be attached.",
      );
    }
  };

  const [payToSupplier, setPayToSupplier] = useState(
    Boolean(initialClaim?.claimant_id && initialClaim.claimant_id !== user?.id),
  );

  const categories = masterDataClient.getCategories();

  // 02: Claim Details State
  // Derive team securely from claimant/submitter profile or settings rather than manual entry
  const derivedMinistryId =
    initialClaim?.ministry_id ||
    user?.ministry_id ||
    user?.default_ministry_id ||
    profiles.find((p) => p.id === user?.id)?.ministry_id ||
    ministries.find((m) => m.is_active)?.id ||
    "";
  const [claimDate, setClaimDate] = useState(initialClaim?.claim_date || today);
  const [purpose] = useState(initialClaim?.purpose || "");
  const [internalRef, setInternalRef] = useState(
    initialClaim?.internal_reference || "",
  );

  // 03: Expense Items State
  // Default "Who was it for?" to INTERNAL on newly created items
  const [expenses, setExpenses] = useState<ExpenseItemDraft[]>(() => {
    if (initialClaim?.expenses && initialClaim.expenses.length > 0) {
      return initialClaim.expenses.map((e) => {
        const matchingAttachment = (initialClaim.attachments || []).find(
          (a) => a.expense_id === e.id,
        );
        return {
          id: e.id,
          temp_id: crypto.randomUUID(),
          expense_date: e.expense_date,
          expense_category_id: e.expense_category_id || undefined,
          vendor: e.vendor || "",
          description: e.description,
          amount:
            initialClaim?.recurring_schedule_id && Number(e.amount) === 0
              ? ""
              : e.amount,
          notes: e.notes || "",
          invoice_number: e.invoice_number || "",
          beneficiary_type: e.beneficiary_type || "INTERNAL",
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
      });
    }

    if (initialClaim?.attachments && initialClaim.attachments.length > 0) {
      // Claim duplication preserved Part 1 attachments: populate them into Expense Items
      return initialClaim.attachments.map((att, idx) => {
        const tempId = crypto.randomUUID();
        return {
          temp_id: tempId,
          expense_date: today,
          vendor: "",
          description: "",
          amount: "",
          notes: "",
          beneficiary_type: "INTERNAL",
          sort_order: idx + 1,
          attachment: {
            id: att.id,
            expense_id: tempId,
            original_filename: att.original_filename,
            file_size: att.file_size,
            mime_type: att.mime_type,
            storage_path: att.storage_path,
            file_category: att.file_category,
            uploaded_by: att.uploaded_by,
            signed_url: att.signed_url,
          },
        };
      });
    }

    return [
      {
        temp_id: crypto.randomUUID(),
        expense_date: today,
        vendor: "",
        description: "",
        amount: "",
        notes: "",
        beneficiary_type: "INTERNAL",
        sort_order: 1,
        attachment: null,
      },
    ];
  });

  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const [dirty, setDirty] = useState(false);
  const [leaveHref, setLeaveHref] = useState<string | null>(null);
  const requestKey = useRef<string>();
  if (!requestKey.current && typeof window !== "undefined")
    requestKey.current = crypto.randomUUID();

  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const navigate = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const link = (event.target as Element).closest<HTMLAnchorElement>(
        "a[href]",
      );
      if (!link || link.target === "_blank" || link.hasAttribute("download"))
        return;
      const destination = new URL(link.href);
      if (
        destination.origin !== location.origin ||
        destination.href === location.href ||
        destination.hash
      )
        return;
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
    const unsub = workspaceStore.subscribeDomains(
      ["iam", "master-data"],
      () => {
        setProfiles(iamClient.getProfiles());
      },
    );
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
    const resolved = resolveCanonicalBank(
      profile.bank_code || profile.bank_name,
    );
    if (resolved) {
      setBankName(resolved.name);
      setBankCode(resolved.swiftCode);
    } else if (profile.bank_name) {
      setBankName(profile.bank_name);
    }
    setBankAccountHolderName(
      profile.bank_account_holder_name || profile.full_name || "",
    );
    setBankAccountNumber(profile.bank_account_number || "");
    setProfileSearchQuery(profile.full_name || "");

    setDirty(true);
  };

  const handleOpenAddBankProfile = (prefillName?: string) => {
    const nameToUse = (
      prefillName ??
      profileSearchQuery ??
      claimantName
    ).trim();
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
    e.stopPropagation();
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
      setNewProfileError(
        acctValidation.error || "Please enter a valid bank account number.",
      );
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
        ministry_id: derivedMinistryId || null,
      });
      setProfiles(iamClient.getProfiles());
      handleSelectClaimantProfile(savedProfile);
      setIsAddBankProfileOpen(false);
      showToast.success(
        `${savedProfile.full_name} saved and linked to this claim.`,
        "Supplier added",
      );
    } catch (err: any) {
      setNewProfileError(
        err instanceof Error
          ? err.message
          : "Failed to save claimant bank profile.",
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
      if (user.bank_account_number)
        setBankAccountNumber(user.bank_account_number);
      setProfileSearchQuery(user.full_name || "");
      setDirty(true);
    }
  };

  const validate = (): string | null => {
    if (payToSupplier && !selectedPayeeProfileId) return "Choose a supplier.";
    if (!claimantName.trim()) return "Please enter the claimant full name.";
    if (
      claimantEmail.trim() &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(claimantEmail.trim())
    ) {
      return "Please enter a valid claimant email address.";
    }

    const resolvedBank = resolveCanonicalBank(bankCode || bankName);
    if (!payToSupplier && !resolvedBank)
      return "Please select a supported bank.";
    const acctValidation = validateBankAccountString(bankAccountNumber);
    if (!payToSupplier && !acctValidation.valid)
      return (
        acctValidation.error || "Please enter a valid bank account number."
      );

    if (expenses.length === 0) return "Please add at least one expense item.";

    for (let i = 0; i < expenses.length; i++) {
      const e = expenses[i];
      if (!e.expense_date) return `Item ${i + 1}: Date is required.`;
      const classificationError = validateItemClassification(e, categories);
      if (classificationError) return `Item ${i + 1}: ${classificationError}`;
      const amountCents = moneyToCents(e.amount);
      if (amountCents === null || amountCents <= 0)
        return `Item ${i + 1}: Enter a positive amount with at most two decimal places.`;
      if (formConfig.require_receipt_for_all_expenses && !e.attachment) {
        return `Item ${i + 1}: Please upload the supporting receipt file.`;
      }
    }

    return null;
  };

  const gatherAttachments = () => {
    // Preserve any existing general attachments from historical claims
    const atts: any[] = [...historicalAttachments];
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
        claimant_id:
          selectedPayeeProfileId ||
          initialClaim?.claimant_id ||
          user?.id ||
          "u-sarah-02",
        payee_profile_id: selectedPayeeProfileId || undefined,
        refresh_payee_details: refreshPayeeDetails.current,
        claimant_name:
          claimantName.trim() || user?.full_name || "Unknown Claimant",
        claimant_email: claimantEmail.trim() || user?.email || "",
        claimant_phone: claimantPhone.trim() || user?.phone || "",
        bank_name:
          resolveCanonicalBank(bankCode || bankName)?.name ||
          bankName.trim() ||
          undefined,
        bank_code:
          resolveCanonicalBank(bankCode || bankName)?.swiftCode || undefined,
        bank_account_holder_name:
          bankAccountHolderName.trim() ||
          claimantName.trim() ||
          user?.full_name ||
          "" ||
          undefined,
        bank_account_number:
          bankAccountNumber.replace(/[\s\-]/g, "") || undefined,
        ministry_id: derivedMinistryId || undefined,
        context_kind: initialClaim?.context_kind || null,
        context_value_id: initialClaim?.context_value_id || null,
        context_name: initialClaim?.context_name || null,
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
          beneficiary_type: needsBeneficiary(
            categories.find((c) => c.id === e.expense_category_id),
          )
            ? e.beneficiary_type || "INTERNAL"
            : null,
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
      setDirty(false);
      showToast.flashSuccess(
        isEditMode
          ? "Changes have been saved to the draft."
          : "Claim draft saved successfully.",
        "Draft Saved",
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
        claimant_id:
          selectedPayeeProfileId ||
          initialClaim?.claimant_id ||
          user?.id ||
          "u-sarah-02",
        payee_profile_id: selectedPayeeProfileId || undefined,
        refresh_payee_details: refreshPayeeDetails.current,
        claimant_name: claimantName.trim(),
        claimant_email: claimantEmail.trim(),
        claimant_phone: claimantPhone.trim(),
        bank_name:
          resolveCanonicalBank(bankCode || bankName)?.name || bankName.trim(),
        bank_code:
          resolveCanonicalBank(bankCode || bankName)?.swiftCode || bankCode,
        bank_account_holder_name:
          bankAccountHolderName.trim() || claimantName.trim(),
        bank_account_number: bankAccountNumber.replace(/[\s\-]/g, ""),
        ministry_id: derivedMinistryId || undefined,
        context_kind: initialClaim?.context_kind || null,
        context_value_id: initialClaim?.context_value_id || null,
        context_name: initialClaim?.context_name || null,
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
          beneficiary_type: needsBeneficiary(
            categories.find((c) => c.id === e.expense_category_id),
          )
            ? e.beneficiary_type || "INTERNAL"
            : null,
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
      setDirty(false);
      showToast.flashSuccess(
        isEditMode
          ? "Changes have been made and submitted for review."
          : "Claim has been submitted successfully.",
        "Claim Submitted",
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
    <>
      <form
        onChangeCapture={() => setDirty(true)}
        onSubmit={handleSubmit}
        className="claim-form mx-auto w-full max-w-4xl space-y-6 pb-8"
      >
        <header className="flex items-center gap-3">
          <Link
            href="/claims"
            aria-label="Back to claims"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg hover:bg-muted"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              {isEditMode
                ? `Edit claim ${initialClaim?.claim_number || ""}`
                : "Submit Claim"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Add your receipts and expense details, choose who to pay, and submit for review.
            </p>
          </div>
        </header>

        {formConfig.form_guidance_banner && (
          <p className="text-sm text-muted-foreground">
            {formConfig.form_guidance_banner}
          </p>
        )}

        {error && (
          <Alert ref={errorRef} tabIndex={-1} variant="destructive">
            <AlertTitle>Please check your submission</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {initialClaim?.recurring_schedule_id && (
          <Alert>
            <AlertDescription>
              Bill due {initialClaim.recurring_due_date}. Last month:{" "}
              {initialClaim.recurring_previous_amount == null
                ? "No previous bill"
                : formatCurrency(initialClaim.recurring_previous_amount)}
              .
            </AlertDescription>
          </Alert>
        )}

        {/* 1. Pay To Card */}
        <Card className="claim-section">
          <CardHeader className="p-4 sm:p-5 pb-3">
            <h2 className="text-base font-semibold">Pay to</h2>
          </CardHeader>
          {initialClaim?.recurring_schedule_id ? (
            <CardContent className="p-4 sm:p-5 pt-0 space-y-1 break-words text-sm">
              <p className="font-medium">{claimantName}</p>
              <p className="text-muted-foreground">
                {initialClaim.payee_payment_method === "JOMPAY"
                  ? "JomPAY"
                  : [
                      initialClaim.bank_name || initialClaim.bank_code,
                      maskBankAccountNumber(initialClaim.bank_account_number || ""),
                    ].filter(Boolean).join(" · ")}
              </p>
              <p className="text-xs text-muted-foreground">
                Payment details saved when this draft was generated.
              </p>
            </CardContent>
          ) : (
          <CardContent className="p-4 sm:p-5 pt-0 space-y-4">
            <div className="space-y-1">
              <label htmlFor="payTo">Who should receive the payment?</label>
              <Select
                id="payTo"
                className="w-full"
                value={payToSupplier ? "SUPPLIER" : "ME"}
                onChange={(e) => {
                  if (e.target.value === "ME") {
                    setPayToSupplier(false);
                    handleFillMyDetails();
                  } else {
                    setPayToSupplier(true);
                    setSelectedPayeeProfileId("");
                    setProfileSearchQuery("");
                  }
                }}
              >
                <option value="ME">Me</option>
                <option value="SUPPLIER">A supplier</option>
              </Select>
            </div>
            {payToSupplier ? (
              <div className="space-y-3">
                <Input
                  aria-label="Search suppliers"
                  placeholder="Search suppliers"
                  value={profileSearchQuery}
                  onChange={(e) => setProfileSearchQuery(e.target.value)}
                />
                <Select
                  aria-label="Supplier"
                  className="w-full"
                  required
                  value={selectedPayeeProfileId}
                  onChange={(e) => {
                    if (e.target.value === "__ADD_NEW__") {
                      handleOpenAddBankProfile();
                      return;
                    }
                    const p = profiles.find((p) => p.id === e.target.value);
                    if (p) handleSelectClaimantProfile(p);
                  }}
                >
                  <option value="">Choose a supplier</option>
                  {profiles
                    .filter(
                      (p) =>
                        p.is_payee_only &&
                        p.status === "ACTIVE" &&
                        p.full_name
                          .toLowerCase()
                          .includes(profileSearchQuery.toLowerCase()),
                    )
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.full_name}
                      </option>
                    ))}
                  <option value="__ADD_NEW__">Add new supplier</option>
                </Select>
                {selectedPayeeProfileId && (
                  <div className="rounded-lg bg-muted/40 p-3 space-y-2">
                    <p className="text-sm">
                      {claimantName} · Saved supplier payment details
                    </p>
                    <Button
                      type="button"
                      variant="link"
                      className="h-auto p-0 text-sm"
                      onClick={() => {
                        const p = profiles.find(
                          (p) => p.id === selectedPayeeProfileId,
                        );
                        if (p) handleSelectClaimantProfile(p);
                      }}
                    >
                      Refresh supplier payment details
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <details
                className="rounded-lg border p-4"
                open={showPayeeDetails || !claimantName || !bankAccountNumber}
                onToggle={(e) => setShowPayeeDetails(e.currentTarget.open)}
              >
                <summary className="cursor-pointer text-sm font-medium">
                  <span>{claimantName || "Complete your payment details"}</span>
                  <span className="block mt-1 text-muted-foreground font-normal">
                    {resolveCanonicalBank(bankCode || bankName)?.name ||
                      "Bank details needed"}{" "}
                    · {maskBankAccountNumber(bankAccountNumber)} · View or
                    change
                  </span>
                </summary>
                <div className="mt-4 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1 sm:col-span-2">
                      <label htmlFor="claimantName">Payee name *</label>
                      <Input
                        id="claimantName"
                        value={claimantName}
                        onChange={(e) => setClaimantName(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <label htmlFor="claimantEmail">Email (optional)</label>
                      <Input
                        id="claimantEmail"
                        type="email"
                        value={claimantEmail}
                        onChange={(e) => setClaimantEmail(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <label htmlFor="claimantPhone">Phone (optional)</label>
                      <Input
                        id="claimantPhone"
                        type="tel"
                        value={claimantPhone}
                        onChange={(e) => setClaimantPhone(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="bankNameSelect">Bank *</label>
                    <Select
                      id="bankNameSelect"
                      className="w-full"
                      required
                      value={
                        resolveCanonicalBank(bankCode || bankName)?.swiftCode ||
                        ""
                      }
                      onChange={(e) => {
                        const bank = resolveCanonicalBank(e.target.value);
                        if (bank) {
                          setBankCode(bank.swiftCode);
                          setBankName(bank.name);
                        }
                        setDirty(true);
                      }}
                    >
                      <option value="">Choose bank</option>
                      {MALAYSIAN_BANKS.map((bank) => (
                        <option key={bank.swiftCode} value={bank.swiftCode}>
                          {bank.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label htmlFor="bankAccountHolderName">
                        Account holder name *
                      </label>
                      <Input
                        id="bankAccountHolderName"
                        required
                        value={bankAccountHolderName || claimantName}
                        onChange={(e) =>
                          setBankAccountHolderName(e.target.value)
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <label htmlFor="bankAccountNumber">
                        Account number *
                      </label>
                      <Input
                        id="bankAccountNumber"
                        inputMode="numeric"
                        required
                        value={bankAccountNumber}
                        onChange={(e) => setBankAccountNumber(e.target.value)}
                      />
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleFillMyDetails}
                  >
                    Reset to my saved details
                  </Button>
                </div>
              </details>
            )}
          </CardContent>
          )}

        </Card>

        {/* 2. Primary Expense Items Card (Receipt Upload + Expense Details in each item) */}
        <Card className="claim-section">
          <CardHeader className="p-4 sm:p-5 pb-3">
            <h2 className="text-base font-semibold">Expense items</h2>
            <p className="text-sm text-muted-foreground">
              Add your receipts and enter expense amounts below. Each item has its own receipt uploader.
            </p>
          </CardHeader>
          <CardContent className="p-4 sm:p-5 pt-0">
            <ExpenseItemsEditor
              expenses={expenses}
              categories={categories}
              userId={user?.id || ""}
              maxFileSizeMb={formConfig.max_file_size_mb}
              onChange={(items) => {
                setExpenses(items);
                setDirty(true);
              }}
              onAttachmentUploaded={(att) => {
                if (savedClaimId.current) {
                  void attachLateReceipt(savedClaimId.current, att);
                }
              }}
            />
          </CardContent>
        </Card>

        {/* 3. Optional Additional Details (Date & Internal Ref) */}
        <details className="rounded-xl border bg-card p-4 sm:p-5">
          <summary className="cursor-pointer text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Additional claim details (optional)
          </summary>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label htmlFor="claimDate">Claim date *</label>
              <Input
                type="date"
                id="claimDate"
                value={claimDate}
                onChange={(e) => setClaimDate(e.target.value)}
                required
              />
            </div>
            {formConfig.enable_internal_reference !== false && (
              <div className="space-y-1">
                <label htmlFor="internalRef">Reference code (optional)</label>
                <Input
                  id="internalRef"
                  placeholder="e.g. REF-2026-001"
                  value={internalRef}
                  onChange={(e) => setInternalRef(e.target.value)}
                />
              </div>
            )}
          </div>
        </details>

        {/* 4. Total and Submission Section */}
        <section className="rounded-xl border bg-card p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <span className="font-medium text-zinc-900 dark:text-zinc-100">Claim total</span>
            <strong className="text-xl tabular-nums text-emerald-700 dark:text-emerald-400">
              {formatCurrency(totalAmount)}
            </strong>
          </div>
          <div className="claim-actions flex gap-3">
            <Button
              type="button"
              variant="outline"
              loading={isSavingDraft}
              disabled={isSavingDraft || isSubmitting}
              onClick={handleSaveDraft}
              className="flex-1 sm:flex-none min-h-11"
            >
              <Save className="h-4 w-4 mr-2" />
              Save Draft
            </Button>
            <Button
              type="submit"
              loading={isSubmitting}
              disabled={isSubmitting || isSavingDraft}
              className="flex-1 sm:flex-none min-h-11 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <Send className="h-4 w-4 mr-2" />
              Submit Claim
            </Button>
          </div>
        </section>
      </form>

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

        <form
          onSubmit={handleSaveNewBankProfile}
          className="space-y-3.5 my-2 text-xs"
        >
          <p className="text-zinc-500 leading-relaxed">
            Save the supplier’s bank details. Finance will review new payment
            details.
          </p>

          <div className="space-y-1">
            <label
              htmlFor="newProfileName"
              className="font-semibold text-zinc-700 block"
            >
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
                if (
                  !newProfileHolderName ||
                  newProfileHolderName === newProfileName
                ) {
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
              <label
                htmlFor="newProfileEmail"
                className="font-semibold text-zinc-700 block"
              >
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
              <label
                htmlFor="newProfilePhone"
                className="font-semibold text-zinc-700 block"
              >
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
            <label
              htmlFor="newProfileBankCode"
              className="font-semibold text-zinc-700 block"
            >
              Beneficiary Bank (SBP Directory){" "}
              <span className="text-red-500">*</span>
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
              <label
                htmlFor="newProfileHolderName"
                className="font-semibold text-zinc-700 block"
              >
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
              <label
                htmlFor="newProfileAccountNumber"
                className="font-semibold text-zinc-700 block"
              >
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
              <span>{isSavingProfile ? "Saving..." : "Save supplier"}</span>
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
        <p className="text-sm text-zinc-600 mt-3">
          Your changes have not been saved.
        </p>
        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setLeaveHref(null)}
          >
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
    </>
  );
}
