"use client";

import React, { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth/context";
import { db } from "@/lib/mock-db/repository";
import { UserCircle, CreditCard, Building2, CheckCircle2 } from "lucide-react";
import { MALAYSIAN_BANKS, BANK_CATEGORIES } from "@/lib/constants/banks";

export default function ProfilePage() {
  const { user, switchUser } = useAuth();
  const [bankName, setBankName] = useState(user?.bank_name || "Maybank");
  const [accountNum, setAccountNum] = useState(user?.bank_account_number || "114012345678");
  const [phone, setPhone] = useState(user?.phone || "+60 12-345 6789");
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    if (!user) return;
    db.updateProfile(user.id, {
      bank_name: bankName,
      bank_account_number: accountNum,
      phone,
    });
    switchUser(user.id);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <AppLayout>
      <div className="space-y-6 max-w-3xl mx-auto">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <UserCircle className="w-6 h-6 text-emerald-700" />
            My Profile & Bank Details
          </h1>
          <p className="text-xs text-slate-500">
            Keep your bank account information up to date so Finance can disburse approved reimbursement claims.
          </p>
        </div>

        {saved && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold rounded-xl flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>Profile and banking details updated successfully.</span>
          </div>
        )}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold">Personal & Ministry Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-slate-400 block mb-1">Full Name</span>
                <strong className="text-slate-900 text-sm">{user?.full_name}</strong>
              </div>
              <div>
                <span className="text-slate-400 block mb-1">Email Address</span>
                <strong className="text-slate-900">{user?.email}</strong>
              </div>
            </div>

            <div className="space-y-1 pt-2">
              <label className="font-semibold text-slate-700">Mobile Phone Number</label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-emerald-700" />
              Reimbursement Bank Account
            </CardTitle>
            <CardDescription className="text-xs">
              Official Malaysian banking account for EFT / DuitNow bank transfers.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Bank Name</label>
                <select
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
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
                <label className="font-semibold text-slate-700">Account Number</label>
                <Input
                  value={accountNum}
                  onChange={(e) => setAccountNum(e.target.value)}
                  className="font-mono font-bold"
                />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button onClick={handleSave} className="bg-emerald-700 hover:bg-emerald-800 text-white font-semibold">
                Save Bank Information
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
