"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, UserCheck, Phone, User, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/lib/auth/context";
import { iamClient } from "@/lib/domains";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BrandLogo } from "@/components/BrandLogo";
import { showToast } from "@/lib/utils/toast";
import { isRealFullName } from "@/lib/auth/permissions";

export default function OnboardingPage() {
  const router = useRouter();
  const { user, refreshUser, isLoading } = useAuth();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isLoading) {
      if (!user) {
        router.replace("/login");
      } else if (user.onboarding_completed_at && isRealFullName(user.full_name, user.email)) {
        router.replace("/dashboard");
      } else if (user.full_name && isRealFullName(user.full_name, user.email)) {
        setFullName(user.full_name);
      }
    }
  }, [user, isLoading, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = fullName.trim();
    if (!trimmed) {
      setError("Please enter your full name.");
      return;
    }

    if (!isRealFullName(trimmed, user?.email)) {
      setError("Please enter your actual full name rather than your email username.");
      return;
    }

    setBusy(true);
    setError("");

    try {
      // 1. Complete onboarding in IAM domain client
      await iamClient.completeOnboarding({
        full_name: fullName.trim(),
        phone: phone.trim() || undefined,
      });

      // 2. Refresh auth context so user state is updated
      await refreshUser();

      // 3. Flash welcome toast
      showToast.flashSuccess("Welcome to NLCC Expenses! Your profile setup is complete.", "Profile Setup Complete");

      // 4. Navigate to dashboard
      router.replace("/dashboard");
    } catch (cause: any) {
      setError(cause instanceof Error ? cause.message : "Unable to complete onboarding. Please try again.");
    } finally {
      setBusy(false);
    }
  }


  if (isLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin mr-2 text-emerald-600" />
        Loading account details...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full mx-auto space-y-8">
        <div className="text-center">
          <BrandLogo className="mx-auto" priority />
          <div className="inline-flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold px-3 py-1 rounded-full mt-6">
            <UserCheck className="h-3.5 w-3.5" />
            Step 1 of 1 &middot; Profile Setup
          </div>
          <h1 className="mt-3 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            Welcome to NLCC Expenses
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Please tell us your name and contact details so your team and finance can identify you.
          </p>
        </div>

        <div className="bg-white py-8 px-6 shadow-sm border border-slate-200 rounded-xl sm:px-10">
          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="space-y-1.5">
              <label htmlFor="fullName" className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                <User className="h-4 w-4 text-slate-400" />
                Full Name <span className="text-red-500">*</span>
              </label>
              <Input
                id="fullName"
                type="text"
                autoComplete="name"
                placeholder="e.g. Sarah Tan"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                disabled={busy}
                className="h-11"
              />
              <p className="text-xs text-slate-500">This name will appear on all claims you submit or review.</p>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="phone" className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                <Phone className="h-4 w-4 text-slate-400" />
                Mobile Phone Number <span className="text-slate-400 text-xs">(Optional)</span>
              </label>
              <Input
                id="phone"
                type="tel"
                autoComplete="tel"
                placeholder="e.g. +60 12-345 6789"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={busy}
                className="h-11"
              />
              <p className="text-xs text-slate-500">For urgent payment notifications or claim inquiries.</p>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
                {error}
              </div>
            )}

            <Button disabled={busy} className="w-full h-11 gap-2 mt-4 bg-emerald-700 hover:bg-emerald-800 text-white" type="submit">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {busy ? "Saving Profile..." : "Get Started"}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </form>
        </div>

        <div className="text-center text-xs text-slate-400 flex items-center justify-center gap-1.5">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          No banking details required for this role.
        </div>
      </div>

      <footer className="text-center text-xs text-slate-400 mt-8">
        New Life Community Church &middot; Expenses
      </footer>
    </div>
  );
}
