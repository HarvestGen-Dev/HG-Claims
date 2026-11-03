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

interface FinanceReportChartProps {
  data: Array<{ name: string; total: number }>;
}

export default function FinanceReportChart({ data }: FinanceReportChartProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 10, right: 10, left: -15, bottom: 20 }}>
        <CartesianGrid strokeDasharray="2 2" vertical={false} stroke="#f4f4f5" />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 10, fill: "#71717a" }}
          interval={0}
          angle={-25}
          textAnchor="end"
          axisLine={{ stroke: "#e4e4e7" }}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 10, fill: "#71717a" }}
          axisLine={{ stroke: "#e4e4e7" }}
          tickLine={false}
        />
        <Tooltip
          formatter={(val: any) => [`RM ${Number(val).toFixed(2)}`, "Total"]}
          contentStyle={{
            borderRadius: "8px",
            fontSize: "11px",
            border: "1px solid #e4e4e7",
          }}
        />
        <Bar dataKey="total" fill="#d95f3b" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
