"use client";

import React from "react";
import Link from "next/link";
import { 
  ShieldCheck, 
  Users, 
  Building2, 
  Tag, 
  PieChart, 
  GitBranch, 
  History, 
  Settings,
  ArrowRight
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";

export default function AdminOverviewPage() {
  const adminModules = [
    {
      title: "Users & Roles",
      desc: "Manage church staff accounts, assign RBAC permissions, and toggle user active status.",
      icon: <Users className="w-6 h-6 text-emerald-700" />,
      href: "/admin/users",
    },
    {
      title: "Ministries & Departments",
      desc: "Configure church ministries and assign department leaders who approve claims.",
      icon: <Building2 className="w-6 h-6 text-blue-700" />,
      href: "/admin/ministries",
    },
    {
      title: "Expense Categories",
      desc: "Maintain tax and expense categories (Transportation, Hospitality, Supplies, etc.).",
      icon: <Tag className="w-6 h-6 text-amber-700" />,
      href: "/admin/categories",
    },
    {
      title: "Budget Cost Centres",
      desc: "Define budget line codes and link them to respective church ministries.",
      icon: <PieChart className="w-6 h-6 text-purple-700" />,
      href: "/admin/cost-centres",
    },
    {
      title: "Approval Workflows & Thresholds",
      desc: "Configure multi-level approval rules, custom ministry routes, and RM 500 final sign-off limits.",
      icon: <GitBranch className="w-6 h-6 text-indigo-700" />,
      href: "/admin/workflows",
    },
    {
      title: "System-Wide Audit Trail",
      desc: "Inspect immutable security logs of every claim submission, approval, edit, and payout.",
      icon: <History className="w-6 h-6 text-rose-700" />,
      href: "/admin/audit",
    },
    {
      title: "System & Numbering Settings",
      desc: "Customize claim prefix (NLCC), fiscal year formatting, church branding, and emails.",
      icon: <Settings className="w-6 h-6 text-slate-700" />,
      href: "/admin/settings",
    },
  ];

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
            <ShieldCheck className="w-7 h-7 text-emerald-700" />
            System Administration Suite
          </h1>
          <p className="text-xs text-slate-500">
            Configure master database tables, dynamic workflow routing, user security, and audit compliance.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {adminModules.map((m) => (
            <Link key={m.href} href={m.href} className="group">
              <Card className="h-full hover:border-emerald-500 transition-all hover:shadow-md">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="p-2.5 rounded-xl bg-slate-50 group-hover:bg-emerald-50 transition-colors">
                      {m.icon}
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-emerald-700 transition-colors" />
                  </div>
                  <CardTitle className="text-base font-bold mt-2 text-slate-900 group-hover:text-emerald-800">
                    {m.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-slate-500 leading-relaxed">{m.desc}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
