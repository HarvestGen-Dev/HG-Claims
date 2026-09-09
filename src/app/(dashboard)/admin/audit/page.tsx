"use client";

import React, { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { db } from "@/lib/mock-db/repository";
import { AuditLog } from "@/lib/types/database";
import { formatDateTime } from "@/lib/utils/formatters";
import { History, Search, ShieldCheck } from "lucide-react";

export default function AuditTrailPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    setLogs(db.getAuditLogs());
  }, []);

  const filtered = logs.filter((l) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      l.action.toLowerCase().includes(q) ||
      (l.actor_name && l.actor_name.toLowerCase().includes(q)) ||
      l.entity_id.toLowerCase().includes(q)
    );
  });

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <History className="w-6 h-6 text-emerald-700" />
              Security Audit Trail
            </h1>
            <p className="text-xs text-slate-500">
              Immutable append-only record of all claim lifecycle decisions, administrative updates, and payouts.
            </p>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search action, actor..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-full pl-9 pr-3 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            {filtered.length === 0 ? (
              <div className="py-16 text-center text-xs text-slate-400">
                No audit entries recorded yet. Actions taken in the system will appear here.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50/75 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
                      <th className="py-3 px-4">Timestamp</th>
                      <th className="py-3 px-4">Actor</th>
                      <th className="py-3 px-4">Action</th>
                      <th className="py-3 px-4">Entity</th>
                      <th className="py-3 px-4">Audit Metadata</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filtered.map((l) => (
                      <tr key={l.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                          {formatDateTime(l.created_at)}
                        </td>
                        <td className="py-3 px-4">
                          <strong className="text-slate-800 block">{l.actor_name}</strong>
                          <span className="text-[10px] text-slate-400">{l.actor_email}</span>
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-emerald-800">
                          {l.action}
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px] text-slate-600">
                          {l.entity_type} #{l.entity_id.slice(-8)}
                        </td>
                        <td className="py-3 px-4 text-slate-500 font-mono text-[10px] max-w-xs truncate">
                          {l.after_data ? JSON.stringify(l.after_data) : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
