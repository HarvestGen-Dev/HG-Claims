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
  Tag, 
  PieChart, 
  GitBranch, 
  History, 
  Bell, 
  UserCircle,
  Building2,
  ShieldCheck,
  CreditCard
} from "lucide-react";
import { useAuth } from "@/lib/auth/context";
import { db } from "@/lib/mock-db/repository";
import { cn } from "@/lib/utils/cn";

interface SidebarProps {
  onNavigate?: () => void;
}

export function Sidebar({ onNavigate }: SidebarProps) {
  const pathname = usePathname();
  const { user, hasRole } = useAuth();
  const [approvalsCount, setApprovalsCount] = useState(0);
  const [financeCount, setFinanceCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    const updateBadges = () => {
      const all = db.getClaims(user);
      
      const pendingApprovals = all.filter(c => {
        if (c.claimant_id === user.id) return false;
        const currentStep = c.workflow_steps?.find(s => s.status === "IN_PROGRESS");
        if (!currentStep) return false;
        if (currentStep.assigned_user_id === user.id) return true;
        if (currentStep.approver_role === "MINISTRY_LEADER" && user.roles?.includes("MINISTRY_LEADER")) return true;
        if (currentStep.approver_role === "FINAL_APPROVER" && user.roles?.includes("FINAL_APPROVER")) return true;
        return false;
      }).length;
      setApprovalsCount(pendingApprovals);

      const pendingFinance = all.filter(c => 
        c.status === "PENDING_FINANCE_REVIEW" || c.status === "APPROVED_FOR_PAYMENT"
      ).length;
      setFinanceCount(pendingFinance);
    };

    updateBadges();
    const interval = setInterval(updateBadges, 3000);
    return () => clearInterval(interval);
  }, [user]);

  const isApprover = hasRole("MINISTRY_LEADER") || hasRole("FINAL_APPROVER") || hasRole("SYSTEM_ADMIN");
  const isFinance = hasRole("FINANCE_OFFICER") || hasRole("SYSTEM_ADMIN");
  const isAdmin = hasRole("SYSTEM_ADMIN");

  const navItem = (href: string, label: string, icon: React.ReactNode, badge?: number, exact = false) => {
    const isActive = exact ? pathname === href : pathname.startsWith(href);
    return (
      <Link
        key={href}
        href={href}
        onClick={onNavigate}
        className={cn(
          "flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all group",
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
      <div className="flex items-center gap-2.5 px-2 py-2.5 mb-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 font-bold text-xs tracking-tight shrink-0 shadow-2xs">
          NL
        </div>
        <div className="min-w-0">
          <h1 className="font-semibold text-zinc-900 text-xs tracking-tight dark:text-zinc-100 truncate">
            NewLife Church
          </h1>
          <p className="text-[10px] text-zinc-400 dark:text-zinc-500 truncate">
            Expense Portal
          </p>
        </div>
      </div>

      {/* Primary Action */}
      <div className="px-1 mb-3">
        <Link 
          href="/claims/new" 
          onClick={onNavigate}
          className="flex items-center justify-center gap-1.5 w-full py-1.5 px-3 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold shadow-2xs transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Claim</span>
        </Link>
      </div>

      {/* Navigation Groups */}
      <div className="flex-1 space-y-4 overflow-y-auto pr-0.5">
        {/* Workspace */}
        <div className="space-y-0.5">
          <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
            Workspace
          </div>
          {navItem("/dashboard", "Dashboard", <LayoutDashboard className="w-4 h-4" />, undefined, true)}
          {navItem("/claims", "My Claims", <FileText className="w-4 h-4" />)}
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
            {navItem("/admin/categories", "Categories", <Tag className="w-4 h-4" />)}
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
          {navItem("/profile", "Profile & Bank Details", <CreditCard className="w-4 h-4" />)}
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
