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
    return workspaceStore.subscribeDomains(["claims", "master-data", "iam"], updateBadges);
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
          "flex min-h-11 items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors group",
          isActive
            ? "bg-accent text-accent-foreground font-semibold"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        )}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span className={cn("transition-colors shrink-0", isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground")}>
            {icon}
          </span>
          <span className="truncate">{label}</span>
        </div>
        {typeof badge === "number" && badge > 0 && (
          <span
            className={cn(
              "px-1.5 py-0.5 text-[10px] font-semibold tabular-nums rounded-md shrink-0",
              isActive
                ? "bg-primary text-primary-foreground"
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
    <aside className="flex flex-col h-full bg-card text-card-foreground border-r border-border p-3 select-none">
      {/* Brand Header */}
      <div className="px-3 py-2 mb-6 flex items-start justify-between">
        <div>
          <Link href="/dashboard" onClick={onNavigate} aria-label="Harvest Generation dashboard" className="block w-fit">
            <BrandLogo priority className="text-[1.3125rem] text-foreground sm:text-[1.375rem]" />
          </Link>
          <p className="mt-1 text-xs text-muted-foreground">Expense claims</p>
        </div>
        {onNavigate && (
          <button
            type="button"
            onClick={onNavigate}
            className="p-1.5 -mr-1 rounded-lg text-muted-foreground hover:text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden"
            aria-label="Close menu"
          >
            <span className="text-xl leading-none">&times;</span>
          </button>
        )}
      </div>

      {/* Primary Action - Only for Claimants and Admins */}
      {canCreate && (
        <div className="px-1 mb-3">
          <Link
            href="/claims/new"
            onClick={onNavigate}
            className="flex min-h-11 items-center justify-center gap-1.5 w-full py-2 px-3 rounded-md bg-primary hover:brightness-90 text-primary-foreground text-sm font-medium transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Submit Claim</span>
          </Link>
        </div>
      )}

      {/* Navigation Groups */}
      <div className="flex-1 space-y-4 overflow-y-auto pr-0.5">
        {/* Workspace */}
        <div className="space-y-0.5">
          <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Workspace
          </div>
          {navItem("/dashboard", "Dashboard", <LayoutDashboard className="w-4 h-4" />, undefined, true)}
          {navItem("/claims", "My Claims", <FileText className="w-4 h-4" />, undefined, true)}
        </div>

        {/* Approver Inbox */}
        {isApprover && (
          <div className="space-y-0.5">
            <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Review
            </div>
            {navItem("/approvals", "Pending Approval", <CheckSquare className="w-4 h-4" />, approvalsCount)}
          </div>
        )}

        {/* Finance */}
        {isFinance && (
          <div className="space-y-0.5">
            <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Finance
            </div>
            {navItem("/finance", "Finance Overview", <Wallet className="w-4 h-4" />, financeCount, true)}
            {navItem("/finance/claims", "Reimbursements", <Layers className="w-4 h-4" />)}
            {navItem("/finance/batches", "Bank Batches", <FileSpreadsheet className="w-4 h-4" />)}
            {navItem("/finance/reports", "Reports", <BarChart3 className="w-4 h-4" />)}
          </div>
        )}

        {/* Administration */}
        {isAdmin && (
          <div className="space-y-0.5">
            <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Admin
            </div>
            {navItem("/admin", "Overview", <ShieldCheck className="w-4 h-4" />, undefined, true)}
            {navItem("/admin/users", "Users & invitations", <Users className="w-4 h-4" />)}
            {navItem("/admin/ministries", "Ministries", <Building2 className="w-4 h-4" />)}
            {navItem("/admin/workflows", "Workflows", <GitBranch className="w-4 h-4" />)}
            {navItem("/admin/audit", "Audit Trail", <History className="w-4 h-4" />)}
            {navItem("/admin/settings", "Form & Settings", <Settings className="w-4 h-4" />)}
          </div>
        )}

        {/* Account */}
        <div className="space-y-0.5">
          <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Account
          </div>
          {navItem("/notifications", "Notifications", <Bell className="w-4 h-4" />)}
        </div>
      </div>

      {/* Footer Org Info */}
      <div className="pt-3 mt-auto border-t border-border px-2 flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="truncate">{user?.full_name}</span>
      </div>
    </aside>
  );
}
