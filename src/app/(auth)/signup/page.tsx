"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Loader2, ShieldCheck, Eye, EyeOff, AlertCircle, Building2 } from "lucide-react";
import { useAuth } from "@/lib/auth/context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";

function SignupContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("invite");
  const { login, isAuthenticated, isLoading: authLoading } = useAuth();

  const [loadingInvite, setLoadingInvite] = useState(true);
  const [inviteData, setInviteData] = useState<{
    valid: boolean;
    role_code?: string;
    ministry_name?: string | null;
    description?: string | null;
    error?: string;
  } | null>(null);

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

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;

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
        body: JSON.stringify({ token, email, password }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Unable to create your account.");
      }

      // Automatically sign in
      const signedIn = await login(email, password);
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
        <p className="text-sm font-medium text-emerald-700 mb-2">Account Registration</p>
        <h1 className="text-3xl font-semibold mb-6">Create Your Account</h1>

        {loadingInvite ? (
          <div className="py-12 flex flex-col items-center justify-center space-y-3 text-slate-500">
            <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
            <p className="text-sm">Verifying invitation link...</p>
          </div>
        ) : !inviteData?.valid ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-5 text-left space-y-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <h2 className="text-sm font-semibold text-amber-900">Invitation Required</h2>
                <p className="text-sm text-amber-700 mt-1">
                  {inviteData?.error || "Registration is by invitation only. Please contact an NLCC administrator to request an invitation link."}
                </p>
              </div>
            </div>
            <div className="pt-2 border-t border-amber-200">
              <Link href="/login">
                <Button variant="outline" className="w-full text-slate-700">
                  Return to Sign In
                </Button>
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Invitation Details Banner */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-500 uppercase tracking-wider">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                Invited Role Assignment
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Badge className="bg-emerald-100 text-emerald-800 font-semibold hover:bg-emerald-100 px-2.5 py-1 text-xs">
                  {roleLabels[inviteData.role_code || ""] || inviteData.role_code}
                </Badge>
                {inviteData.ministry_name && (
                  <Badge variant="outline" className="text-slate-700 flex items-center gap-1 text-xs bg-white">
                    <Building2 className="h-3 w-3 text-slate-400" />
                    {inviteData.ministry_name}
                  </Badge>
                )}
              </div>
              {inviteData.description && (
                <p className="text-xs text-slate-500 italic mt-1">&ldquo;{inviteData.description}&rdquo;</p>
              )}
            </div>

            <form className="space-y-4" onSubmit={handleSignup}>
              <div className="space-y-1.5">
                <label htmlFor="email" className="text-sm font-medium text-slate-700">
                  Email Address
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
                  className="h-11"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="password" className="text-sm font-medium text-slate-700">
                  Password
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
                    className="h-11 pr-10"
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
                <label htmlFor="confirm-password" className="text-sm font-medium text-slate-700">
                  Confirm Password
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
                    className="h-11 pr-10"
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

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-red-500" />
                  <span>{error}</span>
                </div>
              )}

              <Button disabled={busy} className="w-full h-11 gap-2 mt-2" type="submit">
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {busy ? "Creating Account..." : "Create Account"}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </form>

            <p className="text-center text-xs text-slate-500 pt-2">
              Already have an account?{" "}
              <Link href="/login" className="text-emerald-700 font-medium hover:underline">
                Sign in
              </Link>
            </p>
          </div>
        )}
      </main>
      <footer className="auth-footer">NewLife Community Church &middot; Expenses</footer>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-sm text-slate-500">Loading...</div>}>
      <SignupContent />
    </Suspense>
  );
}
