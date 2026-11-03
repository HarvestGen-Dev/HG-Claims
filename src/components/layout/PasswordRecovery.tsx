"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Loader2, CheckCircle2, Eye, EyeOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BrandLogo } from "@/components/BrandLogo";

export function PasswordRecovery({ reset = false }: { reset?: boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");

    if (reset) {
      if (password.length < 8) {
        setError("Password must be at least 8 characters long.");
        return;
      }
      if (password !== confirmation) {
        setError("Passwords do not match.");
        return;
      }
    }

    setBusy(true);
    try {
      const client = createClient();
      if (reset) {
        const { data: { user } } = await client.auth.getUser();
        if (!user) throw new Error("This link has expired or is invalid. Request a new password reset link.");
        const { error } = await client.auth.updateUser({ password });
        if (error) throw error;
        await client.auth.signOut();
      } else {
        const { error } = await client.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: window.location.origin + "/auth/callback?next=/reset-password",
        });
        if (error) throw error;
      }
      setDone(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to complete the request. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <header className="auth-brand">
        <BrandLogo priority />
      </header>
      <main className="auth-content">
        <p className="text-sm font-medium text-zinc-600 mb-3">
          {reset ? "Account security" : "Password recovery"}
        </p>
        <h1 className="text-3xl font-semibold mb-3">
          {reset ? "Set new password" : "Forgot password"}
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-8">
          {reset
            ? "Create a new secure password for your expense portal account."
            : "Enter your registered email address and we'll send you a password reset link."}
        </p>

        {done ? (
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 p-5 space-y-4 text-left">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-zinc-900 dark:text-zinc-100 mt-0.5 shrink-0" />
              <div>
                <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  {reset ? "Password updated" : "Check your inbox"}
                </h2>
                <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1 leading-relaxed">
                  {reset
                    ? "Your password has been reset successfully. You can now sign in with your new credentials."
                    : `If an account is associated with ${email || "your address"}, you will receive instructions to reset your password shortly.`}
                </p>
              </div>
            </div>
            <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800">
              <Link href="/login" className="block">
                <Button className="w-full h-10 text-xs bg-zinc-900 hover:bg-zinc-800 text-white">
                  Continue to Sign In
                </Button>
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-5">
            {reset ? (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="new-password">
                    New password
                  </label>
                  <div className="relative">
                    <Input
                      id="new-password"
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
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                      tabIndex={-1}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="confirm-password">
                    Confirm new password
                  </label>
                  <div className="relative">
                    <Input
                      id="confirm-password"
                      type={showConfirmation ? "text" : "password"}
                      autoComplete="new-password"
                      placeholder="Re-enter new password"
                      value={confirmation}
                      onChange={(e) => setConfirmation(e.target.value)}
                      required
                      disabled={busy}
                      className="h-11 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmation(!showConfirmation)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                      tabIndex={-1}
                      aria-label={showConfirmation ? "Hide password" : "Show password"}
                    >
                      {showConfirmation ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="recovery-email">
                  Email address
                </label>
                <Input
                  id="recovery-email"
                  type="email"
                  autoComplete="email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={busy}
                  className="h-11"
                />
              </div>
            )}

            {error && (
              <p role="alert" className="text-sm text-red-700">
                {error}
              </p>
            )}

            <Button disabled={busy} className="w-full h-11 gap-2" type="submit">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {busy
                ? reset
                  ? "Saving password..."
                  : "Sending link..."
                : reset
                ? "Save new password"
                : "Send reset link"}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </form>
        )}

        <div className="mt-6">
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 text-sm text-zinc-700 hover:text-zinc-900 hover:underline"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to sign in</span>
          </Link>
        </div>
      </main>
      <footer className="auth-footer">Harvest Generation &middot; Claims Management</footer>
    </div>
  );
}
