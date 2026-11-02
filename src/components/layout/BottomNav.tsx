"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  Plus,
  CheckSquare,
  Wallet,
  ShieldCheck,
  Bell,
} from "lucide-react";
import { useAuth } from "@/lib/auth/context";
import { canUserCreateClaim } from "@/lib/auth/permissions";
import { claimsClient, notificationClient, workspaceStore } from "@/lib/domains";
import { cn } from "@/lib/utils/cn";

export function BottomNav() {
  const pathname = usePathname();
  const { user, hasRole, canCreateClaim } = useAuth();
  const [approvalsCount, setApprovalsCount] = useState(0);
  const [financeCount, setFinanceCount] = useState(0);
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  useEffect(() => {
    if (!user) return;
    const updateBadges = () => {
      const all = claimsClient.getClaims(user);

      const pendingApprovals = all.filter((c) => {
        if (c.claimant_id === user.id || c.submitted_by_user_id === user.id) return false;
        const currentStep = c.workflow_steps?.find((s) => s.status === "IN_PROGRESS");
        if (!currentStep) return false;
        if (user.roles?.includes("SYSTEM_ADMIN")) return true;
        if (currentStep.approver_role === "FINANCE_OFFICER" && user.roles?.includes("FINANCE_OFFICER")) return true;
        return false;
      }).length;
      setApprovalsCount(pendingApprovals);

      const pendingFinance = all.filter(
        (c) => c.status === "PENDING_FINANCE_REVIEW" || c.status === "APPROVED_FOR_PAYMENT"
      ).length;
      setFinanceCount(pendingFinance);

      try {
        const notifs = notificationClient.getNotifications(user.id);
        setUnreadNotifications(notifs.filter((n) => !n.is_read).length);
      } catch {}
    };

    updateBadges();
    return workspaceStore.subscribe(updateBadges);
  }, [user]);

  if (!user) return null;

  const isFinance = hasRole("FINANCE_OFFICER");
  const isAdmin = hasRole("SYSTEM_ADMIN");
  const isApprover = isFinance || isAdmin;
  const canCreate = canCreateClaim() || canUserCreateClaim(user);

  const isTabActive = (href: string, exact = false) => {
    if (exact) return pathname === href;
    return pathname.startsWith(href);
  };

  return (
    <nav
      aria-label="Mobile Bottom Navigation"
      className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-zinc-950/95 border-t border-zinc-200/90 dark:border-zinc-800/90 backdrop-blur-md pb-[env(safe-area-inset-bottom,0px)] shadow-lg select-none"
    >
      <div className="flex items-center justify-around h-14 px-2 max-w-lg mx-auto">
        {/* Dashboard */}
        <Link
          href="/dashboard"
          className={cn(
            "flex flex-col items-center justify-center flex-1 py-1 text-[10px] font-medium transition-colors relative min-h-[44px]",
            isTabActive("/dashboard", true)
              ? "text-emerald-700 dark:text-emerald-400 font-semibold"
              : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
          )}
        >
          <LayoutDashboard className="w-5 h-5 mb-0.5" />
          <span>Home</span>
        </Link>

        {/* My Claims */}
        <Link
          href="/claims"
          className={cn(
            "flex flex-col items-center justify-center flex-1 py-1 text-[10px] font-medium transition-colors relative min-h-[44px]",
            isTabActive("/claims") && !pathname.startsWith("/claims/new")
              ? "text-emerald-700 dark:text-emerald-400 font-semibold"
              : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
          )}
        >
          <FileText className="w-5 h-5 mb-0.5" />
          <span>Claims</span>
        </Link>

        {/* Center Action: New Claim */}
        {canCreate ? (
          <Link
            href="/claims/new"
            aria-label="Create New Claim"
            className="flex flex-col items-center justify-center -mt-4 px-2 min-h-[44px]"
          >
            <div className="w-11 h-11 rounded-full bg-emerald-700 text-white flex items-center justify-center shadow-md active:scale-95 transition-transform hover:bg-emerald-800 ring-4 ring-white dark:ring-zinc-950">
              <Plus className="w-6 h-6 stroke-[2.5]" />
            </div>
            <span className="text-[10px] font-semibold text-emerald-800 dark:text-emerald-400 mt-0.5">
              New
            </span>
          </Link>
        ) : null}

        {/* Review / Approvals or Finance */}
        {isApprover ? (
          <Link
            href={isFinance ? "/finance" : "/approvals"}
            className={cn(
              "flex flex-col items-center justify-center flex-1 py-1 text-[10px] font-medium transition-colors relative min-h-[44px]",
              isTabActive("/approvals") || isTabActive("/finance")
                ? "text-emerald-700 dark:text-emerald-400 font-semibold"
                : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
            )}
          >
            <div className="relative">
              {isFinance ? <Wallet className="w-5 h-5 mb-0.5" /> : <CheckSquare className="w-5 h-5 mb-0.5" />}
              {(approvalsCount > 0 || financeCount > 0) && (
                <span className="absolute -top-1 -right-2 px-1 min-w-3.5 h-3.5 flex items-center justify-center text-[9px] font-bold text-white bg-rose-500 rounded-full">
                  {approvalsCount || financeCount}
                </span>
              )}
            </div>
            <span>{isFinance ? "Finance" : "Review"}</span>
          </Link>
        ) : isAdmin ? (
          <Link
            href="/admin"
            className={cn(
              "flex flex-col items-center justify-center flex-1 py-1 text-[10px] font-medium transition-colors relative min-h-[44px]",
              isTabActive("/admin")
                ? "text-emerald-700 dark:text-emerald-400 font-semibold"
                : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
            )}
          >
            <ShieldCheck className="w-5 h-5 mb-0.5" />
            <span>Admin</span>
          </Link>
        ) : null}

        {/* Notifications */}
        <Link
          href="/notifications"
          className={cn(
            "flex flex-col items-center justify-center flex-1 py-1 text-[10px] font-medium transition-colors relative min-h-[44px]",
            isTabActive("/notifications")
              ? "text-emerald-700 dark:text-emerald-400 font-semibold"
              : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
          )}
        >
          <div className="relative">
            <Bell className="w-5 h-5 mb-0.5" />
            {unreadNotifications > 0 && (
              <span className="absolute -top-1 -right-1.5 w-2.5 h-2.5 bg-rose-500 rounded-full" />
            )}
          </div>
          <span>Alerts</span>
        </Link>
      </div>
    </nav>
  );
}
