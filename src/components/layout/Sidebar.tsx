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
  BarChart3,
  Settings,
  Users,
  Layers,
  PieChart,
  GitBranch,
  History,
  Bell,
  Building2,
  ShieldCheck,
  FileSpreadsheet
} from "lucide-react";
import { useAuth } from "@/lib/auth/context";
import { canUserCreateClaim } from "@/lib/auth/permissions";
import { claimsClient, workspaceStore } from "@/lib/domains";
import { cn } from "@/lib/utils/cn";
import { BrandLogo } from "@/components/BrandLogo";

interface SidebarProps {
  onNavigate?: () => void;
}

export function Sidebar({ onNavigate }: SidebarProps) {
  const pathname = usePathname();
  const { user, hasRole, canCreateClaim } = useAuth();
  const [approvalsCount, setApprovalsCount] = useState(0);
  const [financeCount, setFinanceCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    const updateBadges = () => {
      const all = claimsClient.getClaims(user);

      const pendingApprovals = all.filter(c => {
        if (c.claimant_id === user.id || c.submitted_by_user_id === user.id) return false;
        const currentStep = c.workflow_steps?.find(s => s.status === "IN_PROGRESS");
        if (!currentStep) return false;
        if (user.roles?.includes("SYSTEM_ADMIN")) return true;
        if (currentStep.approver_role === "FINANCE_OFFICER" && user.roles?.includes("FINANCE_OFFICER")) return true;
        return false;
      }).length;
      setApprovalsCount(pendingApprovals);

      const pendingFinance = all.filter(c =>
        c.status === "PENDING_FINANCE_REVIEW" || c.status === "APPROVED_FOR_PAYMENT"
      ).length;
      setFinanceCount(pendingFinance);
    };

    updateBadges();
    return workspaceStore.subscribe(updateBadges);
  }, [user]);

  const isFinance = hasRole("FINANCE_OFFICER") || hasRole("SYSTEM_ADMIN");
  const isApprover = isFinance;
  const isAdmin = hasRole("SYSTEM_ADMIN");
  const canCreate = canCreateClaim() || canUserCreateClaim(user);

  const navItem = (href: string, label: string, icon: React.ReactNode, badge?: number, exact = false) => {
    const isActive = exact ? pathname === href : pathname.startsWith(href);
    return (
      <Link
        key={href}
        href={href}
        aria-current={isActive ? "page" : undefined}
        onClick={onNavigate}
        className={cn(
          "flex min-h-10 items-center justify-between px-3 py-2 rounded-md text-sm font-medium transition-colors group",
          isActive
            ? "bg-zinc-900 text-white font-medium shadow-2xs dark:bg-zinc-100 dark:text-zinc-900"
            : "text-zinc-600 hover:bg-zinc-100/80 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/80 dark:hover:text-zinc-100"
        )}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span className={cn("transition-colors shrink-0", isActive ? "text-white dark:text-zinc-900" : "text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-zinc-100")}>
            {icon}
          </span>
          <span className="truncate">{label}</span>
        </div>
        {typeof badge === "number" && badge > 0 && (
          <span
            className={cn(
              "px-1.5 py-0.2 text-[10px] font-semibold tabular-nums rounded-md shrink-0",
              isActive
                ? "bg-white/20 text-white dark:bg-zinc-900/20 dark:text-zinc-900"
                : "bg-rose-500 text-white"
            )}
          >
            {badge}
          </span>
        )}
      </Link>
    );
  };

  return (
    <aside className="flex flex-col h-full bg-white dark:bg-zinc-950 border-r border-zinc-200/80 dark:border-zinc-800/80 p-3 select-none">
      {/* Brand Header */}
      <div className="px-2 py-2.5 mb-3 flex items-start justify-between">
        <div>
          <Link href="/dashboard" onClick={onNavigate} aria-label="Harvest Generation dashboard" className="block w-fit">
            <BrandLogo priority />
          </Link>
          <p className="mt-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">Expense Portal</p>
        </div>
        {onNavigate && (
          <button
            type="button"
            onClick={onNavigate}
            className="p-1.5 -mr-1 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 lg:hidden"
            aria-label="Close menu"
          >
            <span className="text-xl leading-none">&times;</span>
          </button>
        )}
      </div>

      {/* Primary Action - Only for Ministry Leaders and Admins */}
      {canCreate && (
        <div className="px-1 mb-3">
          <Link
            href="/claims/new"
            onClick={onNavigate}
            className="flex items-center justify-center gap-1.5 w-full py-1.5 px-3 rounded-lg bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-zinc-200 dark:text-zinc-900 text-white text-xs font-semibold shadow-2xs transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Claim</span>
          </Link>
        </div>
      )}

      {/* Navigation Groups */}
      <div className="flex-1 space-y-4 overflow-y-auto pr-0.5">
        {/* Workspace */}
        <div className="space-y-0.5">
          <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
            Workspace
          </div>
          {navItem("/dashboard", "Dashboard", <LayoutDashboard className="w-4 h-4" />, undefined, true)}
          {navItem("/claims", "Claims", <FileText className="w-4 h-4" />, undefined, true)}
        </div>

        {/* Approver Inbox */}
        {isApprover && (
          <div className="space-y-0.5">
            <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
              Review
            </div>
            {navItem("/approvals", "Approvals Inbox", <CheckSquare className="w-4 h-4" />, approvalsCount)}
          </div>
        )}

        {/* Finance */}
        {isFinance && (
          <div className="space-y-0.5">
            <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
              Finance
            </div>
            {navItem("/finance", "Finance Overview", <Wallet className="w-4 h-4" />, financeCount, true)}
            {navItem("/finance/claims", "Process & Disburse", <Layers className="w-4 h-4" />)}
            {navItem("/finance/batches", "Bulk Bank Batches (.xls)", <FileSpreadsheet className="w-4 h-4" />)}
            {navItem("/finance/reports", "Analytics & Reports", <BarChart3 className="w-4 h-4" />)}
          </div>
        )}

        {/* Administration */}
        {isAdmin && (
          <div className="space-y-0.5">
            <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
              Admin
            </div>
            {navItem("/admin", "Overview", <ShieldCheck className="w-4 h-4" />, undefined, true)}
            {navItem("/admin/users", "Users & Roles", <Users className="w-4 h-4" />)}
            {navItem("/admin/ministries", "Ministries", <Building2 className="w-4 h-4" />)}
            {navItem("/admin/cost-centres", "Cost Centres", <PieChart className="w-4 h-4" />)}
            {navItem("/admin/workflows", "Workflows", <GitBranch className="w-4 h-4" />)}
            {navItem("/admin/audit", "Audit Trail", <History className="w-4 h-4" />)}
            {navItem("/admin/settings", "Form & Settings", <Settings className="w-4 h-4" />)}
          </div>
        )}

        {/* Account */}
        <div className="space-y-0.5">
          <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
            Account
          </div>
          {navItem("/notifications", "Notifications", <Bell className="w-4 h-4" />)}
        </div>
      </div>

      {/* Footer Org Info */}
      <div className="pt-3 mt-auto border-t border-zinc-100 dark:border-zinc-800 px-2 flex items-center justify-between text-[11px] text-zinc-400">
        <span className="truncate">{user?.full_name}</span>
        <span className="font-mono text-[10px] text-zinc-400">v1.0</span>
      </div>
    </aside>
  );
}
