"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { buttonVariants } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/context";

export default function HomePage() {
  const { isAuthenticated } = useAuth();

  return (
    <div className="auth-page">
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col">
        <header className="auth-brand border-b border-border pb-5">
          <BrandLogo />
        </header>

        <main className="flex flex-1 items-center py-16 sm:py-24">
          <section aria-labelledby="claims-title" className="max-w-xl">
            <h1 id="claims-title" className="text-5xl font-semibold leading-none tracking-tight sm:text-7xl">
              Expense claims
            </h1>
            <p className="mt-5 max-w-md text-base leading-relaxed text-muted-foreground sm:text-lg">
              Submit expenses, attach receipts, and track your reimbursements.
            </p>
            <Link
              href={isAuthenticated ? "/dashboard" : "/login"}
              className={buttonVariants({ size: "lg", className: "mt-8 gap-2 px-5" })}
            >
              {isAuthenticated ? "Open dashboard" : "Sign in"}
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
            {!isAuthenticated && (
              <p className="mt-5 text-sm text-muted-foreground">
                New here? Use the invitation link from your administrator.
              </p>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
