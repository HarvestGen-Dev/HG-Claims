"use client";
import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BrandLogo } from "@/components/BrandLogo";

export function PasswordRecovery({ reset = false }: { reset?: boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError("");
    if (reset && password !== confirmation) { setError("Passwords do not match."); return; }
    setBusy(true);
    try {
      const client = createClient();
      if (reset) {
        const { data: { user } } = await client.auth.getUser();
        if (!user) throw new Error("This link has expired. Request a new password reset link.");
        const { error } = await client.auth.updateUser({ password });
        if (error) throw error;
        await client.auth.signOut();
      } else {
        const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + "/auth/callback?next=/reset-password" });
        if (error) throw error;
      }
      setDone(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to complete the request."); }
    finally { setBusy(false); }
  }
  return <main className="auth-page"><div className="auth-content">
    <BrandLogo className="mb-8" priority /><h1 className="text-2xl font-semibold mb-6">{reset ? "Set your password" : "Reset password"}</h1>
    {done ? <p role="status" className="text-sm">{reset ? "Your password has been updated. Sign in to continue." : "If the address has an account, a password reset link will arrive shortly."}</p> :
      <form onSubmit={submit} className="space-y-4">
        {reset ? <>
          <label className="block text-sm" htmlFor="new-password">New password</label>
          <Input id="new-password" type="password" autoComplete="new-password" minLength={12} value={password} onChange={event => setPassword(event.target.value)} required />
          <label className="block text-sm" htmlFor="confirm-password">Confirm password</label>
          <Input id="confirm-password" type="password" autoComplete="new-password" minLength={12} value={confirmation} onChange={event => setConfirmation(event.target.value)} required />
          <p className="text-xs text-zinc-500">At least 12 characters.</p>
        </> : <>
          <label className="block text-sm" htmlFor="recovery-email">Email address</label>
          <Input id="recovery-email" type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} required />
        </>}
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <Button className="w-full" disabled={busy}>{busy ? "Please wait..." : reset ? "Save password" : "Send reset link"}</Button>
      </form>}
    <Link href="/login" className="inline-block mt-6 text-sm text-emerald-700">Back to sign in</Link>
  </div></main>;
}
