"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/context";
import { db } from "@/lib/data/repository";
import { Notification } from "@/lib/types/database";
import { formatDateTime } from "@/lib/utils/formatters";
import { Bell, CheckCheck, Clock, ArrowRight } from "lucide-react";

export default function NotificationsPage() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isMarking, setIsMarking] = useState(false);

  const loadNotifs = () => {
    if (!user) return;
    setNotifications(db.getNotifications(user.id));
  };

  useEffect(() => {
    loadNotifs();
  }, [user]);

  const handleMarkAll = async () => {
    try {
      if (!user) return;
      setIsMarking(true);
      await db.markAllNotificationsAsRead(user.id);
      loadNotifs();
    } catch (error) {
      window.dispatchEvent(
        new CustomEvent("workspace-error", {
          detail: error instanceof Error ? error.message : "Unable to save changes.",
        })
      );
    } finally {
      setIsMarking(false);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6 max-w-4xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <Bell className="w-6 h-6 text-emerald-700" />
              Notifications Center
            </h1>
            <p className="text-xs text-slate-500">
              Real-time updates regarding claim approvals, clarification requests, and payment transactions.
            </p>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleMarkAll}
            loading={isMarking}
            disabled={isMarking}
            className="text-xs gap-1.5 border-slate-300"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            <span>Mark All as Read</span>
          </Button>
        </div>

        <Card>
          <CardContent className="p-0">
            {(notifications || []).length === 0 ? (
              <div className="py-16 text-center text-xs text-slate-400">
                No notifications to display.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {(notifications || []).map((n) => (
                  <Link
                    key={n.id}
                    href={n.link || "#"}
                    className={`flex items-start justify-between p-4 hover:bg-slate-50 transition-colors ${
                      !n.is_read ? "bg-emerald-50/30" : ""
                    }`}
                  >
                    <div className="space-y-1 pr-4">
                      <div className="flex items-center gap-2">
                        <strong className={`text-xs ${!n.is_read ? "text-emerald-950 font-bold" : "text-slate-800"}`}>
                          {n.title}
                        </strong>
                        {!n.is_read && (
                          <span className="h-2 w-2 rounded-full bg-emerald-600 inline-block" />
                        )}
                      </div>
                      <p className="text-xs text-slate-600">{n.message}</p>
                      <span className="text-[10px] text-slate-400 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDateTime(n.created_at)}
                      </span>
                    </div>

                    <ArrowRight className="w-4 h-4 text-slate-400 shrink-0 self-center" />
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
