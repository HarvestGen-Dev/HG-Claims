"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  Loader2,
  Eye,
  EyeOff,
  AlertCircle,
} from "lucide-react";
import { useAuth } from "@/lib/auth/context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
    error?: string;
  } | null>(null);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
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

  const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword;
  const passwordsMismatch = confirmPassword.length > 0 && password !== confirmPassword;
  const isFormValid =
    fullName.trim().length > 0 &&
    email.trim().length > 0 &&
    password.length >= 8 &&
    passwordsMatch;

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;

    if (!fullName.trim()) {
      setError("Please enter your full name.");
      return;
    }

    if (password.length < 8) {
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
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Registration failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <header className="auth-brand">
        <BrandLogo priority />
      </header>
      <main className="auth-content max-w-md">
        <h1 className="text-3xl font-semibold mb-6">Create your account</h1>

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
            <form className="space-y-4" onSubmit={handleSignup}>
              {/* Full name */}
              <div className="space-y-1.5">
                <label htmlFor="full-name" className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <span>Full name</span>
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

              {/* Email address */}
              <div className="space-y-1.5">
                <label htmlFor="email" className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <span>Email address</span>
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
                    <span>Password</span>
                  </span>
                </label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    aria-describedby="password-hint"
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={busy}
                    className="h-11 pr-10 text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-1 top-0 grid h-11 w-8 place-items-center text-slate-400 hover:text-slate-600"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>

                <p id="password-hint" className="text-sm text-muted-foreground">Use at least 8 characters.</p>
              </div>

              {/* Confirm password */}
              <div className="space-y-1.5">
                <label htmlFor="confirm-password" className="text-xs font-semibold text-slate-700 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <span>Confirm password</span>
                  </span>
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
                    className="absolute right-1 top-0 grid h-11 w-8 place-items-center text-slate-400 hover:text-slate-600"
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
                    <span>Create account</span>
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
