"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Search,
  Menu,
  ChevronDown,
  LogOut,
  User,
  FileText,
  Bell,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/context";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { BrandLogo } from "@/components/BrandLogo";

interface TopHeaderProps {
  onToggleMobileMenu?: () => void;
}

export function TopHeader({ onToggleMobileMenu }: TopHeaderProps) {
  const { user, logout } = useAuth();
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    router.push(`/claims?search=${encodeURIComponent(searchQuery.trim())}`);
  };

  const handleLogout = async () => {
    setShowProfileMenu(false);
    await logout();
    router.push("/login");
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowProfileMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const roleLabelMap: Record<string, string> = {
    MINISTRY_LEADER: "Ministry Leader",
    FINANCE_OFFICER: "Finance Officer",
    SYSTEM_ADMIN: "System Administrator",
  };

  return (
    <header className="sticky top-0 z-40 flex shrink-0 h-14 w-full items-center justify-between border-b border-zinc-200/80 bg-white/90 px-3 sm:px-6 backdrop-blur-md dark:border-zinc-800/80 dark:bg-zinc-950/90">
      <div className="flex items-center gap-2 sm:gap-3">
        <button
          onClick={onToggleMobileMenu}
          className="p-2 -ml-1 text-zinc-600 hover:text-zinc-900 rounded-lg lg:hidden hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800 touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center"
          aria-label="Open Navigation"
        >
          <Menu className="w-5 h-5" />
        </button>

        <Link href="/dashboard" className="flex items-center gap-2 lg:hidden py-1">
          <BrandLogo className="w-10 sm:w-12" />
          <span className="font-semibold text-zinc-900 text-xs tracking-tight dark:text-zinc-100">NLCC</span>
        </Link>

        {/* Global Search */}
        <form onSubmit={handleSearchSubmit} className="hidden md:flex items-center relative w-64 lg:w-72">
          <Search className="absolute left-2.5 w-3.5 h-3.5 text-zinc-400" />
          <input
            type="text"
            aria-label="Search claims"
            placeholder="Search claims, vouchers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 w-full rounded-lg border border-zinc-200 bg-zinc-50/70 pl-8 pr-10 text-xs text-zinc-900 placeholder:text-zinc-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-100 dark:focus:ring-zinc-100 transition-all"
          />
        </form>
      </div>

      {/* Right controls: Notification Bell & User Profile Dropdown */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* In-app Notification Bell */}
        <NotificationBell />

        {/* User Profile Menu */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            className="flex items-center gap-2 p-1 pl-1.5 pr-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800/80 transition-colors focus:outline-none min-h-[44px] touch-manipulation"
            aria-expanded={showProfileMenu}
            aria-label="Account menu"
            aria-haspopup="true"
          >
            <div className="h-7 w-7 rounded-full bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 flex items-center justify-center font-semibold text-xs shrink-0 overflow-hidden ring-1 ring-zinc-200 dark:ring-zinc-800">
              {user?.avatar_url ? (
                <img src={user.avatar_url} alt={user.full_name} className="h-full w-full object-cover" />
              ) : (
                <span>{user?.full_name?.charAt(0) || "U"}</span>
              )}
            </div>
            <div className="hidden md:flex flex-col text-left leading-tight">
              <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">{user?.full_name}</span>
              <span className="text-[10px] text-zinc-400">{roleLabelMap[user?.roles?.[0] || ""] || user?.roles?.[0]}</span>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-zinc-400 hidden sm:inline" />
          </button>

          {showProfileMenu && (
            <div className="absolute right-0 mt-2 w-64 max-w-[calc(100vw-1.5rem)] rounded-xl bg-white shadow-xl border border-zinc-200/80 py-1.5 z-50 dark:bg-zinc-900 dark:border-zinc-800 animate-in fade-in zoom-in-95 duration-100">
              {/* Profile Card Header */}
              <div className="px-3.5 py-2.5 border-b border-zinc-100 dark:border-zinc-800">
                <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">{user?.full_name}</p>
                <p className="text-[11px] text-zinc-400 truncate">{user?.email}</p>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {user?.roles?.map((role) => (
                    <span
                      key={role}
                      className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                    >
                      {roleLabelMap[role] || role}
                    </span>
                  ))}
                </div>
              </div>

              {/* Navigation Links */}
              <div className="py-1 px-1 space-y-0.5">
                <Link
                  href="/claims"
                  onClick={() => setShowProfileMenu(false)}
                  className="flex items-center gap-2.5 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900 rounded-lg dark:text-zinc-300 dark:hover:bg-zinc-800 transition-colors"
                >
                  <FileText className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Claims</span>
                </Link>

                <Link
                  href="/notifications"
                  onClick={() => setShowProfileMenu(false)}
                  className="flex items-center gap-2.5 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900 rounded-lg dark:text-zinc-300 dark:hover:bg-zinc-800 transition-colors"
                >
                  <Bell className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Notifications</span>
                </Link>
              </div>

              {/* Sign Out Action */}
              <div className="border-t border-zinc-100 dark:border-zinc-800 pt-1 px-1">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-50 hover:text-rose-700 rounded-lg dark:text-rose-400 dark:hover:bg-rose-950/30 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
