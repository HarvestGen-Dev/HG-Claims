"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { ArrowLeft, Mail, CheckCircle2 } from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email) setSubmitted(true);
  };

  return (
    <div className="flex min-h-screen bg-zinc-50 dark:bg-zinc-950 items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-sm border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Reset Password
          </CardTitle>
          <CardDescription className="text-xs text-zinc-500">
            Enter your church email address and we'll send you instructions to recover access.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {submitted ? (
            <div className="space-y-4 text-center py-4 animate-in fade-in duration-200">
              <div className="h-10 w-10 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">Reset instructions sent</p>
                <p className="text-xs text-zinc-500 mt-1">
                  We've sent a recovery link to <strong>{email}</strong>.
                </p>
              </div>
              <Link href="/login" className="inline-block mt-2">
                <Button variant="outline" size="sm" className="text-xs h-8">Return to Login</Button>
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3.5">
              <div className="space-y-1">
                <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 w-4 h-4 text-zinc-400" />
                  <Input
                    type="email"
                    placeholder="name@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-9 text-xs h-9"
                    required
                  />
                </div>
              </div>

              <Button type="submit" className="w-full bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:text-zinc-900 text-xs font-medium h-9">
                Send Reset Link
              </Button>

              <div className="text-center pt-2">
                <Link href="/login" className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 inline-flex items-center gap-1.5 transition-colors">
                  <ArrowLeft className="w-3.5 h-3.5" /> Back to sign in
                </Link>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
