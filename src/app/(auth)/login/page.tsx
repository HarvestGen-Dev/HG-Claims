"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth/context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";

export default function LoginPage() {
  const { login, isAuthenticated, isLoading, error: authError } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!isLoading && isAuthenticated) router.replace("/dashboard");
  }, [isLoading, isAuthenticated, router]);
  async function signIn(address: string) {
    setBusy(true);
    setError("");
    try {
      if (await login(address, password)) router.replace("/dashboard");
      else setError("Email or password is incorrect.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to sign in. Please try again.");
    } finally { setBusy(false); }
  }
  return (
    <div className="auth-page">
      <header className="auth-brand"><BrandLogo priority /></header>
      <main className="auth-content">
        <p className="text-sm font-medium text-zinc-600 mb-3">Expense portal</p>
        <h1 className="text-3xl font-semibold mb-8">Sign in</h1>
        <form className="space-y-5" onSubmit={(event) => { event.preventDefault(); void signIn(email); }}>
          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium">Email address</label>
            <Input id="email" type="email" autoComplete="username" placeholder="name@example.com" value={email} onChange={event => setEmail(event.target.value)} required disabled={busy || isLoading} className="h-11" />
          </div>
          <div className="space-y-2">
            <label htmlFor="password" className="text-sm font-medium">Password</label>
            <Input id="password" type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required disabled={busy} className="h-11" />
          </div>
          {(error || authError) && <p role="alert" className="text-sm text-red-700">{error || authError}</p>}
          <Button disabled={busy || isLoading} className="w-full h-11 gap-2" type="submit">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {busy ? "Signing in..." : "Continue"}<ArrowRight className="h-4 w-4" />
          </Button>
        </form>
        <Link href="/forgot-password" className="inline-block mt-6 text-sm text-zinc-700 hover:text-zinc-900 hover:underline">Forgot password?</Link>
      </main>
      <footer className="auth-footer">Harvest Generation &middot; Expenses</footer>
    </div>
  );
}
