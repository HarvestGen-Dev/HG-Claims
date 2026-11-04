"use client";


import { Select } from "@/components/ui/select";
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  Loader2,
  Phone,
  User,
  Lock,
  Eye,
  EyeOff,
  Landmark,
  CreditCard,
} from "lucide-react";
import { useAuth } from "@/lib/auth/context";
import { iamClient } from "@/lib/domains";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  const isMultiUser = Boolean(user?.is_multi_user);
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

    let normalizedAccount = "";
    let holderName = "";

    if (!isMultiUser) {
      if (!selectedBank) {
        setError("Please select your reimbursement bank from the directory.");
        return;
      }

      const acctCheck = validateBankAccountString(bankAccountNumber);
      if (!acctCheck.valid) {
        setError(acctCheck.error || "Please enter a valid bank account number.");
        return;
      }

      holderName = bankAccountHolderName.trim() || trimmed;
      if (!holderName) {
        setError("Please enter the legal account-holder name as registered with your bank.");
        return;
      }
      normalizedAccount = acctCheck.normalized;
    }

    if (isInviteFlow) {
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
      // Email invitations create an account without a password.
      if (isInviteFlow) {
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
        ...(selectedBank && !isMultiUser
          ? {
              bank_name: selectedBank.name,
              bank_code: selectedBank.swiftCode,
              bank_account_holder_name: holderName,
              bank_account_number: normalizedAccount,
              beneficiary_new_ic: beneficiaryNewIc.trim() || undefined,
              beneficiary_address: beneficiaryAddress.trim() || undefined,
            }
          : {}),
      });

      // 3. Refresh auth context so user state is updated
      await refreshUser();

      // 4. Flash welcome toast
      showToast.flashSuccess(
        "Your profile is ready.",
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

  if (isLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin mr-2 text-zinc-900" />
        Verifying your invitation and loading account details...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col justify-between py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-lg w-full mx-auto space-y-6">
        <div className="text-center">
          <BrandLogo className="mx-auto" priority />
          <h1 className="mt-3 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            Finish setting up
          </h1>
          <p className="mt-1.5 break-all text-sm text-muted-foreground">
            {user.email}
          </p>
        </div>

        <div className="bg-white py-6 px-6 shadow-sm border border-slate-200 rounded-xl sm:px-8 space-y-5">
          <form className="space-y-4" onSubmit={handleSubmit}>
            {/* Section 1: Personal Details */}
            <div className="space-y-3">
              <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                Personal details
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
                    className="h-11"
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
                    className="h-11"
                  />
                </div>
              </div>
            </div>

            {/* Section 2: Reimbursement Bank Details (Only required for single-user accounts) */}
            {!isMultiUser && (
            <div className="pt-3 border-t border-slate-100 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                  Bank details
                </span>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="bankCode"
                  className="text-xs font-semibold text-slate-700 flex items-center gap-1.5"
                >
                  <Landmark className="h-3.5 w-3.5 text-slate-400" />
                  Bank <span className="text-red-500">*</span>
                </label>
                <Select
                  id="bankCode"
                  value={bankCode}
                  onChange={(e) => setBankCode(e.target.value)}
                  required={!isMultiUser}
                  disabled={busy}
                  className="w-full"
                >
                  <option value="">Choose a bank</option>
                  {MALAYSIAN_BANKS.map((bank) => (
                    <option key={bank.swiftCode} value={bank.swiftCode}>
                      {bank.name}
                    </option>
                  ))}
                </Select>
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
                    required={!isMultiUser}
                    disabled={busy}
                    className="h-11"
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
                    required={!isMultiUser}
                    disabled={busy}
                    className="h-11 font-mono tracking-wider"
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
                        New IC No.
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
                        Beneficiary Address
                      </label>
                      <Input
                        type="text"
                        placeholder="City / State"
                        value={beneficiaryAddress}
                        onChange={(e) => setBeneficiaryAddress(e.target.value)}
                        disabled={busy}
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
            )}

            {isInviteFlow && (
              <div className="pt-3 border-t border-slate-100 space-y-3">
                <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                  Account security
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="password"
                    className="text-xs font-semibold text-slate-700 flex items-center gap-1.5"
                  >
                    <Lock className="h-3.5 w-3.5 text-slate-400" />
                    Set Account Password{" "}
                    <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      placeholder="At least 8 characters"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
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
                      required
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
              </div>
            )}

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-md text-xs text-red-700">
                {error}
              </div>
            )}

            <Button
              disabled={busy}
              className="w-full h-11 gap-2 mt-4"
              type="submit"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {busy ? "Saving…" : "Finish setup"}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </div>

      <footer className="text-center text-xs text-slate-400 mt-8">
        Harvest Generation &middot; Claims Management
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
