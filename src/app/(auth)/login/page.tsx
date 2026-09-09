"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { 
  AlertCircle, 
  Lock, 
  Mail, 
  Eye, 
  EyeOff, 
  ShieldCheck, 
  ArrowRight,
  ChevronDown,
  Building2,
  Users
} from "lucide-react";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const { login, allUsers, isAuthenticated, isLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showQuickAccounts, setShowQuickAccounts] = useState(false);

  // If already authenticated, redirect to dashboard
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace("/dashboard");
    }
  }, [isAuthenticated, isLoading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError("Please enter your email address");
      return;
    }
    try {
      setLoading(true);
      setError("");
      const success = await login(email.trim(), password);
      if (success) {
        router.push("/dashboard");
      } else {
        setError("Invalid email address. Please check your credentials or select an authorized account below.");
      }
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSelectAccount = async (accountEmail: string) => {
    setEmail(accountEmail);
    setPassword("••••••••••••");
    setError("");
    setLoading(true);
    try {
      const success = await login(accountEmail);
      if (success) {
        router.push("/dashboard");
      }
    } finally {
      setLoading(false);
    }
  };

  const roleBadgeMap: Record<string, { label: string; color: string }> = {
    SYSTEM_ADMIN: { label: "System Admin", color: "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300" },
    FINANCE_OFFICER: { label: "Finance Officer", color: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300" },
    MINISTRY_LEADER: { label: "Ministry Leader", color: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
    FINAL_APPROVER: { label: "Senior Pastor", color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" },
    CLAIMANT: { label: "Staff / Claimant", color: "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300" },
  };

  return (
    <div className="flex min-h-screen bg-zinc-50 dark:bg-zinc-950 items-center justify-center p-4 selection:bg-zinc-200">
      <div className="w-full max-w-md space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 font-bold text-lg shadow-sm">
            NL
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
              NewLife Community Church
            </h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Expense Claim Management Portal
            </p>
          </div>
        </div>

        {/* Login Card */}
        <Card className="shadow-sm border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900">
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              Sign In
            </CardTitle>
            <CardDescription className="text-xs text-zinc-500">
              Enter your authorized email to access approvals, claims, and reimbursement workflows.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <div className="flex items-start gap-2.5 p-3 text-xs bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300 rounded-lg border border-rose-200/80 dark:border-rose-900/50 animate-in fade-in duration-200">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3.5">
              <div className="space-y-1">
                <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 w-4 h-4 text-zinc-400" />
                  <Input
                    type="email"
                    placeholder="e.g. admin@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-9 text-xs h-9"
                    required
                    autoFocus
                  />
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Password
                  </label>
                  <Link
                    href="/forgot-password"
                    className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors"
                  >
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 w-4 h-4 text-zinc-400" />
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-9 pr-9 text-xs h-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-2.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 focus:outline-none"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-800"
                  />
                  <span>Remember this session</span>
                </label>
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 text-xs font-medium h-9 mt-2 transition-all shadow-xs"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Signing in...
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-1.5">
                    Sign In <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                )}
              </Button>
            </form>

            {/* Authorized Directory Accounts Helper */}
            <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800/80">
              <button
                type="button"
                onClick={() => setShowQuickAccounts(!showQuickAccounts)}
                className="w-full flex items-center justify-between text-[11px] font-medium text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300 py-1 transition-colors"
              >
                <span className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-zinc-400" />
                  Authorized Directory Accounts (Quick Fill)
                </span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showQuickAccounts ? "rotate-180" : ""}`} />
              </button>

              {showQuickAccounts && (
                <div className="mt-2 space-y-1.5 animate-in fade-in duration-150">
                  {allUsers.map((u) => {
                    const primaryRole = u.roles?.[0] || "CLAIMANT";
                    const badge = roleBadgeMap[primaryRole] || { label: primaryRole, color: "bg-zinc-100 text-zinc-700" };
                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => handleSelectAccount(u.email)}
                        className="w-full flex items-center justify-between p-2 rounded-lg text-left text-xs bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-950/60 dark:hover:bg-zinc-800/60 border border-zinc-200/70 dark:border-zinc-800 transition-colors group"
                      >
                        <div className="min-w-0 pr-2">
                          <p className="font-semibold text-zinc-900 dark:text-zinc-100 truncate group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors">
                            {u.full_name}
                          </p>
                          <p className="text-[10px] text-zinc-400 truncate">{u.email}</p>
                        </div>
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded shrink-0 ${badge.color}`}>
                          {badge.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Security / System Footer */}
        <div className="text-center text-[11px] text-zinc-400 flex items-center justify-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          <span>NewLife Community Church Expense Claim Management System</span>
        </div>
      </div>
    </div>
  );
}
