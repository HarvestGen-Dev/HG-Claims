"use client";

import React, { useState } from "react";
import { 
  UserCheck, 
  Search, 
  Menu, 
  Check,
  ChevronDown
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/context";
import { NotificationBell } from "@/components/notifications/NotificationBell";

interface TopHeaderProps {
  onToggleMobileMenu?: () => void;
}

export function TopHeader({ onToggleMobileMenu }: TopHeaderProps) {
  const { user, allUsers, switchUser } = useAuth();
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
    <header className="sticky top-0 z-40 flex h-14 w-full items-center justify-between border-b border-zinc-200/80 bg-white/80 px-4 backdrop-blur-md dark:border-zinc-800/80 dark:bg-zinc-950/80 sm:px-6">
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleMobileMenu}
          className="p-1.5 text-zinc-500 hover:text-zinc-900 rounded-lg lg:hidden hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          aria-label="Open Navigation"
        >
          <Menu className="w-4 h-4" />
        </button>

        <Link href="/dashboard" className="flex items-center gap-2 lg:hidden">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-900 text-white font-bold text-xs">
            NL
          </div>
          <span className="font-semibold text-zinc-900 text-xs tracking-tight dark:text-zinc-100">NLCC</span>
        </Link>

        {/* Global Search */}
        <form onSubmit={handleSearchSubmit} className="hidden md:flex items-center relative w-64 lg:w-72">
          <Search className="absolute left-2.5 w-3.5 h-3.5 text-zinc-400" />
          <input
            type="text"
            placeholder="Search claims, vouchers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 w-full rounded-lg border border-zinc-200 bg-zinc-50/70 pl-8 pr-10 text-xs text-zinc-900 placeholder:text-zinc-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-100 dark:focus:ring-zinc-100 transition-all"
          />
          <kbd className="absolute right-2 text-[10px] font-mono text-zinc-400 pointer-events-none hidden sm:inline">⌘K</kbd>
        </form>
      </div>

      {/* Right controls: Demo Switcher, Notification, Profile */}
      <div className="flex items-center gap-2.5">
        {/* Persona Switcher */}
        <div className="relative">
          <button
            onClick={() => setShowPersonaMenu(!showPersonaMenu)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-zinc-200 bg-zinc-50 hover:bg-zinc-100 text-zinc-800 text-xs font-medium transition-colors dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 shadow-2xs"
            title="Switch User Role Persona"
          >
            <UserCheck className="w-3.5 h-3.5 text-zinc-500" />
            <span className="text-zinc-400 font-normal">Role:</span>
            <span className="font-semibold text-zinc-900 dark:text-zinc-100">{user?.full_name.split(" ")[0]}</span>
            <ChevronDown className="w-3 h-3 text-zinc-400" />
          </button>

          {showPersonaMenu && (
            <div 
              className="absolute right-0 mt-1.5 w-64 rounded-xl bg-white shadow-xl border border-zinc-200 p-1.5 z-50 dark:bg-zinc-900 dark:border-zinc-800 animate-in fade-in zoom-in-95 duration-100"
              onMouseLeave={() => setShowPersonaMenu(false)}
            >
              <div className="px-2.5 py-1.5 border-b border-zinc-100 dark:border-zinc-800 mb-1">
                <p className="text-[11px] font-semibold text-zinc-900 dark:text-zinc-100">Switch Demo Persona</p>
                <p className="text-[10px] text-zinc-400">Test workflows from any role</p>
              </div>

              <div className="space-y-0.5">
                {allUsers.map((u) => {
                  const isSelected = u.id === user?.id;
                  return (
                    <button
                      key={u.id}
                      onClick={() => {
                        switchUser(u.id);
                        setShowPersonaMenu(false);
                      }}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 text-left rounded-lg text-xs transition-colors ${
                        isSelected 
                          ? "bg-zinc-100 text-zinc-900 font-semibold dark:bg-zinc-800 dark:text-zinc-100"
                          : "hover:bg-zinc-50 text-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800/60"
                      }`}
                    >
                      <div className="flex flex-col truncate pr-2">
                        <span className="truncate">{u.full_name}</span>
                        <span className="text-[10px] text-zinc-400 truncate">
                          {u.roles?.map(r => roleLabelMap[r] || r).join(" • ")}
                        </span>
                      </div>
                      {isSelected && <Check className="w-3.5 h-3.5 text-zinc-900 dark:text-zinc-100 shrink-0" />}
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
        <Link 
          href="/profile"
          className="flex items-center gap-2 pl-2 border-l border-zinc-200/80 dark:border-zinc-800 hover:opacity-80 transition-opacity"
        >
          <div className="h-7 w-7 rounded-full bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 flex items-center justify-center font-medium text-xs">
            {user?.avatar_url ? (
              <img src={user.avatar_url} alt={user.full_name} className="h-full w-full object-cover rounded-full" />
            ) : (
              <span>{user?.full_name?.charAt(0) || "U"}</span>
            )}
          </div>
          <div className="hidden xl:flex flex-col text-left">
            <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100 leading-none">{user?.full_name}</span>
            <span className="text-[10px] text-zinc-400 mt-0.5">{roleLabelMap[user?.roles?.[0] || ""] || user?.roles?.[0]}</span>
          </div>
        </Link>
      </div>
    </header>
  );
}
