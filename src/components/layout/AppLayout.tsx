"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth/context";
import { Sidebar } from "./Sidebar";
import { TopHeader } from "./TopHeader";
import { BottomNav } from "./BottomNav";
import { NamePromptDialog } from "./NamePromptDialog";



interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const closeMenuRef = useRef<HTMLButtonElement>(null);
  const menuPanelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const { user, isAuthenticated, isLoading, hasRole } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isLoading, isAuthenticated, router]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeMenuRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileMenuOpen(false);
      if (event.key === "Tab" && menuPanelRef.current) {
        const focusable = Array.from(menuPanelRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'));
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [mobileMenuOpen]);

  useEffect(() => { setMobileMenuOpen(false); }, [pathname]);

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
    <div className="min-h-screen bg-background text-foreground flex flex-col antialiased font-sans">
      <div className="flex h-screen overflow-hidden">
        {/* Desktop Fixed Sidebar */}
        <div className="hidden lg:flex lg:w-64 lg:flex-col lg:inset-y-0 z-30">
          <Sidebar />
        </div>

        {/* Mobile Slide-over Drawer */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 lg:hidden flex" role="dialog" aria-modal="true" aria-label="Navigation menu">
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-zinc-950/60 backdrop-blur-xs transition-opacity duration-300"
              onClick={() => setMobileMenuOpen(false)}
              aria-hidden="true"
            />

            {/* Slide-out Panel */}
            <div id="mobile-navigation" ref={menuPanelRef} className="relative flex-1 flex flex-col max-w-[280px] w-full bg-white dark:bg-zinc-950 z-10 shadow-2xl animate-in slide-in-from-left duration-200">
              <button ref={closeMenuRef} type="button" className="sr-only focus:not-sr-only focus:absolute focus:right-3 focus:top-3 focus:z-20 focus:bg-white focus:p-2" onClick={() => setMobileMenuOpen(false)}>Close navigation</button>
              <Sidebar onNavigate={() => setMobileMenuOpen(false)} />
            </div>
          </div>
        )}

        {/* Main Content Area */}
        <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
          <TopHeader onToggleMobileMenu={() => setMobileMenuOpen(true)} mobileMenuOpen={mobileMenuOpen} />
          <main id="main-content" className="workspace-content flex-1 min-w-0 p-3.5 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto pb-24 lg:pb-8">
            {(pathname.startsWith("/admin") && !hasRole("SYSTEM_ADMIN")) ||
             (pathname.startsWith("/finance") && !hasRole("FINANCE_OFFICER")) ||
             (pathname.startsWith("/approvals") && !hasRole("FINANCE_OFFICER") && !hasRole("SYSTEM_ADMIN"))
              ? <div className="py-8"><h1>Access restricted</h1><p className="mt-3 text-sm">Your account does not have access to this workspace.</p></div>
              : children}
          </main>
        </div>
      </div>

      {/* Mobile Bottom Navigation (Hidden on Desktop) */}
      <BottomNav />

      {/* In-app prompt for users without a valid real name */}
      <NamePromptDialog />
    </div>
  );
}
