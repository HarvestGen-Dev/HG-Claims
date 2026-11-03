"use client";

import { Select } from "@/components/ui/select";
import React, { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth/context";
import { iamClient } from "@/lib/domains";
import { Check, User, Landmark, Eye, EyeOff } from "lucide-react";
import { showToast } from "@/lib/utils/toast";
import {
  MALAYSIAN_BANKS,
  maskBankAccountNumber,
  resolveCanonicalBank,
  validateBankAccountString,
} from "@/lib/constants/banks";

export default function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const [phone, setPhone] = useState(user?.phone || "");
  const [bankCode, setBankCode] = useState("");
  const [bankAccountHolderName, setBankAccountHolderName] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [beneficiaryNewIc, setBeneficiaryNewIc] = useState("");
  const [beneficiaryAddress, setBeneficiaryAddress] = useState("");
  const [showRawAccount, setShowRawAccount] = useState(false);
  const [saved, setSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (user) {
      setPhone(user.phone || "");
      const resolved = resolveCanonicalBank(user.bank_code || user.bank_name);
      setBankCode(resolved?.swiftCode || "");
      setBankAccountHolderName(user.bank_account_holder_name || user.full_name || "");
      setBankAccountNumber(user.bank_account_number || "");
      setBeneficiaryNewIc(user.beneficiary_new_ic || "");
      setBeneficiaryAddress(user.beneficiary_address || "");
    }
  }, [user]);

  const selectedBank = resolveCanonicalBank(bankCode);

  const handleSave = async () => {
    try {
      if (!user) return;
      if (bankAccountNumber.trim()) {
        const acctCheck = validateBankAccountString(bankAccountNumber);
        if (!acctCheck.valid) {
          showToast.error(acctCheck.error || "Invalid bank account number.", "Validation Error");
          return;
        }
      }
      if (bankAccountNumber.trim() && !selectedBank) {
        showToast.error("Please select a supported bank from the directory.", "Validation Error");
        return;
      }

      setIsSaving(true);
      await iamClient.updateProfile(user.id, {
        phone: phone.trim() || null,
        bank_name: selectedBank?.name || null,
        bank_code: selectedBank?.swiftCode || null,
        bank_account_holder_name: bankAccountHolderName.trim() || user.full_name,
        bank_account_number: bankAccountNumber.replace(/[\s\-]/g, "") || null,
        beneficiary_new_ic: beneficiaryNewIc.trim() || null,
        beneficiary_address: beneficiaryAddress.trim() || null,
      });
      await refreshUser();
      setSaved(true);
      setShowRawAccount(false);
      showToast.success("Profile and reimbursement banking details updated.", "Profile Updated");
      setTimeout(() => setSaved(false), 3000);
    } catch (error) {
      showToast.error(
        error instanceof Error ? error.message : "Unable to save changes.",
        "Save Error"
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-4 max-w-2xl mx-auto pb-12">
        <div className="pb-2 border-b border-zinc-200/80 dark:border-zinc-800">
          <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <User className="w-5 h-5 text-zinc-900 dark:text-zinc-100" />
            My Profile
          </h1>
          <p className="text-xs text-zinc-500">
            Keep your contact details and verified reimbursement banking destination current.
          </p>
        </div>

        {saved && (
          <div className="p-2.5 bg-emerald-50 border border-emerald-200/80 text-emerald-900 text-xs font-medium rounded-lg flex items-center gap-2 dark:bg-emerald-950/30 dark:border-emerald-900 dark:text-emerald-300">
            <Check className="w-3.5 h-3.5 text-emerald-600" />
            <span>Profile details updated successfully.</span>
          </div>
        )}

        {/* Personal Card */}
        <Card className="border-zinc-200/80 shadow-2xs">
          <CardHeader className="py-3 px-4 border-b border-zinc-100 dark:border-zinc-800">
            <CardTitle className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Personal information
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-[10px] text-zinc-400 uppercase tracking-wider block mb-0.5">
                  Full Name
                </span>
                <strong className="text-zinc-900 dark:text-zinc-100 text-xs font-medium">
                  {user?.full_name}
                </strong>
              </div>
              <div>
                <span className="text-[10px] text-zinc-400 uppercase tracking-wider block mb-0.5">
                  Email Address
                </span>
                <strong className="text-zinc-900 dark:text-zinc-100 text-xs font-medium">
                  {user?.email}
                </strong>
              </div>
            </div>

            <div className="space-y-1 pt-1">
              <label htmlFor="profile-phone" className="text-sm font-medium text-zinc-600">
                Mobile phone number
              </label>
              <Input
                id="profile-phone"
                type="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="h-8 text-xs bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800"
              />
            </div>
          </CardContent>
        </Card>

        {/* Default Banking Card */}
        <Card className="border-zinc-200/80 shadow-2xs">
          <CardHeader className="py-3 px-4 border-b border-zinc-100 dark:border-zinc-800 flex flex-row items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Landmark className="w-4 h-4 text-zinc-900 dark:text-zinc-100" />
              <CardTitle className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Default reimbursement bank account
              </CardTitle>
            </div>
            {selectedBank && (
              <span className="text-[10px] font-mono font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 px-2 py-0.5 rounded">
                {selectedBank.swiftCode} &middot; {selectedBank.paymentMode}
              </span>
            )}
          </CardHeader>
          <CardContent className="p-4 space-y-3 text-xs">
            <p className="text-[11px] text-zinc-500">
              Used for Alliance Bank bulk reimbursement payouts and automatically prefilled when you click &quot;Fill with my details&quot; on claim forms.
            </p>

            <div className="space-y-1">
              <label htmlFor="profile-bank" className="text-sm font-medium text-zinc-600">
                Beneficiary bank
              </label>
              <Select
                id="profile-bank"
                value={bankCode}
                onChange={(e) => setBankCode(e.target.value)}
                className="w-full"
              >
                <option value="">Select Bank from Directory...</option>
                {MALAYSIAN_BANKS.map((bank) => (
                  <option key={bank.swiftCode} value={bank.swiftCode}>
                    {bank.name} ({bank.swiftCode} — {bank.paymentMode})
                  </option>
                ))}
              </Select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label htmlFor="profile-holder" className="text-sm font-medium text-zinc-600">
                  Beneficiary legal name
                </label>
                <Input
                  id="profile-holder"
                  autoComplete="name"
                  value={bankAccountHolderName}
                  onChange={(e) => setBankAccountHolderName(e.target.value)}
                  placeholder="Exact legal name on bank account"
                  className="h-8 text-xs bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800"
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label htmlFor="profile-account" className="text-sm font-medium text-zinc-600">
                    Bank account number
                  </label>
                  {bankAccountNumber && (
                    <button
                      type="button"
                      onClick={() => setShowRawAccount(!showRawAccount)}
                      className="text-sm text-zinc-600 hover:text-zinc-900 inline-flex items-center gap-1"
                      aria-label={showRawAccount ? "Hide bank account number" : "Reveal bank account number for editing"}
                    >
                      {showRawAccount ? (
                        <>
                          <EyeOff className="w-3 h-3" /> Mask
                        </>
                      ) : (
                        <>
                          <Eye className="w-3 h-3" /> Reveal / Edit
                        </>
                      )}
                    </button>
                  )}
                </div>
                {showRawAccount || !user?.bank_account_number ? (
                  <Input
                    id="profile-account"
                    inputMode="text"
                    autoComplete="off"
                    value={bankAccountNumber}
                    onChange={(e) => setBankAccountNumber(e.target.value)}
                    placeholder="e.g. 514012345678"
                    className="h-8 text-xs bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 font-mono tracking-wider"
                  />
                ) : (
                  <button
                    type="button"
                    id="profile-account"
                    onClick={() => setShowRawAccount(true)}
                    className="min-h-10 w-full px-2.5 rounded-lg border border-zinc-200 bg-zinc-50 flex items-center justify-between font-mono text-xs text-zinc-700 cursor-pointer"
                    aria-label="Reveal bank account number for editing"
                  >
                    <span>{maskBankAccountNumber(bankAccountNumber)}</span>
                    <span className="text-[10px] font-sans text-zinc-400">Click to edit</span>
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div className="space-y-1">
                <label htmlFor="profile-new-ic" className="text-sm font-medium text-zinc-600">
                  New IC number <span className="text-zinc-500 font-normal">(optional)</span>
                </label>
                <Input
                  id="profile-new-ic"
                  value={beneficiaryNewIc}
                  onChange={(e) => setBeneficiaryNewIc(e.target.value)}
                  placeholder="Optional for standard transfer"
                  className="h-8 text-xs font-mono bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="profile-address" className="text-sm font-medium text-zinc-600">
                  Beneficiary address <span className="text-zinc-500 font-normal">(optional)</span>
                </label>
                <Input
                  id="profile-address"
                  value={beneficiaryAddress}
                  onChange={(e) => setBeneficiaryAddress(e.target.value)}
                  placeholder="Optional"
                  className="h-8 text-xs bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800"
                />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button
                onClick={handleSave}
                loading={isSaving}
                disabled={isSaving}
                className="h-8 bg-zinc-900 hover:bg-zinc-800 text-white font-medium text-xs px-4 shadow-2xs"
              >
                {isSaving ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
