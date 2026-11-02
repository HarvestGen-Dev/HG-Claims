"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth/context";
import { iamClient } from "@/lib/domains";
import { isRealFullName } from "@/lib/auth/permissions";
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { User, Phone, UserCheck, AlertCircle } from "lucide-react";
import { showToast } from "@/lib/utils/toast";

export function NamePromptDialog() {
  const { user, refreshUser } = useAuth();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const needsName = Boolean(user && !isRealFullName(user.full_name, user.email));

  useEffect(() => {
    if (user) {
      if (isRealFullName(user.full_name, user.email)) {
        setFullName(user.full_name);
      } else {
        setFullName("");
      }
      setPhone(user.phone || "");
    }
  }, [user]);

  if (!needsName) {
    return null;
  }

  const emailAlias = user?.email ? user.email.split("@")[0] : "";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = fullName.trim();

    if (!trimmed) {
      setError("Full name is required.");
      return;
    }

    if (!isRealFullName(trimmed, user?.email)) {
      setError(`"${trimmed}" is your email alias. Please enter your actual full name (e.g. Pastor David Tan).`);
      return;
    }

    setIsSaving(true);
    setError("");

    try {
      await iamClient.completeOnboarding({
        full_name: trimmed,
        phone: phone.trim() || undefined,
      });
      await refreshUser();
      showToast.success("Profile name updated successfully.", "Profile Updated");
    } catch (err: any) {
      setError(err instanceof Error ? err.message : "Unable to save your name.");
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
          <DialogTitle className="text-base font-bold">Please Enter Your Full Name</DialogTitle>
        </div>
        <p className="text-xs text-slate-500">
          Your official full name is required for expense reimbursement vouchers, financial audits, and approval signatures.
          {emailAlias && (
            <span className="block mt-1 text-[11px] text-amber-700 bg-amber-50 p-2 rounded border border-amber-200">
              Note: Email username (<strong>{emailAlias}</strong>) cannot be used as your account name.
            </span>
          )}
        </p>
      </DialogHeader>

      <form onSubmit={handleSubmit} className="space-y-4 my-2 text-xs">
        <div className="space-y-1.5">
          <label htmlFor="modal-fullname" className="font-semibold text-slate-700 flex items-center gap-1.5">
            <User className="w-3.5 h-3.5 text-slate-400" />
            <span>Full Name *</span>
          </label>
          <Input
            id="modal-fullname"
            type="text"
            autoComplete="name"
            autoFocus
            placeholder="e.g. Pastor David Tan"
            value={fullName}
            onChange={(e) => {
              setFullName(e.target.value);
              if (error) setError("");
            }}
            required
            disabled={isSaving}
            className="h-10 text-xs"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="modal-phone" className="font-semibold text-slate-700 flex items-center gap-1.5">
            <Phone className="w-3.5 h-3.5 text-slate-400" />
            <span>Mobile Phone Number <span className="text-slate-400 text-[10px] font-normal">(Optional)</span></span>
          </label>
          <Input
            id="modal-phone"
            type="tel"
            autoComplete="tel"
            placeholder="e.g. +60 12-345 6789"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={isSaving}
            className="h-10 text-xs"
          />
        </div>

        {error && (
          <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-start gap-2 animate-in fade-in">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-red-500" />
            <span>{error}</span>
          </div>
        )}

        <DialogFooter className="mt-6 pt-2">
          <Button
            type="submit"
            loading={isSaving}
            disabled={isSaving || !fullName.trim()}
            className="w-full bg-zinc-900 hover:bg-zinc-800 text-white font-semibold text-xs shadow-md h-10"
          >
            {isSaving ? "Saving Name..." : "Save Name & Continue"}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
