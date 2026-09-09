"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { 
  Wallet, 
  Clock, 
  CheckCircle2, 
  Banknote, 
  BarChart3, 
  TrendingUp, 
  Layers, 
  Download, 
  ArrowRight,
  ShieldCheck,
  Building2
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { useAuth } from "@/lib/auth/context";
import { db } from "@/lib/mock-db/repository";
import { Claim } from "@/lib/types/database";
import { formatCurrency, formatDate } from "@/lib/utils/formatters";
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

export default function FinanceDashboardPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState<any>(null);
  const [claims, setClaims] = useState<Claim[]>([]);

  useEffect(() => {
    if (!user) return;
    setStats(db.getFinanceStats());
    setClaims(db.getClaims(user));
  }, [user]);

  const handleExport = () => {
    const csv = generateClaimsCsv(claims);
    downloadCsv(`finance_claims_summary_${new Date().toISOString().split("T")[0]}.csv`, csv);
  };

  const COLORS = ["#047857", "#0284c7", "#d97706", "#7c3aed", "#e11d48", "#475569", "#059669", "#2563eb"];

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
              <Wallet className="w-7 h-7 text-emerald-700" />
              Finance Operations Workspace
            </h1>
            <p className="text-xs text-slate-500">
              Review receipts, verify cost center budgets, schedule bank payouts, and audit expense distributions.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              className="gap-1.5 border-slate-300 text-xs"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Ledger</span>
            </Button>
            <Link href="/finance/claims">
              <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white gap-1.5 text-xs">
                <Layers className="w-4 h-4" />
                <span>Process & Pay Claims</span>
              </Button>
            </Link>
          </div>
        </div>

        {/* 4 Primary Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link href="/finance/claims?status=PENDING_FINANCE_REVIEW">
            <Card className="hover:border-amber-300 transition-all hover:shadow-sm">
              <CardContent className="p-5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-700 uppercase tracking-wider">Awaiting Review</span>
                  <Clock className="w-5 h-5 text-amber-500" />
                </div>
                <p className="text-3xl font-black text-amber-950">{stats?.awaitingReview || 0}</p>
                <span className="text-xs text-amber-700/80 block">Requires receipt audit</span>
              </CardContent>
            </Card>
          </Link>

          <Link href="/finance/claims?status=APPROVED_FOR_PAYMENT">
            <Card className="hover:border-teal-300 transition-all hover:shadow-sm bg-teal-50/20">
              <CardContent className="p-5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-teal-700 uppercase tracking-wider">Awaiting Payment</span>
                  <Banknote className="w-5 h-5 text-teal-600" />
                </div>
                <p className="text-3xl font-black text-teal-950">{stats?.awaitingPayment || 0}</p>
                <span className="text-xs text-teal-700/80 block">Approved & ready to disburse</span>
              </CardContent>
            </Card>
          </Link>

          <Card className="hover:border-slate-300 transition-all">
            <CardContent className="p-5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Paid Claims (Month)</span>
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              </div>
              <p className="text-3xl font-black text-slate-900">{stats?.paidCount || 0}</p>
              <span className="text-xs text-slate-500 block">Vouchers settled</span>
            </CardContent>
          </Card>

          <Card className="bg-emerald-900 text-white shadow-md">
            <CardContent className="p-5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-300 uppercase tracking-wider">Total Disbursed</span>
                <TrendingUp className="w-5 h-5 text-emerald-400" />
              </div>
              <p className="text-2xl sm:text-3xl font-black text-emerald-300">
                {formatCurrency(stats?.totalPaidAmount || 0)}
              </p>
              <span className="text-xs text-emerald-200 block">Current fiscal year total</span>
            </CardContent>
          </Card>
        </div>

        {/* Analytics Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Spend by Ministry Bar Chart */}
          <Card className="lg:col-span-7">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold text-slate-900 flex items-center justify-between">
                <span>Claims by Ministry Department</span>
                <BarChart3 className="w-4 h-4 text-slate-400" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats?.byMinistry || []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} stroke="#94a3b8" />
                    <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" />
                    <Tooltip 
                      formatter={(val: any) => [`RM ${Number(val).toFixed(2)}`, "Total Spend"]}
                      contentStyle={{ borderRadius: '12px', fontSize: '12px', border: '1px solid #e2e8f0' }}
                    />
                    <Bar dataKey="total" fill="#047857" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Spend by Expense Category Donut Chart */}
          <Card className="lg:col-span-5">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold text-slate-900 flex items-center justify-between">
                <span>Expense Category Distribution</span>
                <span className="text-xs text-slate-400 font-normal">By total spend</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64 w-full flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={stats?.byCategory || []}
                      dataKey="total"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={4}
                    >
                      {(stats?.byCategory || []).map((_: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(val: any) => [`RM ${Number(val).toFixed(2)}`, "Amount"]}
                      contentStyle={{ borderRadius: '12px', fontSize: '12px', border: '1px solid #e2e8f0' }}
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
