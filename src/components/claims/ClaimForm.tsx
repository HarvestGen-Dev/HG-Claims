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
  Receipt,
  Landmark,
  Plus,
  Search,
  Users,
  CheckCircle2
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
import { Claim, Ministry, CostCentre, Profile } from "@/lib/types/database";
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/utils/formatters";
import { showToast } from "@/lib/utils/toast";


interface ClaimFormProps {
  initialClaim?: Claim | null;
  isEditMode?: boolean;
}

export function ClaimForm({ initialClaim, isEditMode = false }: ClaimFormProps) {
  const router = useRouter();
  const { user } = useAuth();

  const ministries = masterDataClient.getMinistries();
  const costCentres = masterDataClient.getCostCentres();
  const formConfig = masterDataClient.getSetting("claim_form_config") || {
    declaration_text: "I confirm that these expenses were incurred for legitimate ministry purposes in accordance with Harvest Generation financial policies, have not previously been claimed or reimbursed from any other source, and are supported by the authentic receipts and documents provided.",
    allow_claimant_change_ministry: true,
    require_vendor_name: false,
    require_receipt_for_all_expenses: true,
    enable_internal_reference: true,
    form_guidance_banner: "Please ensure each receipt card has an attached receipt file and cost centre before submitting for approval.",
    max_file_size_mb: 10,
    max_attachment_count: 15,
  };

  const today = new Date().toISOString().split("T")[0];

  // 01: Claimant Details & Saved Bank Profile State
  const [profiles, setProfiles] = useState<Profile[]>(() => iamClient.getProfiles());
  const [selectedPayeeProfileId, setSelectedPayeeProfileId] = useState<string>(
    initialClaim?.claimant_id || (user && !user.is_multi_user ? user.id : "")
  );
  const [profileSearchQuery, setProfileSearchQuery] = useState("");
  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false);
  const profileDropdownRef = useRef<HTMLDivElement>(null);

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
      (user?.is_multi_user ? "" : user?.full_name) ||
      ""
  );
  const [claimantEmail, setClaimantEmail] = useState(
    initialClaim?.claimant_email || initialClaim?.claimant?.email || user?.email || ""
  );
  const [claimantPhone, setClaimantPhone] = useState(
    initialClaim?.claimant_phone || initialClaim?.claimant?.phone || user?.phone || "+60 12-345 6789"
  );
  const initialResolvedBank = resolveCanonicalBank(
    initialClaim?.bank_code ||
      initialClaim?.bank_name ||
      (user?.is_multi_user ? undefined : user?.bank_code || user?.bank_name) ||
      "MBBEMYKL"
  );
  const [bankName, setBankName] = useState(
    initialResolvedBank?.name ||
      initialClaim?.bank_name ||
      (user?.is_multi_user ? undefined : user?.bank_name) ||
      "Maybank / Malayan Banking Berhad"
  );
  const [bankCode, setBankCode] = useState(
    initialResolvedBank?.swiftCode || "MBBEMYKL"
  );
  const [bankAccountHolderName, setBankAccountHolderName] = useState(
    initialClaim?.bank_account_holder_name ||
      (user?.is_multi_user ? "" : user?.bank_account_holder_name) ||
      initialClaim?.claimant_name ||
      (user?.is_multi_user ? "" : user?.full_name) ||
      ""
  );
  const [bankAccountNumber, setBankAccountNumber] = useState(
    initialClaim?.bank_account_number || (user?.is_multi_user ? "" : user?.bank_account_number) || ""
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
            expense_category_id: e.expense_category_id || undefined,
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
    const unsub = workspaceStore.subscribe(() => {
      setProfiles(iamClient.getProfiles());
    });
    return unsub;
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        profileDropdownRef.current &&
        !profileDropdownRef.current.contains(event.target as Node)
      ) {
        setIsProfileDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (error) {
      errorRef.current?.focus();
      errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [error]);

  const handleSelectClaimantProfile = (profile: Profile) => {
    setSelectedPayeeProfileId(profile.id);
    setClaimantName(profile.full_name || "");
    setClaimantEmail(profile.email || user?.email || "");
    setClaimantPhone(profile.phone || user?.phone || "+60 12-345 6789");
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
    if (profile.bank_account_number) {
      setBankAccountNumber(profile.bank_account_number);
    }
    setProfileSearchQuery(profile.full_name || "");
    setIsProfileDropdownOpen(false);
    setDirty(true);
  };

  const handleOpenAddBankProfile = (prefillName?: string) => {
    const nameToUse = (prefillName ?? profileSearchQuery ?? claimantName).trim();
    setNewProfileName(nameToUse);
    setNewProfileHolderName(nameToUse);
    setNewProfileEmail(claimantEmail || user?.email || "");
    setNewProfilePhone(claimantPhone || user?.phone || "+60 12-345 6789");
    setNewProfileBankCode(bankCode || "MBBEMYKL");
    setNewProfileAccountNumber("");
    setNewProfileError(null);
    setIsProfileDropdownOpen(false);
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
        ministry_id: ministryId || user?.ministry_id || null,
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
      setSelectedPayeeProfileId(user.id);
      setClaimantName(user.full_name);
      setClaimantEmail(user.email);
      setClaimantPhone(user.phone || "+60 12-345 6789");
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
    if (!claimantName.trim()) return "Please enter the claimant full name.";
    if (!claimantEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(claimantEmail.trim())) {
      return "Please enter a valid claimant email address.";
    }
    if (!claimantPhone.trim()) return "Please enter the claimant phone number.";
    const resolvedBank = resolveCanonicalBank(bankCode || bankName);
    if (!resolvedBank) {
      return "Please select a supported reimbursement bank from the directory.";
    }
    const acctValidation = validateBankAccountString(bankAccountNumber);
    if (!acctValidation.valid) {
      return acctValidation.error || "Please enter a valid bank account number.";
    }
    if (!ministryId) return "Please select a ministry / department.";
    if (!claimDate) return "Please select the claim date.";
    if (!purpose.trim()) return "Please provide the ministry purpose and justification.";

    if (expenses.length === 0) return "Please add at least one receipt.";

    for (let i = 0; i < expenses.length; i++) {
      const e = expenses[i];
      if (!e.expense_date) return `Receipt #${i + 1}: Date is required.`;
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
        claimant_id: selectedPayeeProfileId || initialClaim?.claimant_id || user?.id || "u-sarah-02",
        payee_profile_id: selectedPayeeProfileId || undefined,
        claimant_name: claimantName.trim() || user?.full_name || "Unknown Claimant",
        claimant_email: claimantEmail.trim() || user?.email || "",
        claimant_phone: claimantPhone.trim() || user?.phone || "",
        bank_name: resolveCanonicalBank(bankCode || bankName)?.name || bankName.trim() || undefined,
        bank_code: resolveCanonicalBank(bankCode || bankName)?.swiftCode || undefined,
        bank_account_holder_name: (bankAccountHolderName.trim() || claimantName.trim() || user?.full_name || "") || undefined,
        bank_account_number: bankAccountNumber.replace(/[\s\-]/g, "") || undefined,
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

      const savedClaim = await claimsClient.saveClaimDraft({
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
        claimant_id: selectedPayeeProfileId || initialClaim?.claimant_id || user?.id || "u-sarah-02",
        payee_profile_id: selectedPayeeProfileId || undefined,
        claimant_name: claimantName.trim(),
        claimant_email: claimantEmail.trim(),
        claimant_phone: claimantPhone.trim(),
        bank_name: resolveCanonicalBank(bankCode || bankName)?.name || bankName.trim(),
        bank_code: resolveCanonicalBank(bankCode || bankName)?.swiftCode || bankCode,
        bank_account_holder_name: bankAccountHolderName.trim() || claimantName.trim(),
        bank_account_number: bankAccountNumber.replace(/[\s\-]/g, ""),
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

      const submitted = await claimsClient.submitClaim({
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
            className="h-8 text-xs bg-zinc-900 hover:bg-zinc-800 text-white font-medium shadow-2xs gap-1.5"
          >
            {!isSubmitting && <Send className="w-3.5 h-3.5" />}
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
              className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-800 hover:text-zinc-950 hover:underline dark:text-zinc-200"
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
              {user?.is_multi_user && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                  Multi-User Account
                </span>
              )}
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-200/70 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
              Ministry Submitter
            </span>
          </div>

          {/* Saved Claimant / Payee Bank Profile Lookup & Quick-Add */}
          <div className="p-3 rounded-lg bg-slate-50/90 dark:bg-zinc-900/80 border border-zinc-200/90 dark:border-zinc-800 space-y-2.5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <div className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-zinc-800 dark:text-zinc-200" />
                  <span className="text-[11px] font-semibold text-zinc-900 dark:text-zinc-100">
                    Select Saved Claimant Bank Profile
                  </span>
                  {selectedPayeeProfileId && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-semibold">
                      <CheckCircle2 className="w-3 h-3" />
                      Linked to Saved Profile
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-zinc-500 mt-0.5">
                  Search or select a claimant&apos;s name to automatically link their bank account and disbursement details. If their name is not listed, click <strong>+ Add Bank Profile</strong>.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleOpenAddBankProfile()}
                className="h-8 text-xs border-zinc-300 bg-white hover:bg-zinc-100 text-zinc-900 font-semibold shrink-0 gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Bank Profile</span>
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {/* Searchable Combobox for Claimant Profiles */}
              <div ref={profileDropdownRef} className="relative">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <Input
                    type="text"
                    id="claimantProfileSearch"
                    placeholder="Search claimant name or bank account..."
                    value={profileSearchQuery}
                    onFocus={() => setIsProfileDropdownOpen(true)}
                    onChange={(e) => {
                      setProfileSearchQuery(e.target.value);
                      setIsProfileDropdownOpen(true);
                    }}
                    className="h-8 pl-8 text-xs bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800"
                  />
                </div>

                {isProfileDropdownOpen && (
                  <div className="absolute z-30 mt-1 w-full max-h-60 overflow-y-auto rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-800 dark:bg-zinc-950 divide-y divide-zinc-100 dark:divide-zinc-800 text-xs">
                    {(() => {
                      const q = profileSearchQuery.trim().toLowerCase();
                      const selectableProfiles = (profiles || []).filter(
                        (p) =>
                          p.status !== "INACTIVE" &&
                          Boolean(p.full_name?.trim()) &&
                          (!q ||
                            p.full_name.toLowerCase().includes(q) ||
                            (p.email || "").toLowerCase().includes(q) ||
                            (p.bank_name || "").toLowerCase().includes(q) ||
                            (p.bank_account_number || "").toLowerCase().includes(q))
                      );

                      if (selectableProfiles.length === 0) {
                        return (
                          <div className="p-3 text-center space-y-2">
                            <p className="text-zinc-500 text-[11px]">
                              No saved bank profile matching{" "}
                              <strong className="text-zinc-900 dark:text-zinc-100">
                                &ldquo;{profileSearchQuery}&rdquo;
                              </strong>
                            </p>
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => handleOpenAddBankProfile(profileSearchQuery)}
                              className="h-7 text-[11px] bg-zinc-900 hover:bg-zinc-800 text-white gap-1"
                            >
                              <Plus className="w-3 h-3" />
                              <span>
                                Add &ldquo;{profileSearchQuery.trim() || "New Claimant"}&rdquo; Bank Profile
                              </span>
                            </Button>
                          </div>
                        );
                      }

                      return (
                        <>
                          {selectableProfiles.map((p) => {
                            const bankEntry = resolveCanonicalBank(p.bank_code || p.bank_name);
                            const isSelected = selectedPayeeProfileId === p.id;
                            return (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => handleSelectClaimantProfile(p)}
                                className={`w-full text-left px-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-900 flex items-center justify-between gap-2 transition-colors ${
                                  isSelected ? "bg-emerald-50/60 dark:bg-emerald-950/30" : ""
                                }`}
                              >
                                <div className="min-w-0">
                                  <div className="font-semibold text-zinc-900 dark:text-zinc-100 truncate flex items-center gap-1.5">
                                    <span>{p.full_name}</span>
                                    {p.is_payee_only && (
                                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-zinc-100 text-zinc-600 font-normal">
                                        Saved Payee
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[10px] text-zinc-500 truncate">
                                    {bankEntry
                                      ? `${bankEntry.swiftCode} · ${bankEntry.name}`
                                      : p.bank_name || "No bank linked yet"}
                                    {p.bank_account_number
                                      ? ` · Acct ${p.bank_account_number}`
                                      : ""}
                                  </div>
                                </div>
                                {isSelected && (
                                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                                )}
                              </button>
                            );
                          })}
                          <div className="p-2 bg-zinc-50/80 dark:bg-zinc-900/60 flex items-center justify-between">
                            <span className="text-[10px] text-zinc-500">
                              Claimant not in list?
                            </span>
                            <button
                              type="button"
                              onClick={() => handleOpenAddBankProfile(profileSearchQuery)}
                              className="text-[11px] font-semibold text-zinc-900 hover:underline inline-flex items-center gap-1 dark:text-zinc-100"
                            >
                              <Plus className="w-3 h-3" />
                              <span>Add New Bank Profile</span>
                            </button>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>

              {/* Direct Dropdown Select for Quick Selection */}
              <div>
                <select
                  id="claimantProfileSelect"
                  aria-label="Select Claimant Bank Profile"
                  value={selectedPayeeProfileId}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "__ADD_NEW__") {
                      handleOpenAddBankProfile();
                      return;
                    }
                    const found = (profiles || []).find((p) => p.id === val);
                    if (found) {
                      handleSelectClaimantProfile(found);
                    } else {
                      setSelectedPayeeProfileId("");
                    }
                  }}
                  className="flex h-8 w-full rounded-lg border border-zinc-200 bg-white px-2.5 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                >
                  <option value="">-- Choose Saved Claimant Profile --</option>
                  {(profiles || [])
                    .filter((p) => p.status !== "INACTIVE" && Boolean(p.full_name?.trim()))
                    .map((p) => {
                      const bankEntry = resolveCanonicalBank(p.bank_code || p.bank_name);
                      return (
                        <option key={p.id} value={p.id}>
                          {p.full_name}
                          {bankEntry ? ` — ${bankEntry.swiftCode}` : ""}
                          {p.bank_account_number ? ` (${p.bank_account_number})` : " (No bank yet)"}
                        </option>
                      );
                    })}
                  <option value="__ADD_NEW__">+ Add New Claimant Bank Profile...</option>
                </select>
              </div>
            </div>
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

          {/* Claimant Reimbursement Banking Details */}
          <div className="pt-3 mt-1 border-t border-zinc-100 dark:border-zinc-800/80">
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-1.5">
                <Landmark className="w-3.5 h-3.5 text-zinc-900 dark:text-zinc-100" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-300">
                  Reimbursement Banking Details (SBP Directory)
                </span>
              </div>
              {resolveCanonicalBank(bankCode || bankName) && (
                <span className="text-[10px] font-mono font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 px-2 py-0.5 rounded">
                  {resolveCanonicalBank(bankCode || bankName)?.swiftCode} &middot;{" "}
                  {resolveCanonicalBank(bankCode || bankName)?.paymentMode}
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="space-y-1">
                <label htmlFor="bankNameSelect" className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
                  Beneficiary Bank *
                </label>
                <select
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
                  className="flex h-8 w-full rounded-lg border border-zinc-200 bg-white px-2.5 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                >
                  <option value="" disabled>
                    Select Bank from Directory...
                  </option>
                  {MALAYSIAN_BANKS.map((bank) => (
                    <option key={bank.swiftCode} value={bank.swiftCode}>
                      {bank.name} ({bank.swiftCode})
                    </option>
                  ))}
                </select>
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
              <strong className="font-mono text-sm text-zinc-900 dark:text-zinc-100">
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
              className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 accent-zinc-900"
              required
            />
            <span className="leading-relaxed">
              <strong className="text-zinc-900 dark:text-zinc-100">Declaration: </strong>
              {formConfig.declaration_text ||
                "These expenses were incurred for legitimate ministry purposes, have not previously been claimed, and are supported by authentic receipts."}
            </span>
          </label>

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
              disabled={isSubmitting || isSavingDraft || !declarationAccepted}
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
            <span>Add Claimant Bank Account Profile</span>
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSaveNewBankProfile} className="space-y-3.5 my-2 text-xs">
          <p className="text-zinc-500 leading-relaxed">
            Save a claimant&apos;s bank account details to the directory. Once saved, selecting their name automatically links future reimbursement claims to their disbursement account.
          </p>

          <div className="space-y-1">
            <label htmlFor="newProfileName" className="font-semibold text-zinc-700 block">
              Claimant Full Name <span className="text-red-500">*</span>
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
                Email Address <span className="text-zinc-400 font-normal">(Optional)</span>
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
                Mobile Phone <span className="text-zinc-400 font-normal">(Optional)</span>
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
            <select
              id="newProfileBankCode"
              value={newProfileBankCode}
              onChange={(e) => setNewProfileBankCode(e.target.value)}
              disabled={isSavingProfile}
              className="flex h-9 w-full rounded-md border border-zinc-300 bg-white px-2.5 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-900"
              required
            >
              {MALAYSIAN_BANKS.map((bank) => (
                <option key={bank.swiftCode} value={bank.swiftCode}>
                  {bank.name} ({bank.swiftCode} · {bank.paymentMode})
                </option>
              ))}
            </select>
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
