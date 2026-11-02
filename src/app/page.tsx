"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/context";
import { isOnboardingCompleted } from "@/lib/auth/permissions";

export default function HomePage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash.includes("access_token=")) {
      return;
    }
    if (!isLoading) {
      if (isAuthenticated) {
        if (!isOnboardingCompleted(user)) {
          router.replace("/onboarding?invite=1");
        } else {
          router.replace("/dashboard");
        }
      } else {
        router.replace("/login");
      }
    }
  }, [isAuthenticated, isLoading, router, user]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
      <div className="flex flex-col items-center gap-3">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-zinc-900 border-t-transparent dark:border-zinc-100" />
        <p className="text-xs font-medium text-zinc-500">Loading Harvest Generation Expense Portal...</p>
      </div>
    </div>
  );
}
