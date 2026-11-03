"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth/context";
import { iamClient } from "@/lib/domains";
import { isRealFullName } from "@/lib/auth/permissions";
import {
  MALAYSIAN_BANKS,
  resolveCanonicalBank,
  validateBankAccountString,
} from "@/lib/constants/banks";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  User,
  Phone,
  UserCheck,
  AlertCircle,
  Landmark,
  CreditCard,
  Users,
} from "lucide-react";
import { showToast } from "@/lib/utils/toast";

export function NamePromptDialog() {
  const { user, refreshUser } = useAuth();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [isMultiUser, setIsMultiUser] = useState(false);
  const [bankCode, setBankCode] = useState("");
  const [bankAccountHolderName, setBankAccountHolderName] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const hasValidName = Boolean(
    user && isRealFullName(user.full_name, user.email)
  );
  const resolvedUserBank = resolveCanonicalBank(
    user?.bank_code || user?.bank_name
  );
  const hasValidBank = Boolean(
    resolvedUserBank &&
      user?.bank_account_number &&
      validateBankAccountString(user.bank_account_number).valid
  );

  // Prompt popup after account creation if:
  // 1. User lacks a real full name, OR
  // 2. Account is NOT a multi-user account and lacks bank / bank account number
  const needsProfilePopup = Boolean(
    user && (!hasValidName || (!user.is_multi_user && !hasValidBank))
  );

  useEffect(() => {
    if (user) {
      const validName = isRealFullName(user.full_name, user.email);
      setFullName(validName ? user.full_name : "");
      setPhone(user.phone || "");
      setIsMultiUser(Boolean(user.is_multi_user));
      const resolved = resolveCanonicalBank(user.bank_code || user.bank_name);
      setBankCode(resolved?.swiftCode || "");
      setBankAccountHolderName(
        user.bank_account_holder_name || (validName ? user.full_name : "")
      );
      setBankAccountNumber(user.bank_account_number || "");
    }
  }, [user]);

  if (!needsProfilePopup) {
    return null;
  }

  const emailAlias = user?.email ? user.email.split("@")[0] : "";
  const selectedBank = resolveCanonicalBank(bankCode);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = fullName.trim();

    if (!trimmed) {
      setError("Full name is required.");
      return;
    }

    if (!isRealFullName(trimmed, user?.email)) {
      setError(
        `"${trimmed}" is your email alias. Please enter your actual full name (e.g. Pastor David Tan).`
      );
      return;
    }

    let normalizedAccount = "";
    let holderName = "";

    if (!isMultiUser) {
      if (!selectedBank) {
        setError("Please select your reimbursement bank from the directory.");
        return;
      }
      const acctValidation = validateBankAccountString(bankAccountNumber);
      if (!acctValidation.valid) {
        setError(
          acctValidation.error || "Please enter a valid bank account number."
        );
        return;
      }
      normalizedAccount = acctValidation.normalized;
      holderName = bankAccountHolderName.trim() || trimmed;
    }

    setIsSaving(true);
    setError("");

    try {
      await iamClient.completeOnboarding({
        full_name: trimmed,
        phone: phone.trim() || undefined,
        is_multi_user: isMultiUser,
        ...(selectedBank && !isMultiUser
          ? {
              bank_name: selectedBank.name,
              bank_code: selectedBank.swiftCode,
              bank_account_holder_name: holderName,
              bank_account_number: normalizedAccount,
            }
          : {}),
      });
      await refreshUser();
      showToast.success(
        isMultiUser
          ? "Multi-user account configured. You can select or add claimant bank profiles directly on the Claim page."
          : "Profile and reimbursement bank details linked to your account.",
        "Profile Saved"
      );
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Unable to save your profile."
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={() => {}}>
      <DialogHeader>
        <div className="flex items-center gap-2 mb-1 text-zinc-900 dark:text-zinc-100">
          <div className="p-2 rounded-full bg-zinc-100 dark:bg-zinc-800">
            <UserCheck className="w-5 h-5 text-zinc-900 dark:text-zinc-100" />
          </div>
          <DialogTitle className="text-base font-bold">
            Complete Your Profile & Disbursement Setup
          </DialogTitle>
        </div>
        <p className="text-xs text-slate-500 leading-relaxed">
          Link your profile to your bank account so selecting your name on a
          claim automatically connects your disbursement details.
          {emailAlias && !hasValidName && (
            <span className="block mt-1.5 text-[11px] text-amber-700 bg-amber-50 p-2 rounded border border-amber-200">
              Note: Email username (<strong>{emailAlias}</strong>) cannot be
              used as your official full name.
            </span>
          )}
        </p>
      </DialogHeader>

      <form onSubmit={handleSubmit} className="space-y-3.5 my-2 text-xs">
        {/* Multi-User Account Toggle */}
        <label className="flex items-start justify-between gap-3 p-3 rounded-lg border border-slate-200 bg-slate-50/80 cursor-pointer hover:bg-slate-100/70 transition-colors">
          <div className="flex items-start gap-2.5">
            <Users className="w-4 h-4 text-zinc-800 mt-0.5 shrink-0" />
            <div>
              <div className="font-semibold text-slate-900">
                Multi-User Account (Shared Ministry Login)
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                Enable if multiple people submit claims under this account.
                Personal bank details won&apos;t be required here — you can
                select or add each person&apos;s bank profile during the Claim
                page workflow.
              </div>
            </div>
          </div>
          <input
            type="checkbox"
            checked={isMultiUser}
            onChange={(e) => {
              setIsMultiUser(e.target.checked);
              setError("");
            }}
            disabled={isSaving}
            className="mt-1 h-4 w-4 rounded border-slate-300 text-zinc-900 focus:ring-zinc-900 accent-zinc-900 shrink-0"
          />
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label
              htmlFor="modal-fullname"
              className="font-semibold text-slate-700 flex items-center gap-1.5"
            >
              <User className="w-3.5 h-3.5 text-slate-400" />
              <span>
                {isMultiUser ? "Account / Ministry Leader Name *" : "Full Name *"}
              </span>
            </label>
            <Input
              id="modal-fullname"
              type="text"
              autoComplete="name"
              autoFocus
              placeholder="e.g. Pastor David Tan"
              value={fullName}
              onChange={(e) => {
                const val = e.target.value;
                if (!bankAccountHolderName || bankAccountHolderName === fullName) {
                  setBankAccountHolderName(val);
                }
                setFullName(val);
                if (error) setError("");
              }}
              required
              disabled={isSaving}
              className="h-9 text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="modal-phone"
              className="font-semibold text-slate-700 flex items-center gap-1.5"
            >
              <Phone className="w-3.5 h-3.5 text-slate-400" />
              <span>
                Mobile Phone{" "}
                <span className="text-slate-400 text-[10px] font-normal">
                  (Optional)
                </span>
              </span>
            </label>
            <Input
              id="modal-phone"
              type="tel"
              autoComplete="tel"
              placeholder="e.g. +60 12-345 6789"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={isSaving}
              className="h-9 text-xs"
            />
          </div>
        </div>

        {/* Bank Details Section (Only required when NOT a Multi-User account) */}
        {!isMultiUser && (
          <div className="pt-2 border-t border-slate-200/80 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                <Landmark className="w-3.5 h-3.5 text-zinc-900" />
                <span>Reimbursement Bank Details</span>
              </div>
              {selectedBank && (
                <span className="text-[10px] font-mono font-semibold bg-zinc-100 text-zinc-800 px-2 py-0.5 rounded">
                  {selectedBank.swiftCode} &middot; {selectedBank.paymentMode}
                </span>
              )}
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="modal-bank-code"
                className="font-semibold text-slate-700 block"
              >
                Beneficiary Bank *
              </label>
              <select
                id="modal-bank-code"
                value={bankCode}
                onChange={(e) => {
                  setBankCode(e.target.value);
                  if (error) setError("");
                }}
                required={!isMultiUser}
                disabled={isSaving}
                className="flex h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-900"
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label
                  htmlFor="modal-bank-holder"
                  className="font-semibold text-slate-700 block"
                >
                  Account Holder Legal Name *
                </label>
                <Input
                  id="modal-bank-holder"
                  type="text"
                  placeholder="Exact name on bank account"
                  value={bankAccountHolderName}
                  onChange={(e) => setBankAccountHolderName(e.target.value)}
                  required={!isMultiUser}
                  disabled={isSaving}
                  className="h-9 text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="modal-bank-account"
                  className="font-semibold text-slate-700 flex items-center gap-1"
                >
                  <CreditCard className="w-3.5 h-3.5 text-slate-400" />
                  <span>Bank Account Number *</span>
                </label>
                <Input
                  id="modal-bank-account"
                  type="text"
                  inputMode="numeric"
                  placeholder="e.g. 514012345678"
                  value={bankAccountNumber}
                  onChange={(e) => {
                    setBankAccountNumber(e.target.value);
                    if (error) setError("");
                  }}
                  required={!isMultiUser}
                  disabled={isSaving}
                  className="h-9 text-xs font-mono tracking-wider"
                />
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-start gap-2 animate-in fade-in">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-red-500" />
            <span>{error}</span>
          </div>
        )}

        <DialogFooter className="mt-5 pt-2">
          <Button
            type="submit"
            loading={isSaving}
            disabled={isSaving || !fullName.trim()}
            className="w-full bg-zinc-900 hover:bg-zinc-800 text-white font-semibold text-xs shadow-md h-10"
          >
            {isSaving
              ? "Saving Profile..."
              : isMultiUser
                ? "Save Multi-User Account & Continue"
                : "Save Profile & Bank Details"}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
