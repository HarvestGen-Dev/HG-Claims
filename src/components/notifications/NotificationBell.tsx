"use client";

import React, { useState, useEffect, useRef } from "react";
import { Bell, CheckCheck, Clock, ArrowRight } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/lib/auth/context";
import { db } from "@/lib/data/repository";
import { Notification } from "@/lib/types/database";
import { formatDateTime } from "@/lib/utils/formatters";

export function NotificationBell() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    const loadNotifs = () => {
      const items = db.getNotifications(user.id);
      setNotifications(items);
    };
    loadNotifs();

    // Poll periodically or update on focus
    const interval = setInterval(loadNotifs, 3000);
    return () => clearInterval(interval);
  }, [user]);

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const handleMarkAllRead = async () => {
    try {
    if (!user) return;
    await db.markAllNotificationsAsRead(user.id);
    setNotifications(db.getNotifications(user.id));

    } catch (error) { window.dispatchEvent(new CustomEvent("workspace-error", { detail: error instanceof Error ? error.message : "Unable to save changes." })); }
  };

  const handleItemClick = async (n: Notification) => {
    try {
    await db.markNotificationAsRead(n.id);
    setNotifications(prev => prev.map(item => item.id === n.id ? { ...item, is_read: true } : item));
    setIsOpen(false);

    } catch (error) { window.dispatchEvent(new CustomEvent("workspace-error", { detail: error instanceof Error ? error.message : "Unable to save changes." })); }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white shadow-sm animate-pulse">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl bg-white shadow-2xl border border-slate-200 z-50 overflow-hidden dark:bg-slate-900 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/75 dark:bg-slate-800/50">
            <div className="flex items-center space-x-2">
              <span className="font-semibold text-sm text-slate-900 dark:text-slate-100">Notifications</span>
              {unreadCount > 0 && (
                <span className="bg-emerald-100 text-emerald-800 text-xs font-semibold px-2 py-0.5 rounded-full">
                  {unreadCount} new
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs text-emerald-700 hover:text-emerald-800 font-medium flex items-center space-x-1"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>Mark all read</span>
              </button>
            )}
          </div>

          <div className="max-h-[380px] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
            {notifications.length === 0 ? (
              <div className="py-8 text-center text-slate-500 text-sm">
                No notifications right now
              </div>
            ) : (
              notifications.slice(0, 10).map((n) => (
                <Link
                  key={n.id}
                  href={n.link || "#"}
                  onClick={() => handleItemClick(n)}
                  className={`block px-4 py-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60 ${
                    !n.is_read ? "bg-emerald-50/40 dark:bg-emerald-950/20" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-xs font-semibold ${!n.is_read ? "text-emerald-900 dark:text-emerald-300" : "text-slate-800 dark:text-slate-200"}`}>
                      {n.title}
                    </p>
                    {!n.is_read && (
                      <span className="h-2 w-2 rounded-full bg-emerald-600 shrink-0 mt-1" />
                    )}
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 line-clamp-2">
                    {n.message}
                  </p>
                  <div className="flex items-center text-[10px] text-slate-400 mt-1.5 space-x-1">
                    <Clock className="w-3 h-3" />
                    <span>{formatDateTime(n.created_at)}</span>
                  </div>
                </Link>
              ))
            )}
          </div>

          <div className="p-2 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 text-center">
            <Link
              href="/notifications"
              onClick={() => setIsOpen(false)}
              className="text-xs text-slate-600 hover:text-emerald-700 font-medium inline-flex items-center gap-1 py-1"
            >
              <span>View all notifications</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
