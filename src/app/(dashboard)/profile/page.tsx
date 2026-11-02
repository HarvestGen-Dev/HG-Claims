"use client";

import React, { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth/context";
import { iamClient } from "@/lib/domains";
import { Check, User, Landmark } from "lucide-react";
import { showToast } from "@/lib/utils/toast";
import { MALAYSIAN_BANKS } from "@/lib/constants/banks";

export default function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const [phone, setPhone] = useState(user?.phone || "");
  const [bankName, setBankName] = useState(user?.bank_name || "");
  const [bankAccountNumber, setBankAccountNumber] = useState(user?.bank_account_number || "");
  const [saved, setSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (user) {
      setPhone(user.phone || "");
      setBankName(user.bank_name || "");
      setBankAccountNumber(user.bank_account_number || "");
    }
  }, [user]);

  const handleSave = async () => {
    try {
      if (!user) return;
      setIsSaving(true);
      await iamClient.updateProfile(user.id, {
        phone,
        bank_name: bankName.trim() || null,
        bank_account_number: bankAccountNumber.trim() || null,
      });
      await refreshUser();
      setSaved(true);
      showToast.success("Changes have been made.", "Profile Updated");
      setTimeout(() => setSaved(false), 3000);
    } catch (error) {
      showToast.error(error instanceof Error ? error.message : "Unable to save changes.", "Save Error");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-4 max-w-2xl mx-auto pb-12">
        <div className="pb-2 border-b border-zinc-200/80 dark:border-zinc-800">
          <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <User className="w-5 h-5 text-emerald-700" />
            Profile Settings
          </h1>
          <p className="text-xs text-zinc-500">
            Keep your contact details and default reimbursement banking information current.
          </p>
        </div>

        {saved && (
          <div className="p-2.5 bg-emerald-50 border border-emerald-200/80 text-emerald-900 text-xs font-medium rounded-lg flex items-center gap-2 dark:bg-emerald-950/30 dark:border-emerald-900 dark:text-emerald-300">
            <Check className="w-3.5 h-3.5 text-emerald-600" />
            <span>Profile details updated successfully.</span>
          </div>
        )}

        {/* Profile Card */}
        <Card className="border-zinc-200/80 shadow-2xs">
          <CardHeader className="py-3 px-4 border-b border-zinc-100 dark:border-zinc-800">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
              Personal Information
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-[10px] text-zinc-400 uppercase tracking-wider block mb-0.5">Full Name</span>
                <strong className="text-zinc-900 dark:text-zinc-100 text-xs font-medium">{user?.full_name}</strong>
              </div>
              <div>
                <span className="text-[10px] text-zinc-400 uppercase tracking-wider block mb-0.5">Email Address</span>
                <strong className="text-zinc-900 dark:text-zinc-100 text-xs font-medium">{user?.email}</strong>
              </div>
            </div>

            <div className="space-y-1 pt-1">
              <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Mobile Phone Number</label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="h-8 text-xs bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800"
              />
            </div>
          </CardContent>
        </Card>

        {/* Default Banking Card */}
        <Card className="border-zinc-200/80 shadow-2xs">
          <CardHeader className="py-3 px-4 border-b border-zinc-100 dark:border-zinc-800">
            <div className="flex items-center gap-1.5">
              <Landmark className="w-4 h-4 text-emerald-700" />
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
                Default Reimbursement Bank Account
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-4 space-y-3 text-xs">
            <p className="text-[11px] text-zinc-500">
              Used to automatically prefill your banking details when you click &quot;Fill with my details&quot; on expense claim forms.
            </p>

            <div className="space-y-1">
              <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Default Bank Name</label>
              <select
                value={MALAYSIAN_BANKS.some((b) => b.name === bankName || b.shortName === bankName) ? bankName : (bankName ? "__OTHER__" : "")}
                onChange={(e) => {
                  if (e.target.value !== "__OTHER__") {
                    setBankName(e.target.value);
                  } else {
                    setBankName("");
                  }
                }}
                className="flex h-8 w-full rounded-lg border border-zinc-200 bg-white px-2.5 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
              >
                <option value="">None / Select Bank...</option>
                {MALAYSIAN_BANKS.map((bank) => (
                  <option key={bank.id} value={bank.name}>
                    {bank.name} ({bank.shortName})
                  </option>
                ))}
                <option value="__OTHER__">Other Bank...</option>
              </select>
              {(!MALAYSIAN_BANKS.some((b) => b.name === bankName || b.shortName === bankName) && bankName !== "") && (
                <Input
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  placeholder="Enter custom bank name"
                  className="h-8 text-xs mt-1.5 bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800"
                />
              )}
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Default Bank Account Number</label>
              <Input
                value={bankAccountNumber}
                onChange={(e) => setBankAccountNumber(e.target.value)}
                placeholder="e.g. 514012345678"
                className="h-8 text-xs bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 font-mono tracking-wider"
              />
            </div>

            <div className="flex justify-end pt-2">
              <Button
                onClick={handleSave}
                loading={isSaving}
                disabled={isSaving}
                className="h-8 bg-emerald-700 hover:bg-emerald-800 text-white font-medium text-xs px-4 shadow-2xs"
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
