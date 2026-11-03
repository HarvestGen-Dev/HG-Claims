"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  Loader2,
  ShieldCheck,
  Eye,
  EyeOff,
  AlertCircle,
  Building2,
  CheckCircle2,
  Check,
  User,
  Mail,
  Lock,
  Users,
} from "lucide-react";
import { useAuth } from "@/lib/auth/context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";

function SignupContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("invite") || searchParams.get("token");
  const { login, isAuthenticated, isLoading: authLoading } = useAuth();

  const [loadingInvite, setLoadingInvite] = useState(true);
  const [inviteData, setInviteData] = useState<{
    valid: boolean;
    role_code?: string;
    ministry_name?: string | null;
    description?: string | null;
    is_multi_user?: boolean;
    error?: string;
  } | null>(null);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [isMultiUser, setIsMultiUser] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      router.replace("/dashboard");
    }
  }, [authLoading, isAuthenticated, router]);

  useEffect(() => {
    if (!token) {
      setInviteData({ valid: false, error: "An invitation token is required to create an account." });
      setLoadingInvite(false);
      return;
    }

    async function checkToken() {
      setLoadingInvite(true);
      try {
        const res = await fetch(`/api/invitations/validate?token=${encodeURIComponent(token!)}`);
        const data = await res.json();
        if (res.ok && data.valid) {
          setInviteData(data);
          setIsMultiUser(Boolean(data.is_multi_user));
        } else {
          setInviteData({ valid: false, error: data.error || "This invitation link is invalid or has expired." });
        }
      } catch {
        setInviteData({ valid: false, error: "Unable to verify the invitation. Please check your network and try again." });
      } finally {
        setLoadingInvite(false);
      }
    }

    void checkToken();
  }, [token]);

  // Password Strength Evaluation
  const passwordCriteria = useMemo(() => {
    const hasMinLength = password.length >= 8;
    const hasUppercase = /[A-Z]/.test(password);
    const hasLowercase = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecial = /[^A-Za-z0-9]/.test(password);
    const hasGoodLength = password.length >= 12;

    let score = 0;
    if (hasMinLength) score += 1;
    if (hasUppercase && hasLowercase) score += 1;
    if (hasNumber) score += 1;
    if (hasSpecial) score += 1;
    if (hasGoodLength) score += 1;

    let label = "Very Weak";
    let color = "bg-rose-500";
    let textColor = "text-rose-600";
    let width = "20%";

    if (password.length === 0) {
      label = "";
      color = "bg-slate-200";
      textColor = "text-slate-400";
      width = "0%";
    } else if (score === 1) {
      label = "Very Weak";
      color = "bg-rose-500";
      textColor = "text-rose-600";
      width = "20%";
    } else if (score === 2) {
      label = "Weak";
      color = "bg-orange-500";
      textColor = "text-orange-600";
      width = "40%";
    } else if (score === 3) {
      label = "Fair";
      color = "bg-amber-500";
      textColor = "text-amber-600";
      width = "60%";
    } else if (score === 4) {
      label = "Good";
      color = "bg-emerald-500";
      textColor = "text-emerald-600";
      width = "80%";
    } else if (score >= 5) {
      label = "Strong";
      color = "bg-emerald-600";
      textColor = "text-emerald-700 font-bold";
      width = "100%";
    }

    return {
      hasMinLength,
      hasUppercase,
      hasLowercase,
      hasUpperAndLower: hasUppercase && hasLowercase,
      hasNumber,
      hasSpecial,
      hasGoodLength,
      score,
      label,
      color,
      textColor,
      width,
    };
  }, [password]);

  const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword;
  const passwordsMismatch = confirmPassword.length > 0 && password !== confirmPassword;
  const isFormValid =
    fullName.trim().length > 0 &&
    email.trim().length > 0 &&
    passwordCriteria.hasMinLength &&
    passwordsMatch;

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;

    if (!fullName.trim()) {
      setError("Please enter your full name.");
      return;
    }

    if (!passwordCriteria.hasMinLength) {
      setError("Password must be at least 8 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setBusy(true);
    setError("");

    try {
      const res = await fetch("/api/invitations/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          email: email.trim(),
          password,
          fullName: fullName.trim(),
          is_multi_user: isMultiUser,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Unable to create your account.");
      }

      // Automatically sign in
      const signedIn = await login(email.trim(), password);
      if (signedIn) {
        router.replace("/onboarding");
      } else {
        router.replace("/login");
      }
    } catch (cause: any) {
      setError(cause instanceof Error ? cause.message : "Registration failed.");
    } finally {
      setBusy(false);
    }
  }

  const roleLabels: Record<string, string> = {
    MINISTRY_LEADER: "Ministry Leader",
    FINANCE_OFFICER: "Finance Officer",
    SYSTEM_ADMIN: "System Administrator",
  };

  return (
    <div className="auth-page">
      <header className="auth-brand">
        <BrandLogo priority />
      </header>
      <main className="auth-content max-w-md">
        <p className="text-sm font-medium text-zinc-600 mb-2">Account Registration</p>
        <h1 className="text-3xl font-semibold mb-6">Create Your Account</h1>

        {loadingInvite ? (
          <div className="py-12 flex flex-col items-center justify-center space-y-3 text-slate-500">
            <Loader2 className="h-6 w-6 animate-spin text-zinc-900" />
            <p className="text-sm font-medium">Verifying invitation link...</p>
          </div>
        ) : !inviteData?.valid ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-5 text-left space-y-4 shadow-sm">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <h2 className="text-sm font-semibold text-amber-900">Invitation Required</h2>
                <p className="text-xs text-amber-700 mt-1 leading-relaxed">
                  {inviteData?.error || "Registration is by invitation only. Please contact a Harvest Generation administrator to request an invitation link."}
                </p>
              </div>
            </div>
            <div className="pt-2 border-t border-amber-200">
              <Link href="/login">
                <Button variant="outline" className="w-full text-xs text-slate-700">
                  Return to Sign In
                </Button>
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-5 text-left">
            {/* Invitation Details Banner */}
            <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 space-y-2">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                <ShieldCheck className="h-4 w-4 text-zinc-900" />
                <span>Invited System Role</span>
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-0.5">
                <Badge className="bg-zinc-900 text-white font-semibold hover:bg-zinc-800 px-2.5 py-1 text-xs">
                  {roleLabels[inviteData.role_code || ""] || inviteData.role_code}
                </Badge>
                {inviteData.ministry_name && (
                  <Badge variant="outline" className="text-slate-700 flex items-center gap-1 text-xs bg-white border-slate-300">
                    <Building2 className="h-3 w-3 text-slate-400" />
                    {inviteData.ministry_name}
                  </Badge>
                )}
              </div>
              {inviteData.description && (
                <p className="text-xs text-slate-500 italic pt-0.5">&ldquo;{inviteData.description}&rdquo;</p>
              )}
            </div>

            <form className="space-y-4" onSubmit={handleSignup}>
              {/* Multi-User Account Toggle */}
              <label className="flex items-start justify-between gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50/80 cursor-pointer hover:bg-slate-100/70 transition-colors">
                <div className="flex items-start gap-2.5">
                  <Users className="h-4 w-4 text-zinc-900 mt-0.5 shrink-0" />
                  <div>
                    <div className="text-xs font-semibold text-slate-900">
                      Multi-User Account (Shared by Multiple Claimants)
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                      Enable if multiple people use this account. You won&apos;t be prompted for a personal bank account after creation — bank profiles are selected or added on the Claim page.
                    </div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={isMultiUser}
                  onChange={(e) => setIsMultiUser(e.target.checked)}
                  disabled={busy}
                  className="mt-1 h-4 w-4 rounded border-slate-300 text-zinc-900 focus:ring-zinc-900 accent-zinc-900 shrink-0"
                />
              </label>

              {/* Full Name */}
              <div className="space-y-1.5">
                <label htmlFor="full-name" className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-slate-400" />
                  <span>Full Name</span>
                </label>
                <Input
                  id="full-name"
                  type="text"
                  autoComplete="name"
                  placeholder="e.g. Pastor David Tan"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  disabled={busy}
                  className="h-11 text-xs"
                />
              </div>

              {/* Email Address */}
              <div className="space-y-1.5">
                <label htmlFor="email" className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-slate-400" />
                  <span>Email Address</span>
                </label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={busy}
                  className="h-11 text-xs"
                />
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <label htmlFor="password" className="text-xs font-semibold text-slate-700 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-slate-400" />
                    <span>Password</span>
                  </span>
                  {password && (
                    <span className={`text-[11px] font-semibold ${passwordCriteria.textColor}`}>
                      {passwordCriteria.label}
                    </span>
                  )}
                </label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="Create a strong password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={busy}
                    className="h-11 pr-10 text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    tabIndex={-1}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>

                {/* Password Strength Meter Bar */}
                {password.length > 0 && (
                  <div className="space-y-2 pt-1">
                    <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 rounded-full ${passwordCriteria.color}`}
                        style={{ width: passwordCriteria.width }}
                      />
                    </div>

                    {/* Criteria Checklist */}
                    <div className="grid grid-cols-2 gap-1.5 pt-1 text-[11px] text-slate-500">
                      <div className={`flex items-center gap-1.5 ${passwordCriteria.hasMinLength ? "text-emerald-700 font-medium" : ""}`}>
                        {passwordCriteria.hasMinLength ? (
                          <Check className="w-3 h-3 text-emerald-600 shrink-0" />
                        ) : (
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-300 ml-1 mr-0.5 shrink-0" />
                        )}
                        <span>8+ characters</span>
                      </div>

                      <div className={`flex items-center gap-1.5 ${passwordCriteria.hasUpperAndLower ? "text-emerald-700 font-medium" : ""}`}>
                        {passwordCriteria.hasUpperAndLower ? (
                          <Check className="w-3 h-3 text-emerald-600 shrink-0" />
                        ) : (
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-300 ml-1 mr-0.5 shrink-0" />
                        )}
                        <span>Upper & lower case</span>
                      </div>

                      <div className={`flex items-center gap-1.5 ${passwordCriteria.hasNumber ? "text-emerald-700 font-medium" : ""}`}>
                        {passwordCriteria.hasNumber ? (
                          <Check className="w-3 h-3 text-emerald-600 shrink-0" />
                        ) : (
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-300 ml-1 mr-0.5 shrink-0" />
                        )}
                        <span>At least 1 number</span>
                      </div>

                      <div className={`flex items-center gap-1.5 ${passwordCriteria.hasSpecial ? "text-emerald-700 font-medium" : ""}`}>
                        {passwordCriteria.hasSpecial ? (
                          <Check className="w-3 h-3 text-emerald-600 shrink-0" />
                        ) : (
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-300 ml-1 mr-0.5 shrink-0" />
                        )}
                        <span>1 special symbol</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Confirm Password */}
              <div className="space-y-1.5">
                <label htmlFor="confirm-password" className="text-xs font-semibold text-slate-700 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-slate-400" />
                    <span>Confirm Password</span>
                  </span>
                  {passwordsMatch && (
                    <span className="text-[11px] font-semibold text-emerald-600 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      Passwords match
                    </span>
                  )}
                  {passwordsMismatch && (
                    <span className="text-[11px] font-semibold text-rose-600 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      Passwords do not match
                    </span>
                  )}
                </label>
                <div className="relative">
                  <Input
                    id="confirm-password"
                    type={showConfirm ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="Re-enter password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    disabled={busy}
                    className={`h-11 pr-10 text-xs ${
                      passwordsMismatch
                        ? "border-rose-300 focus-visible:ring-rose-500"
                        : passwordsMatch
                        ? "border-emerald-300 focus-visible:ring-emerald-500"
                        : ""
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(!showConfirm)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    tabIndex={-1}
                    aria-label={showConfirm ? "Hide password" : "Show password"}
                  >
                    {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-start gap-2 animate-in fade-in">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-red-500" />
                  <span>{error}</span>
                </div>
              )}

              <Button
                type="submit"
                loading={busy}
                disabled={busy || !isFormValid}
                className="w-full h-11 gap-2 mt-2 font-semibold text-xs shadow-md"
              >
                {!busy && (
                  <>
                    <span>Create Account & Sign In</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
                {busy && <span>Creating Account...</span>}
              </Button>
            </form>

            <p className="text-center text-xs text-slate-500 pt-2">
              Already have an account?{" "}
              <Link href="/login" className="text-zinc-900 font-semibold hover:underline">
                Sign in
              </Link>
            </p>
          </div>
        )}
      </main>
      <footer className="auth-footer">Harvest Generation &middot; Claims Management</footer>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-xs text-slate-500">Loading...</div>}>
      <SignupContent />
    </Suspense>
  );
}
