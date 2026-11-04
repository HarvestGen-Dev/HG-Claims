"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  Wallet,
  BarChart3,
  Layers,
  Download
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { useAuth } from "@/lib/auth/context";
import { claimsClient, financeClient, workspaceStore } from "@/lib/domains";
import { Claim } from "@/lib/types/database";
import { formatCurrency } from "@/lib/utils/formatters";
import { generateClaimsCsv, downloadCsv } from "@/lib/utils/export-csv";

const FinanceOverviewChart = dynamic(
  () => import("@/components/finance/FinanceOverviewChart"),
  {
    ssr: false,
    loading: () => (
      <div className="h-full w-full rounded-lg bg-zinc-50 dark:bg-zinc-900/40 animate-pulse" />
    ),
  }
);


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
    return workspaceStore.subscribeDomains(["claims", "master-data", "iam"], sync);
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
              Track claims, payouts, and spending by ministry.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={handleExport} className="min-h-11 gap-2">
              <Download className="size-4" /> Export ledger
            </Button>
            <Link href="/finance/batches" className={buttonVariants({ variant: "outline", className: "min-h-11 gap-2" })}>
              <Wallet className="size-4" /> Bank batches
            </Link>
            <Link href="/finance/claims" className={buttonVariants({ className: "min-h-11 gap-2" })}>
              <Layers className="size-4" /> Reimbursements
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

          <div className="p-3.5 rounded-xl border border-primary/20 bg-accent text-accent-foreground">
            <div className="flex items-center justify-between text-zinc-400 mb-1.5">
              <span className="text-[11px] font-medium tracking-wide text-muted-foreground">Total Disbursed</span>
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            </div>
            <p className="text-xl font-bold font-mono text-primary tabular-nums">
              {formatCurrency(stats?.totalPaidAmount || 0)}
            </p>
            <span className="text-[10px] text-muted-foreground block mt-0.5">Fiscal year total</span>
          </div>
        </div>

        {/* Analytics Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Spend by Ministry */}
          <Card className="lg:col-span-12 border-zinc-200/80 shadow-2xs">
            <CardHeader className="py-3 px-4 border-b border-zinc-100 dark:border-zinc-800 flex flex-row items-center justify-between">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
                Expenditure by Ministry
              </CardTitle>
              <BarChart3 className="w-3.5 h-3.5 text-zinc-400" />
            </CardHeader>
            <CardContent className="p-4">
              <div className="h-60 w-full">
                <FinanceOverviewChart data={stats?.byMinistry || []} />
              </div>
            </CardContent>
          </Card>


        </div>
      </div>
    </AppLayout>
  );
}
