"use client";

import React, { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth/context";
import { Sidebar } from "./Sidebar";
import { TopHeader } from "./TopHeader";
import { Dialog, DialogTitle } from "@/components/ui/dialog";
import { WorkspaceFeedback } from "./WorkspaceFeedback";

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user, isAuthenticated, isLoading, hasRole } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="flex flex-col items-center gap-3">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-zinc-900 border-t-transparent dark:border-zinc-100" />
          <p className="text-xs font-medium text-zinc-500">Verifying session...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-50/50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 flex flex-col antialiased font-sans">
      <div className="flex h-screen overflow-hidden">
        <WorkspaceFeedback />
        {/* Desktop Fixed Sidebar */}
        <div className="hidden lg:flex lg:w-64 lg:flex-col lg:inset-y-0 z-30">
          <Sidebar />
        </div>

        {/* Mobile Slide-over Drawer */}
        <Dialog open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <DialogTitle>Navigation</DialogTitle>
            <div className="h-[70dvh] pt-3">
              <Sidebar onNavigate={() => setMobileMenuOpen(false)} />
            </div>
        </Dialog>

        {/* Main Content Area */}
        <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
          <TopHeader onToggleMobileMenu={() => setMobileMenuOpen(true)} />
          <main id="main-content" className="workspace-content flex-1 min-w-0 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
            {(pathname.startsWith("/admin") && !hasRole("SYSTEM_ADMIN")) ||
             (pathname.startsWith("/finance") && !hasRole("FINANCE_OFFICER")) ||
             (pathname.startsWith("/approvals") && !hasRole("FINANCE_OFFICER") && !hasRole("SYSTEM_ADMIN"))
              ? <div className="py-8"><h1>Access restricted</h1><p className="mt-3 text-sm">Your account does not have access to this workspace.</p></div>
              : children}
          </main>
        </div>
      </div>
    </div>
  );
}
