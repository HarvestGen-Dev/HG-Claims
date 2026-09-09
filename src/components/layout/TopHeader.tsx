"use client";

import React, { useState } from "react";
import { 
  UserCheck, 
  Search, 
  Menu, 
  LogOut, 
  User, 
  Building2, 
  ShieldCheck,
  CheckCircle2,
  ChevronDown
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/context";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { Badge } from "@/components/ui/badge";

interface TopHeaderProps {
  onToggleMobileMenu?: () => void;
}

export function TopHeader({ onToggleMobileMenu }: TopHeaderProps) {
  const { user, allUsers, switchUser, logout, hasRole } = useAuth();
  const [showPersonaMenu, setShowPersonaMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const router = useRouter();

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    router.push(`/claims?search=${encodeURIComponent(searchQuery.trim())}`);
  };

  const roleLabelMap: Record<string, string> = {
    CLAIMANT: "Claimant",
    MINISTRY_LEADER: "Ministry Leader",
    FINANCE_OFFICER: "Finance Officer",
    FINAL_APPROVER: "Final Approver",
    SYSTEM_ADMIN: "Admin",
  };

  return (
    <header className="sticky top-0 z-40 flex h-16 w-full items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 sm:px-6">
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleMobileMenu}
          className="p-2 text-slate-600 hover:text-slate-900 rounded-lg lg:hidden hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          aria-label="Open Navigation"
        >
          <Menu className="w-5 h-5" />
        </button>

        <Link href="/dashboard" className="flex items-center gap-2.5 lg:hidden">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-700 text-white font-bold text-sm shadow-sm">
            NL
          </div>
          <div>
            <span className="font-bold text-slate-900 text-sm tracking-tight dark:text-slate-100">NLCC Expenses</span>
          </div>
        </Link>

        {/* Global Search */}
        <form onSubmit={handleSearchSubmit} className="hidden md:flex items-center relative w-64 lg:w-80">
          <Search className="absolute left-3 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search claim #, purpose, claimant..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-xs text-slate-800 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
          />
        </form>
      </div>

      {/* Right controls: Demo Switcher, Notification, Profile */}
      <div className="flex items-center gap-2 sm:gap-4">
        {/* Persona Switcher (Crucial for pair programming / demoing full 5-role lifecycle easily) */}
        <div className="relative">
          <button
            onClick={() => setShowPersonaMenu(!showPersonaMenu)}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50/70 hover:bg-emerald-100/70 text-emerald-900 text-xs font-medium transition-colors dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
            title="Switch User Role Persona"
          >
            <UserCheck className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" />
            <span className="hidden sm:inline font-semibold">Demo Role:</span>
            <span className="truncate max-w-[110px] font-bold">{user?.full_name.split(" ")[0]}</span>
            <ChevronDown className="w-3 h-3 text-emerald-600 opacity-70" />
          </button>

          {showPersonaMenu && (
            <div 
              className="absolute right-0 mt-2 w-72 rounded-2xl bg-white shadow-2xl border border-slate-200 p-2 z-50 dark:bg-slate-900 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-100"
              onMouseLeave={() => setShowPersonaMenu(false)}
            >
              <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 mb-1">
                <p className="text-xs font-bold text-slate-900 dark:text-slate-100">Switch User Persona</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Test workflows from any role instantly</p>
              </div>

              <div className="space-y-1">
                {allUsers.map((u) => {
                  const isSelected = u.id === user?.id;
                  return (
                    <button
                      key={u.id}
                      onClick={() => {
                        switchUser(u.id);
                        setShowPersonaMenu(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 text-left rounded-lg text-xs transition-colors ${
                        isSelected 
                          ? "bg-emerald-50 text-emerald-900 font-semibold dark:bg-emerald-950/40 dark:text-emerald-300"
                          : "hover:bg-slate-100 text-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                      }`}
                    >
                      <div className="flex flex-col truncate pr-2">
                        <span className="truncate font-medium">{u.full_name}</span>
                        <span className="text-[10px] text-slate-400 truncate">
                          {u.roles?.map(r => roleLabelMap[r] || r).join(" • ")}
                        </span>
                      </div>
                      {isSelected && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* In-app Notification Bell */}
        <NotificationBell />

        {/* User profile capsule */}
        <div className="flex items-center gap-2.5 pl-2 border-l border-slate-200 dark:border-slate-800">
          <div className="h-8 w-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center font-bold text-xs text-slate-700 dark:text-slate-200 overflow-hidden">
            {user?.avatar_url ? (
              <img src={user.avatar_url} alt={user.full_name} className="h-full w-full object-cover" />
            ) : (
              <span>{user?.full_name.charAt(0)}</span>
            )}
          </div>
          <div className="hidden xl:flex flex-col text-left">
            <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 leading-none">{user?.full_name}</span>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">{user?.roles?.[0]}</span>
          </div>
        </div>
      </div>
    </header>
  );
}
