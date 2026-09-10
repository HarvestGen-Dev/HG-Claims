"use client";

import React, { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth/context";
import { db } from "@/lib/data/repository";
import { Check } from "lucide-react";
import { MALAYSIAN_BANKS, BANK_CATEGORIES } from "@/lib/constants/banks";

export default function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const [bankName, setBankName] = useState(user?.bank_name || "Maybank");
  const [accountNum, setAccountNum] = useState(user?.bank_account_number || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (user) {
      setBankName(user.bank_name || "Maybank");
      setAccountNum(user.bank_account_number || "");
      setPhone(user.phone || "");
    }
  }, [user]);

  const handleSave = async () => {
    try {
    if (!user) return;
    await db.updateProfile(user.id, {
      bank_name: bankName,
      bank_account_number: accountNum,
      phone,
    });
    await refreshUser();
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);

    } catch (error) { window.dispatchEvent(new CustomEvent("workspace-error", { detail: error instanceof Error ? error.message : "Unable to save changes." })); }
  };

  return (
    <AppLayout>
      <div className="space-y-4 max-w-2xl mx-auto pb-12">
        <div className="pb-2 border-b border-zinc-200/80 dark:border-zinc-800">
          <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            Profile & Bank Settings
          </h1>
          <p className="text-xs text-zinc-500">
            Keep your contact and Malaysian bank account details current for reimbursement transfers.
          </p>
        </div>

        {saved && (
          <div className="p-2.5 bg-emerald-50 border border-emerald-200/80 text-emerald-900 text-xs font-medium rounded-lg flex items-center gap-2 dark:bg-emerald-950/30 dark:border-emerald-900 dark:text-emerald-300">
            <Check className="w-3.5 h-3.5 text-emerald-600" />
            <span>Profile and banking details updated successfully.</span>
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

        {/* Bank Account Card */}
        <Card className="border-zinc-200/80 shadow-2xs">
          <CardHeader className="py-3 px-4 border-b border-zinc-100 dark:border-zinc-800">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
              Reimbursement Bank Account (Malaysia)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-3 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Bank Name</label>
                <select
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  className="h-8 w-full rounded-lg border border-zinc-200 bg-white px-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                >
                  {BANK_CATEGORIES.map((cat) => {
                    const categoryBanks = MALAYSIAN_BANKS.filter((b) => b.category === cat.key);
                    return (
                      <optgroup key={cat.key} label={cat.label}>
                        {categoryBanks.map((b) => (
                          <option key={b.id} value={b.shortName}>
                            {b.name} ({b.shortName})
                          </option>
                        ))}
                      </optgroup>
                    );
                  })}
                  {!MALAYSIAN_BANKS.some((b) => b.shortName === bankName || b.name === bankName) && bankName && (
                    <option value={bankName}>{bankName} (Custom)</option>
                  )}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Account Number</label>
                <Input
                  value={accountNum}
                  onChange={(e) => setAccountNum(e.target.value)}
                  className="h-8 font-mono text-xs bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800"
                />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button onClick={handleSave} className="h-8 bg-emerald-700 hover:bg-emerald-800 text-white font-medium text-xs px-4 shadow-2xs">
                Save Changes
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
