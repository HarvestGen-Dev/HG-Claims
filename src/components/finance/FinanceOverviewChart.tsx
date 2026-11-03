"use client";

import React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

interface FinanceOverviewChartProps {
  data: Array<{ name: string; total: number }>;
}

export default function FinanceOverviewChart({ data }: FinanceOverviewChartProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data || []} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
        <CartesianGrid strokeDasharray="2 2" vertical={false} stroke="#f4f4f5" />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 10, fill: "#71717a" }}
          interval={0}
          axisLine={{ stroke: "#e4e4e7" }}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 10, fill: "#71717a" }}
          axisLine={{ stroke: "#e4e4e7" }}
          tickLine={false}
        />
        <Tooltip
          formatter={(val: any) => [`RM ${Number(val).toFixed(2)}`, "Total Spend"]}
          contentStyle={{
            borderRadius: "8px",
            fontSize: "11px",
            border: "1px solid #e4e4e7",
            boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
          }}
        />
        <Bar dataKey="total" fill="#18181b" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
