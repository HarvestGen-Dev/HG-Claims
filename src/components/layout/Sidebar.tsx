"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  LayoutDashboard, 
  FileText, 
  PlusCircle, 
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
  ChevronRight
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
      
      // Count approvals needing current user
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

      // Count finance pending claims
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
          "flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all group",
          isActive
            ? "bg-emerald-700 text-white shadow-sm font-semibold"
            : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
        )}
      >
        <div className="flex items-center gap-3">
          <span className={cn("transition-colors", isActive ? "text-white" : "text-slate-500 group-hover:text-emerald-700")}>
            {icon}
          </span>
          <span>{label}</span>
        </div>
        {typeof badge === "number" && badge > 0 && (
          <span
            className={cn(
              "px-2 py-0.5 rounded-full text-xs font-bold",
              isActive ? "bg-white text-emerald-800" : "bg-red-500 text-white"
            )}
          >
            {badge}
          </span>
        )}
      </Link>
    );
  };

  return (
    <aside className="flex flex-col h-full bg-slate-50/70 dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800 p-4 select-none">
      {/* Brand Header */}
      <div className="flex items-center gap-3 px-2 py-3 mb-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-800 text-white font-black text-base shadow-md">
          NL
        </div>
        <div>
          <h1 className="font-bold text-slate-900 text-sm tracking-tight dark:text-slate-100 leading-tight">
            NewLife Church
          </h1>
          <p className="text-[11px] font-medium text-emerald-800 dark:text-emerald-400">
            Expense Claim System
          </p>
        </div>
      </div>

      {/* Navigation Groups */}
      <div className="flex-1 space-y-6 overflow-y-auto pr-1">
        {/* Main Claimant Section */}
        <div className="space-y-1">
          <div className="px-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            My Workspace
          </div>
          {navItem("/dashboard", "Dashboard", <LayoutDashboard className="w-4 h-4" />, undefined, true)}
          {navItem("/claims/new", "+ New Claim", <PlusCircle className="w-4 h-4 text-emerald-600" />)}
          {navItem("/claims", "My Claims", <FileText className="w-4 h-4" />)}
        </div>

        {/* Approver Inbox */}
        {isApprover && (
          <div className="space-y-1">
            <div className="px-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Approvals
            </div>
            {navItem("/approvals", "Needs Approval", <CheckSquare className="w-4 h-4" />, approvalsCount)}
          </div>
        )}

        {/* Finance Workspace */}
        {isFinance && (
          <div className="space-y-1">
            <div className="px-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Finance
            </div>
            {navItem("/finance", "Finance Overview", <Wallet className="w-4 h-4" />, financeCount, true)}
            {navItem("/finance/claims", "Process & Pay", <Layers className="w-4 h-4" />)}
            {navItem("/finance/reports", "Financial Reports", <BarChart3 className="w-4 h-4" />)}
          </div>
        )}

        {/* Administration Suite */}
        {isAdmin && (
          <div className="space-y-1">
            <div className="px-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Administration
            </div>
            {navItem("/admin", "Admin Control", <ShieldCheck className="w-4 h-4" />, undefined, true)}
            {navItem("/admin/users", "Users & Roles", <Users className="w-4 h-4" />)}
            {navItem("/admin/ministries", "Ministries", <Building2 className="w-4 h-4" />)}
            {navItem("/admin/categories", "Categories", <Tag className="w-4 h-4" />)}
            {navItem("/admin/cost-centres", "Cost Centres", <PieChart className="w-4 h-4" />)}
            {navItem("/admin/workflows", "Workflows & Rules", <GitBranch className="w-4 h-4" />)}
            {navItem("/admin/audit", "Audit Trail", <History className="w-4 h-4" />)}
            {navItem("/admin/settings", "System Settings", <Settings className="w-4 h-4" />)}
          </div>
        )}

        {/* General User */}
        <div className="space-y-1">
          <div className="px-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Account
          </div>
          {navItem("/profile", "Profile & Bank Details", <UserCircle className="w-4 h-4" />)}
          {navItem("/notifications", "Notifications", <Bell className="w-4 h-4" />)}
        </div>
      </div>

      {/* Footer Org Info */}
      <div className="pt-4 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-400 text-center">
        NLCC Expense System v1.0
      </div>
    </aside>
  );
}
