"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  Loader2,
  UserCheck,
  Phone,
  User,
  Lock,
  Eye,
  EyeOff,
  Mail,
  ShieldCheck,
  Landmark,
  CreditCard,
} from "lucide-react";
import { useAuth } from "@/lib/auth/context";
import { iamClient } from "@/lib/domains";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { BrandLogo } from "@/components/BrandLogo";
import { showToast } from "@/lib/utils/toast";
import { isRealFullName } from "@/lib/auth/permissions";
import {
  MALAYSIAN_BANKS,
  resolveCanonicalBank,
  validateBankAccountString,
} from "@/lib/constants/banks";

function OnboardingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isInviteFlow = searchParams.get("invite") === "1";
  const { user, refreshUser, isLoading } = useAuth();

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [bankCode, setBankCode] = useState("");
  const [bankAccountHolderName, setBankAccountHolderName] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [beneficiaryNewIc, setBeneficiaryNewIc] = useState("");
  const [beneficiaryAddress, setBeneficiaryAddress] = useState("");
  const [showOptionalBankFields, setShowOptionalBankFields] = useState(false);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash.includes("access_token=")) {
      return;
    }
    if (!isLoading) {
      if (!user) {
        router.replace("/login");
      } else if (
        !isInviteFlow &&
        user.onboarding_completed_at &&
        isRealFullName(user.full_name, user.email)
      ) {
        router.replace("/dashboard");
      } else {
        if (user.full_name && isRealFullName(user.full_name, user.email)) {
          setFullName(user.full_name);
          setBankAccountHolderName(user.bank_account_holder_name || user.full_name);
        }
        if (user.phone) {
          setPhone(user.phone);
        }
        const resolved = resolveCanonicalBank(user.bank_code || user.bank_name);
        if (resolved) {
          setBankCode(resolved.swiftCode);
        }
        if (user.bank_account_number) {
          setBankAccountNumber(user.bank_account_number);
        }
      }
    }
  }, [user, isLoading, isInviteFlow, router]);

  const selectedBank = resolveCanonicalBank(bankCode);

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

    if (!selectedBank) {
      setError("Please select your reimbursement bank from the directory.");
      return;
    }

    const acctCheck = validateBankAccountString(bankAccountNumber);
    if (!acctCheck.valid) {
      setError(acctCheck.error || "Please enter a valid bank account number.");
      return;
    }

    const holderName = (bankAccountHolderName.trim() || trimmed);
    if (!holderName) {
      setError("Please enter the legal account-holder name as registered with your bank.");
      return;
    }

    if (isInviteFlow || password.length > 0) {
      if (password.length < 8) {
        setError("Password must be at least 8 characters long.");
        return;
      }
      if (password !== confirmPassword) {
        setError("Passwords do not match.");
        return;
      }
    }

    setBusy(true);
    setError("");

    try {
      // 1. If password provided (email invitation flow), set the user's password in Supabase Auth
      if (password.length >= 8) {
        const client = createClient();
        const { error: pwError } = await client.auth.updateUser({
          password,
          data: { full_name: trimmed },
        });
        if (pwError) throw pwError;
      }

      // 2. Complete onboarding in IAM domain client including verified payee bank details
      await iamClient.completeOnboarding({
        full_name: trimmed,
        phone: phone.trim() || undefined,
        bank_name: selectedBank.name,
        bank_code: selectedBank.swiftCode,
        bank_account_holder_name: holderName,
        bank_account_number: acctCheck.normalized,
        beneficiary_new_ic: beneficiaryNewIc.trim() || undefined,
        beneficiary_address: beneficiaryAddress.trim() || undefined,
      });

      // 3. Refresh auth context so user state is updated
      await refreshUser();

      // 4. Flash welcome toast
      showToast.flashSuccess(
        "Welcome to Harvest Generation Expenses! Your profile and reimbursement bank details are saved.",
        "Registration Complete"
      );

      // 5. Navigate to dashboard
      router.replace("/dashboard");
    } catch (cause: unknown) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to complete registration. Please try again."
      );
    } finally {
      setBusy(false);
    }
  }

  const roleLabels: Record<string, string> = {
    MINISTRY_LEADER: "Ministry Leader",
    FINANCE_OFFICER: "Finance Officer",
    SYSTEM_ADMIN: "System Administrator",
  };

  if (isLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin mr-2 text-zinc-900" />
        Verifying your invitation and loading account details...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-lg w-full mx-auto space-y-6">
        <div className="text-center">
          <BrandLogo className="mx-auto" priority />
          <div className="inline-flex items-center gap-1.5 bg-zinc-100 border border-zinc-200 text-zinc-800 text-xs font-semibold px-3 py-1 rounded-full mt-5">
            <UserCheck className="h-3.5 w-3.5" />
            Account Registration & Reimbursement Setup
          </div>
          <h1 className="mt-3 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            Welcome to Harvest Generation
          </h1>
          <p className="mt-1.5 text-xs sm:text-sm text-slate-600">
            Complete your personal profile, default reimbursement bank account, and password.
          </p>
        </div>

        <div className="bg-white py-6 px-6 shadow-sm border border-slate-200 rounded-xl sm:px-8 space-y-5">
          {/* Account Summary Banner */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500 flex items-center gap-1.5 font-medium">
                <Mail className="h-3.5 w-3.5 text-slate-400" />
                {user.email}
              </span>
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-700">
                <ShieldCheck className="h-3.5 w-3.5 text-zinc-900" />
                Verified Invite
              </span>
            </div>
            {user.roles && user.roles.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {user.roles
                  .filter((r) => r !== "CLAIMANT")
                  .map((r) => (
                    <Badge
                      key={r}
                      className="bg-zinc-900 text-white hover:bg-zinc-800 text-[10px] px-2 py-0.5"
                    >
                      {roleLabels[r] || r}
                    </Badge>
                  ))}
              </div>
            )}
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            {/* Section 1: Personal Details */}
            <div className="space-y-3">
              <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                1. Personal Details
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label
                    htmlFor="fullName"
                    className="text-xs font-semibold text-slate-700 flex items-center gap-1.5"
                  >
                    <User className="h-3.5 w-3.5 text-slate-400" />
                    Full Name <span className="text-red-500">*</span>
                  </label>
                  <Input
                    id="fullName"
                    type="text"
                    autoComplete="name"
                    placeholder="e.g. Sarah Tan"
                    value={fullName}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (!bankAccountHolderName || bankAccountHolderName === fullName) {
                        setBankAccountHolderName(val);
                      }
                      setFullName(val);
                    }}
                    required
                    disabled={busy}
                    className="h-9 text-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="phone"
                    className="text-xs font-semibold text-slate-700 flex items-center gap-1.5"
                  >
                    <Phone className="h-3.5 w-3.5 text-slate-400" />
                    Mobile Phone
                  </label>
                  <Input
                    id="phone"
                    type="tel"
                    autoComplete="tel"
                    placeholder="+60 12-345 6789"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    disabled={busy}
                    className="h-9 text-xs"
                  />
                </div>
              </div>
            </div>

            {/* Section 2: Reimbursement Bank Details */}
            <div className="pt-3 border-t border-slate-100 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                  2. Reimbursement Bank Details
                </span>
                {selectedBank && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-mono font-semibold bg-zinc-100 text-zinc-800 px-2 py-0.5 rounded">
                    {selectedBank.swiftCode} &middot; {selectedBank.paymentMode}
                  </span>
                )}
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="bankCode"
                  className="text-xs font-semibold text-slate-700 flex items-center gap-1.5"
                >
                  <Landmark className="h-3.5 w-3.5 text-slate-400" />
                  Beneficiary Bank <span className="text-red-500">*</span>
                </label>
                <select
                  id="bankCode"
                  value={bankCode}
                  onChange={(e) => setBankCode(e.target.value)}
                  required
                  disabled={busy}
                  className="flex h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-900"
                >
                  <option value="">-- Select Bank from Directory --</option>
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
                    htmlFor="bankAccountHolderName"
                    className="text-xs font-semibold text-slate-700 block"
                  >
                    Beneficiary Legal Name <span className="text-red-500">*</span>
                  </label>
                  <Input
                    id="bankAccountHolderName"
                    type="text"
                    placeholder="Exact name on bank account"
                    value={bankAccountHolderName}
                    onChange={(e) => setBankAccountHolderName(e.target.value)}
                    required
                    disabled={busy}
                    className="h-9 text-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="bankAccountNumber"
                    className="text-xs font-semibold text-slate-700 flex items-center gap-1"
                  >
                    <CreditCard className="h-3.5 w-3.5 text-slate-400" />
                    Bank Account No. <span className="text-red-500">*</span>
                  </label>
                  <Input
                    id="bankAccountNumber"
                    type="text"
                    inputMode="numeric"
                    placeholder="e.g. 514012345678"
                    value={bankAccountNumber}
                    onChange={(e) => setBankAccountNumber(e.target.value)}
                    required
                    disabled={busy}
                    className="h-9 text-xs font-mono tracking-wider"
                  />
                </div>
              </div>

              <div>
                <button
                  type="button"
                  onClick={() => setShowOptionalBankFields(!showOptionalBankFields)}
                  className="text-[11px] font-medium text-zinc-600 hover:text-zinc-900 underline"
                >
                  {showOptionalBankFields
                    ? "Hide optional identity / address fields"
                    : "+ Add optional IC / Address for bank transfer (if required)"}
                </button>

                {showOptionalBankFields && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2.5 p-3 rounded-lg bg-slate-50 border border-slate-200/70">
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-slate-600 block">
                        New IC No. (Optional)
                      </label>
                      <Input
                        type="text"
                        placeholder="e.g. 900101145566"
                        value={beneficiaryNewIc}
                        onChange={(e) => setBeneficiaryNewIc(e.target.value)}
                        disabled={busy}
                        className="h-8 text-xs font-mono bg-white"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-slate-600 block">
                        Beneficiary Address (Optional)
                      </label>
                      <Input
                        type="text"
                        placeholder="City / State"
                        value={beneficiaryAddress}
                        onChange={(e) => setBeneficiaryAddress(e.target.value)}
                        disabled={busy}
                        className="h-8 text-xs bg-white"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Section 3: Password Setup */}
            <div className="pt-3 border-t border-slate-100 space-y-3">
              <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                3. Account Security
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="password"
                  className="text-xs font-semibold text-slate-700 flex items-center gap-1.5"
                >
                  <Lock className="h-3.5 w-3.5 text-slate-400" />
                  Set Account Password{" "}
                  {isInviteFlow ? (
                    <span className="text-red-500">*</span>
                  ) : (
                    <span className="text-slate-400 text-[11px] font-normal">(Optional)</span>
                  )}
                </label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="At least 8 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required={isInviteFlow}
                    disabled={busy}
                    className="h-9 pr-10 text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {(isInviteFlow || password.length > 0) && (
                <div className="space-y-1.5">
                  <label
                    htmlFor="confirmPassword"
                    className="text-xs font-semibold text-slate-700 flex items-center gap-1.5"
                  >
                    <Lock className="h-3.5 w-3.5 text-slate-400" />
                    Confirm Password <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Input
                      id="confirmPassword"
                      type={showConfirm ? "text" : "password"}
                      autoComplete="new-password"
                      placeholder="Re-enter your password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required={isInviteFlow || password.length > 0}
                      disabled={busy}
                      className="h-9 pr-10 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm(!showConfirm)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      tabIndex={-1}
                    >
                      {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-md text-xs text-red-700">
                {error}
              </div>
            )}

            <Button
              disabled={busy}
              className="w-full h-11 gap-2 mt-4 bg-zinc-900 hover:bg-zinc-800 text-white"
              type="submit"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {busy ? "Completing Registration..." : "Complete Registration & Enter Portal"}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </div>

      <footer className="text-center text-xs text-slate-400 mt-8">
        Harvest Generation &middot; Expenses
      </footer>
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-xs text-slate-500">
          Loading registration...
        </div>
      }
    >
      <OnboardingContent />
    </Suspense>
  );
}
