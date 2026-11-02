"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Wallet,
  BarChart3,
  Layers,
  Download
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { useAuth } from "@/lib/auth/context";
import { claimsClient, financeClient, workspaceStore } from "@/lib/domains";
import { Claim } from "@/lib/types/database";
import { formatCurrency } from "@/lib/utils/formatters";
import { generateClaimsCsv, downloadCsv } from "@/lib/utils/export-csv";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  CartesianGrid
} from "recharts";

const COLORS = ["#18181b", "#3f3f46", "#52525b", "#71717a", "#2563eb", "#d97706", "#7c3aed", "#a1a1aa"];

export default function FinanceDashboardPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState<any>(null);
  const [claims, setClaims] = useState<Claim[]>([]);

  useEffect(() => {
    if (!user) return;
    const sync = () => {
      setStats(financeClient.getFinanceStats());
      setClaims(claimsClient.getClaims(user));
    };
    sync();
    return workspaceStore.subscribe(sync);
  }, [user]);

  const handleExport = () => {
    const csv = generateClaimsCsv(claims);
    downloadCsv(`finance_claims_summary_${new Date().toISOString().split("T")[0]}.csv`, csv);
  };

  return (
    <AppLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-2 border-b border-zinc-200/80 dark:border-zinc-800">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
              Finance Overview
            </h1>
            <p className="text-xs text-zinc-500">
              Review receipts, verify budgets, schedule bank payouts, and inspect expenditure analytics.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              className="h-8 gap-1.5 border-zinc-200 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 text-xs"
            >
              <Download className="w-3.5 h-3.5 text-zinc-400" />
              <span>Export Ledger</span>
            </Button>
            <Link href="/finance/claims">
              <Button size="sm" className="h-8 bg-zinc-900 hover:bg-zinc-800 text-white gap-1.5 text-xs shadow-2xs font-medium">
                <Layers className="w-3.5 h-3.5" />
                <span>Process & Disburse</span>
              </Button>
            </Link>
          </div>
        </div>

        {/* 4 Primary Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Link href="/finance/claims?status=PENDING_FINANCE_REVIEW" className="group">
            <div className="p-3.5 rounded-xl border border-zinc-200/80 bg-white hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900/80 transition-all shadow-2xs">
              <div className="flex items-center justify-between text-zinc-400 mb-1.5">
                <span className="text-[11px] font-medium tracking-wide text-zinc-500">Awaiting Review</span>
                <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />
              </div>
              <p className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 tabular-nums">{stats?.awaitingReview || 0}</p>
              <span className="text-[10px] text-zinc-400 block mt-0.5">Needs receipt audit</span>
            </div>
          </Link>

          <Link href="/finance/claims?status=APPROVED_FOR_PAYMENT" className="group">
            <div className="p-3.5 rounded-xl border border-zinc-200/80 bg-white hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900/80 transition-all shadow-2xs">
              <div className="flex items-center justify-between text-zinc-400 mb-1.5">
                <span className="text-[11px] font-medium tracking-wide text-zinc-500">Awaiting Payout</span>
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              </div>
              <p className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 tabular-nums">{stats?.awaitingPayment || 0}</p>
              <span className="text-[10px] text-zinc-400 block mt-0.5">Ready for EFT batch</span>
            </div>
          </Link>

          <div className="p-3.5 rounded-xl border border-zinc-200/80 bg-white dark:border-zinc-800 dark:bg-zinc-900/80 shadow-2xs">
            <div className="flex items-center justify-between text-zinc-400 mb-1.5">
              <span className="text-[11px] font-medium tracking-wide text-zinc-500">Paid Vouchers</span>
              <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" />
            </div>
            <p className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 tabular-nums">{stats?.paidCount || 0}</p>
            <span className="text-[10px] text-zinc-400 block mt-0.5">Settled this period</span>
          </div>

          <div className="p-3.5 rounded-xl border border-zinc-200/80 bg-zinc-900 text-white dark:border-zinc-800 dark:bg-zinc-900 shadow-2xs">
            <div className="flex items-center justify-between text-zinc-400 mb-1.5">
              <span className="text-[11px] font-medium tracking-wide text-zinc-400">Total Disbursed</span>
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </div>
            <p className="text-xl font-bold font-mono text-emerald-400 tabular-nums">
              {formatCurrency(stats?.totalPaidAmount || 0)}
            </p>
            <span className="text-[10px] text-zinc-400 block mt-0.5">Fiscal year total</span>
          </div>
        </div>

        {/* Analytics Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Spend by Ministry */}
          <Card className="lg:col-span-7 border-zinc-200/80 shadow-2xs">
            <CardHeader className="py-3 px-4 border-b border-zinc-100 dark:border-zinc-800 flex flex-row items-center justify-between">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
                Expenditure by Ministry
              </CardTitle>
              <BarChart3 className="w-3.5 h-3.5 text-zinc-400" />
            </CardHeader>
            <CardContent className="p-4">
              <div className="h-60 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats?.byMinistry || []} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="2 2" vertical={false} stroke="#f4f4f5" />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#71717a' }} interval={0} axisLine={{ stroke: '#e4e4e7' }} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: '#71717a' }} axisLine={{ stroke: '#e4e4e7' }} tickLine={false} />
                    <Tooltip
                      formatter={(val: any) => [`RM ${Number(val).toFixed(2)}`, "Total Spend"]}
                      contentStyle={{ borderRadius: '8px', fontSize: '11px', border: '1px solid #e4e4e7', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
                    />
                    <Bar dataKey="total" fill="#18181b" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Spend by Cost Centre */}
          <Card className="lg:col-span-5 border-zinc-200/80 shadow-2xs">
            <CardHeader className="py-3 px-4 border-b border-zinc-100 dark:border-zinc-800 flex flex-row items-center justify-between">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
                Cost Centre Distribution
              </CardTitle>
              <span className="text-[10px] text-zinc-400">By total spend</span>
            </CardHeader>
            <CardContent className="p-4">
              <div className="h-60 w-full flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={stats?.byCostCentre || []}
                      dataKey="total"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={48}
                      outerRadius={76}
                      paddingAngle={3}
                    >
                      {(stats?.byCostCentre || []).map((_: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(val: any) => [`RM ${Number(val).toFixed(2)}`, "Amount"]}
                      contentStyle={{ borderRadius: '8px', fontSize: '11px', border: '1px solid #e4e4e7', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
