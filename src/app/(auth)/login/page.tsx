"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { AlertCircle, Lock, Mail, CheckCircle2, UserCheck, Shield } from "lucide-react";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const { login, allUsers, switchUser } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError("Please enter your email address");
      return;
    }
    try {
      setLoading(true);
      setError("");
      const success = await login(email);
      if (success) {
        router.push("/dashboard");
      } else {
        setError("Invalid email address or user not registered in system");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = async (userEmail: string, userId: string) => {
    switchUser(userId);
    await login(userEmail);
    router.push("/dashboard");
  };

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950 items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-800 text-white font-black text-2xl shadow-lg">
            NL
          </div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100">
            NewLife Community Church
          </h1>
          <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-400 uppercase tracking-wider">
            Expense Claim Management System
          </p>
        </div>

        {/* Login Card */}
        <Card className="shadow-lg border-slate-200 dark:border-slate-800">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Sign In to Your Account</CardTitle>
            <CardDescription className="text-xs">
              Enter your church email credentials to manage and approve expense claims.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <div className="flex items-center gap-2 p-3 text-xs bg-red-50 text-red-700 rounded-lg border border-red-200">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                  <Input
                    type="email"
                    placeholder="name@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-9 text-sm"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Password
                  </label>
                  <Link
                    href="/forgot-password"
                    className="text-xs text-emerald-700 hover:underline"
                  >
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                  <Input
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-9 text-sm"
                  />
                </div>
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-semibold py-2.5 mt-2"
              >
                {loading ? "Signing in..." : "Sign In"}
              </Button>
            </form>

            {/* Demo Quick Sign-in Section */}
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1">
                <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                1-Click Demo Personas (Instant Switch)
              </p>
              <div className="grid grid-cols-1 gap-1.5">
                {allUsers.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => handleQuickLogin(u.email, u.id)}
                    className="flex items-center justify-between p-2 rounded-lg text-left text-xs bg-slate-50 hover:bg-emerald-50 dark:bg-slate-900 hover:text-emerald-900 border border-slate-200 dark:border-slate-800 transition-colors"
                  >
                    <div>
                      <span className="font-semibold block text-slate-800 dark:text-slate-200">{u.full_name}</span>
                      <span className="text-[10px] text-slate-400">{u.email}</span>
                    </div>
                    <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 px-2 py-0.5 rounded">
                      {u.roles?.[0]}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Security Footer */}
        <div className="text-center text-xs text-slate-400 flex items-center justify-center gap-1">
          <Shield className="w-3.5 h-3.5 text-emerald-600" />
          <span>Protected with Row-Level Security & Role-Based Access Control</span>
        </div>
      </div>
    </div>
  );
}
