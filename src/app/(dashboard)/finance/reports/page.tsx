"use client";

import React, { useState, useEffect } from "react";
import { 
  BarChart3, 
  Download, 
  Calendar, 
  Building2, 
  Tag, 
  PieChart as PieIcon, 
  TrendingUp,
  FileSpreadsheet,
  Layers
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
  CartesianGrid, 
  PieChart, 
  Pie, 
  Cell 
} from "recharts";

export default function FinancialReportsPage() {
  const { user } = useAuth();
  const [claims, setClaims] = useState<Claim[]>([]);
  const [selectedMinistry, setSelectedMinistry] = useState("ALL");
  const [selectedCategory, setSelectedCategory] = useState("ALL");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const ministries = db.getMinistries();
  const categories = db.getCategories();

  useEffect(() => {
    if (!user) return;
    setClaims(db.getClaims(user));
  }, [user]);

  const filtered = claims.filter((c) => {
    if (selectedMinistry !== "ALL" && c.ministry_id !== selectedMinistry) return false;
    if (startDate && c.claim_date < startDate) return false;
    if (endDate && c.claim_date > endDate) return false;
    if (selectedCategory !== "ALL") {
      const hasCategory = (c.expenses || []).some(e => e.expense_category_id === selectedCategory);
      if (!hasCategory) return false;
    }
    return true;
  });

  const totalClaimed = filtered.reduce((sum, c) => sum + Number(c.total_amount), 0);
  const paidClaims = filtered.filter(c => c.status === "PAID");
  const totalPaid = paidClaims.reduce((sum, c) => sum + Number(c.total_amount), 0);
  const averageClaim = filtered.length > 0 ? totalClaimed / filtered.length : 0;

  // Aggregate Spend by Ministry
  const ministryDataMap: Record<string, number> = {};
  filtered.forEach(c => {
    const name = c.ministry?.name || "Other";
    ministryDataMap[name] = (ministryDataMap[name] || 0) + Number(c.total_amount);
  });
  const ministryChartData = Object.entries(ministryDataMap).map(([name, total]) => ({ name, total }));

  // Aggregate Spend by Category
  const categoryDataMap: Record<string, number> = {};
  filtered.forEach(c => {
    (c.expenses || []).forEach(e => {
      const cat = categories.find(cat => cat.id === e.expense_category_id);
      const name = cat?.name || "General";
      categoryDataMap[name] = (categoryDataMap[name] || 0) + Number(e.amount);
    });
  });
  const categoryChartData = Object.entries(categoryDataMap).map(([name, total]) => ({ name, total }));

  const COLORS = ["#047857", "#0284c7", "#d97706", "#7c3aed", "#e11d48", "#475569", "#059669", "#2563eb", "#d946ef", "#06b6d4"];

  const handleExportCsv = () => {
    const csv = generateClaimsCsv(filtered);
    downloadCsv(`NLCC_Expense_Report_${new Date().toISOString().split("T")[0]}.csv`, csv);
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
              <BarChart3 className="w-7 h-7 text-emerald-700" />
              Financial Reporting & Ledger
            </h1>
            <p className="text-xs text-slate-500">
              Audit spend allocations, export monthly reconciliation files, and analyze budget utilization.
            </p>
          </div>

          <Button
            onClick={handleExportCsv}
            className="bg-emerald-700 hover:bg-emerald-800 text-white gap-2 shadow-sm text-xs"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Download Excel / CSV</span>
          </Button>
        </div>

        {/* Filter Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 bg-white p-3 rounded-2xl border border-slate-200">
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Ministry</label>
            <select
              value={selectedMinistry}
              onChange={(e) => setSelectedMinistry(e.target.value)}
              className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="ALL">All Ministries</option>
              {ministries.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Category</label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="ALL">All Categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">From Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">To Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
        </div>

        {/* 4 Reporting Metric Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 space-y-1">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Claims</span>
              <p className="text-2xl font-black text-slate-900">{filtered.length}</p>
              <span className="text-[11px] text-slate-500 block">Matching filter parameters</span>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 space-y-1">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Claim Value</span>
              <p className="text-2xl font-black text-emerald-800">{formatCurrency(totalClaimed)}</p>
              <span className="text-[11px] text-slate-500 block">Gross submitted amount</span>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 space-y-1">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Disbursed (Paid)</span>
              <p className="text-2xl font-black text-emerald-950">{formatCurrency(totalPaid)}</p>
              <span className="text-[11px] text-slate-500 block">{paidClaims.length} vouchers reimbursed</span>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 space-y-1">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Average Claim</span>
              <p className="text-2xl font-black text-slate-900">{formatCurrency(averageClaim)}</p>
              <span className="text-[11px] text-slate-500 block">Per voucher</span>
            </CardContent>
          </Card>
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <Card className="lg:col-span-7">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold">Expenditure by Ministry</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={ministryChartData} margin={{ top: 10, right: 10, left: -10, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" stroke="#94a3b8" />
                    <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" />
                    <Tooltip formatter={(val: any) => [`RM ${Number(val).toFixed(2)}`, "Total"]} />
                    <Bar dataKey="total" fill="#047857" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-5">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold">Category Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-72 w-full flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryChartData}
                      dataKey="total"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={90}
                      innerRadius={45}
                      paddingAngle={3}
                    >
                      {categoryChartData.map((_, idx) => (
                        <Cell key={`cell-${idx}`} fill={COLORS[idx % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(val: any) => [`RM ${Number(val).toFixed(2)}`, "Spend"]} />
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
