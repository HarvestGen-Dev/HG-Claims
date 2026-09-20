"use client";

import React from "react";
import Link from "next/link";
import { 
  ShieldCheck, 
  Users, 
  Building2, 
  PieChart, 
  GitBranch, 
  History, 
  Settings,
  ArrowRight
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export default function AdminOverviewPage() {
  const adminModules = [
    {
      title: "Users & Roles",
      desc: "Manage church staff accounts, assign RBAC permissions, and configure bank accounts.",
      icon: <Users className="w-5 h-5 text-zinc-700 dark:text-zinc-300" />,
      href: "/admin/users",
    },
    {
      title: "Ministries & Departments",
      desc: "Configure church ministries and assign department leaders who approve claims.",
      icon: <Building2 className="w-5 h-5 text-zinc-700 dark:text-zinc-300" />,
      href: "/admin/ministries",
    },
    {
      title: "Budget Cost Centres",
      desc: "Define budget line codes and link them to respective church ministries.",
      icon: <PieChart className="w-5 h-5 text-zinc-700 dark:text-zinc-300" />,
      href: "/admin/cost-centres",
    },
    {
      title: "Approval Workflows",
      desc: "View the direct Finance Review and payment process.",
      icon: <GitBranch className="w-5 h-5 text-zinc-700 dark:text-zinc-300" />,
      href: "/admin/workflows",
    },
    {
      title: "Security Audit Trail",
      desc: "Inspect immutable security logs of every claim submission, approval, edit, and payout.",
      icon: <History className="w-5 h-5 text-zinc-700 dark:text-zinc-300" />,
      href: "/admin/audit",
    },
    {
      title: "Form & Settings",
      desc: "Customize declaration statement, guidance banner, upload limits, and payment methods.",
      icon: <Settings className="w-5 h-5 text-zinc-700 dark:text-zinc-300" />,
      href: "/admin/settings",
    },
  ];

  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="pb-2 border-b border-zinc-200/80 dark:border-zinc-800">
          <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            System Administration
          </h1>
          <p className="text-xs text-zinc-500">
            Configure master records, dynamic workflow routing, user permissions, and compliance settings.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {adminModules.map((m) => (
            <Link key={m.href} href={m.href} className="group">
              <div className="h-full p-4 rounded-xl border border-zinc-200/80 bg-white dark:border-zinc-800 dark:bg-zinc-950 hover:border-zinc-400 dark:hover:border-zinc-700 transition-all shadow-2xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300">
                      {m.icon}
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-zinc-100 transition-colors" />
                  </div>
                  <h3 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 group-hover:underline">
                    {m.title}
                  </h3>
                  <p className="text-[11px] text-zinc-500 mt-1 leading-relaxed">{m.desc}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
