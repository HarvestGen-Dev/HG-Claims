"use client";

import { Select } from "@/components/ui/select";
import React, { useState, useEffect, useMemo } from "react";
import {
  FileSpreadsheet
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { useAuth } from "@/lib/auth/context";
import { claimsClient, masterDataClient, workspaceStore } from "@/lib/domains";
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
  CartesianGrid,
  PieChart,
  Pie,
  Cell
} from "recharts";

const COLORS = ["#D95F3B", "#A3BFD9", "#5B6C32", "#3A3A3A", "#FDF6EF"];

export default function FinancialReportsPage() {
  const { user } = useAuth();
  const [claims, setClaims] = useState<Claim[]>([]);
  const [selectedMinistry, setSelectedMinistry] = useState("ALL");
  const [selectedCostCentre, setSelectedCostCentre] = useState("ALL");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const ministries = masterDataClient.getMinistries();
  const costCentres = masterDataClient.getCostCentres();

  useEffect(() => {
    if (!user) return;
    setClaims(claimsClient.getClaims(user));
    return workspaceStore.subscribe(() => {
      setClaims(claimsClient.getClaims(user));
    });
  }, [user]);

  const {
    filtered,
    totalClaimed,
    paidClaims,
    totalPaid,
    averageClaim,
    ministryChartData,
    costCentreChartData,
  } = useMemo(() => {
    const costCentreById = new Map(costCentres.map(cc => [cc.id, `${cc.code} - ${cc.name}`]));

    const matching = claims.filter((c) => {
      if (selectedMinistry !== "ALL" && c.ministry_id !== selectedMinistry) return false;
      if (startDate && c.claim_date < startDate) return false;
      if (endDate && c.claim_date > endDate) return false;
      if (selectedCostCentre !== "ALL") {
        const hasCostCentre = (c.expenses || []).some(e => e.cost_centre_id === selectedCostCentre);
        if (!hasCostCentre) return false;
      }
      return true;
    });

    let claimedSum = 0;
    let paidSum = 0;
    const paidList: Claim[] = [];
    const ministryDataMap: Record<string, number> = {};
    const costCentreDataMap: Record<string, number> = {};

    for (const c of matching) {
      const amt = Number(c.total_amount);
      claimedSum += amt;
      if (c.status === "PAID") {
        paidList.push(c);
        paidSum += amt;
      }
      const mName = c.ministry?.name || "Other";
      ministryDataMap[mName] = (ministryDataMap[mName] || 0) + amt;

      for (const e of c.expenses || []) {
        const ccName = (e.cost_centre_id && costCentreById.get(e.cost_centre_id)) || "General";
        costCentreDataMap[ccName] = (costCentreDataMap[ccName] || 0) + Number(e.amount);
      }
    }

    return {
      filtered: matching,
      totalClaimed: claimedSum,
      paidClaims: paidList,
      totalPaid: paidSum,
      averageClaim: matching.length > 0 ? claimedSum / matching.length : 0,
      ministryChartData: Object.entries(ministryDataMap).map(([name, total]) => ({ name, total })),
      costCentreChartData: Object.entries(costCentreDataMap).map(([name, total]) => ({ name, total })),
    };
  }, [claims, costCentres, selectedMinistry, selectedCostCentre, startDate, endDate]);

  const handleExportCsv = () => {
    const csv = generateClaimsCsv(filtered);
    downloadCsv(`HG_Expense_Report_${new Date().toISOString().split("T")[0]}.csv`, csv);
  };

  return (
    <AppLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-2 border-b border-zinc-200/80 dark:border-zinc-800">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
              Financial Reporting
            </h1>
            <p className="text-xs text-zinc-500">
              Audit spend allocations, export monthly reconciliation files, and analyze budget utilization.
            </p>
          </div>

          <Button
            onClick={handleExportCsv}
            size="sm"
            className="h-8 bg-zinc-900 hover:bg-zinc-800 text-white gap-1.5 shadow-2xs text-xs font-medium"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Download CSV</span>
          </Button>
        </div>

        {/* Filter Bar */}
        <div className="filter-bar grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5">
          <div className="space-y-1">
            <label htmlFor="reports-select-1" className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider">Ministry</label>
            <Select id="reports-select-1"
              value={selectedMinistry}
              onChange={(e) => setSelectedMinistry(e.target.value)}
              className="w-full"
            >
              <option value="ALL">All Ministries</option>
              {ministries.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </Select>
          </div>

          <div className="space-y-1">
            <label htmlFor="reports-select-2" className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider">Cost Centre</label>
            <Select id="reports-select-2"
              value={selectedCostCentre}
              onChange={(e) => setSelectedCostCentre(e.target.value)}
              className="w-full"
            >
              <option value="ALL">All Cost Centres</option>
              {costCentres.map((cc) => (
                <option key={cc.id} value={cc.id}>{cc.code} - {cc.name}</option>
              ))}
            </Select>
          </div>

          <div className="space-y-1">
            <label htmlFor="report-start-date" className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider">From Date</label>
            <input
              id="report-start-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-8 w-full rounded-lg border border-zinc-200 bg-white px-2.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="report-end-date" className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider">To Date</label>
            <input
              id="report-end-date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="h-8 w-full rounded-lg border border-zinc-200 bg-white px-2.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </div>
        </div>

        {/* 4 Reporting Metric Summary Cards */}
        <div className="report-metrics grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-xl border border-zinc-200/80 bg-white dark:border-zinc-800 dark:bg-zinc-900/80 shadow-2xs">
            <span className="text-[11px] font-medium text-zinc-500 block mb-1">Total Claims</span>
            <p className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 tabular-nums">{filtered.length}</p>
            <span className="text-[10px] text-zinc-400 block mt-0.5">Matching filter</span>
          </div>

          <div className="p-3.5 rounded-xl border border-zinc-200/80 bg-white dark:border-zinc-800 dark:bg-zinc-900/80 shadow-2xs">
            <span className="text-[11px] font-medium text-zinc-500 block mb-1">Total Claim Value</span>
            <p className="text-xl font-bold font-mono tracking-tight text-zinc-900 dark:text-zinc-100 tabular-nums">{formatCurrency(totalClaimed)}</p>
            <span className="text-[10px] text-zinc-400 block mt-0.5">Gross claimed amount</span>
          </div>

          <div className="p-3.5 rounded-xl border border-zinc-200/80 bg-white dark:border-zinc-800 dark:bg-zinc-900/80 shadow-2xs">
            <span className="text-[11px] font-medium text-zinc-500 block mb-1">Disbursed (Paid)</span>
            <p className="text-xl font-bold font-mono tracking-tight text-emerald-800 dark:text-emerald-400 tabular-nums">{formatCurrency(totalPaid)}</p>
            <span className="text-[10px] text-zinc-400 block mt-0.5">{paidClaims.length} vouchers reimbursed</span>
          </div>

          <div className="p-3.5 rounded-xl border border-zinc-200/80 bg-white dark:border-zinc-800 dark:bg-zinc-900/80 shadow-2xs">
            <span className="text-[11px] font-medium text-zinc-500 block mb-1">Average Voucher</span>
            <p className="text-xl font-bold font-mono tracking-tight text-zinc-900 dark:text-zinc-100 tabular-nums">{formatCurrency(averageClaim)}</p>
            <span className="text-[10px] text-zinc-400 block mt-0.5">Per submission</span>
          </div>
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <Card className="lg:col-span-7 border-zinc-200/80 shadow-2xs">
            <CardHeader className="py-3 px-4 border-b border-zinc-100 dark:border-zinc-800">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
                Expenditure by Ministry
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={ministryChartData} margin={{ top: 10, right: 10, left: -15, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="2 2" vertical={false} stroke="#f4f4f5" />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#71717a" }} interval={0} angle={-25} textAnchor="end" axisLine={{ stroke: "#e4e4e7" }} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: "#71717a" }} axisLine={{ stroke: "#e4e4e7" }} tickLine={false} />
                    <Tooltip formatter={(val: any) => [`RM ${Number(val).toFixed(2)}`, "Total"]} contentStyle={{ borderRadius: "8px", fontSize: "11px", border: "1px solid #e4e4e7" }} />
                    <Bar dataKey="total" fill="#d95f3b" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-5 border-zinc-200/80 shadow-2xs">
            <CardHeader className="py-3 px-4 border-b border-zinc-100 dark:border-zinc-800">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
                Cost Centre Distribution
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div className="h-64 w-full flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={costCentreChartData}
                      dataKey="total"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      innerRadius={45}
                      paddingAngle={3}
                    >
                      {costCentreChartData.map((_, idx) => (
                        <Cell key={`cell-${idx}`} fill={COLORS[idx % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(val: any) => [`RM ${Number(val).toFixed(2)}`, "Spend"]} contentStyle={{ borderRadius: "8px", fontSize: "11px", border: "1px solid #e4e4e7" }} />
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
