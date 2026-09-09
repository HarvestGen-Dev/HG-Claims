"use client";

import React, { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { db } from "@/lib/mock-db/repository";
import { ApprovalRule, Ministry, ExpenseCategory } from "@/lib/types/database";
import { GitBranch, Plus, ShieldCheck, CheckCircle2, Edit, Trash2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils/formatters";

export default function WorkflowConfigurationPage() {
  const [rules, setRules] = useState<ApprovalRule[]>(db.getApprovalRules());
  const [threshold, setThreshold] = useState<number>(
    db.getSetting("approval_thresholds")?.final_approval_threshold || 500
  );
  const [savedSuccess, setSavedSuccess] = useState(false);

  const ministries = db.getMinistries();
  const categories = db.getCategories();
  const profiles = db.getProfiles();

  const [editingRule, setEditingRule] = useState<ApprovalRule | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    ministry_id: "",
    expense_category_id: "",
    min_amount: 0,
    max_amount: "",
    sequence: 1,
    approver_role: "MINISTRY_LEADER",
    approver_user_id: "",
    is_active: true,
  });
  const [error, setError] = useState("");

  const refresh = () => setRules(db.getApprovalRules());

  const handleSaveThreshold = () => {
    db.updateSetting("approval_thresholds", { final_approval_threshold: Number(threshold), currency: "MYR" });
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  const handleOpenCreate = () => {
    setFormData({
      name: "",
      description: "",
      ministry_id: "",
      expense_category_id: "",
      min_amount: 0,
      max_amount: "",
      sequence: rules.length + 1,
      approver_role: "MINISTRY_LEADER",
      approver_user_id: "",
      is_active: true,
    });
    setError("");
    setIsCreating(true);
  };

  const handleOpenEdit = (r: ApprovalRule) => {
    setEditingRule(r);
    setFormData({
      name: r.name,
      description: r.description || "",
      ministry_id: r.ministry_id || "",
      expense_category_id: r.expense_category_id || "",
      min_amount: r.min_amount,
      max_amount: r.max_amount !== null && r.max_amount !== undefined ? String(r.max_amount) : "",
      sequence: r.sequence,
      approver_role: r.approver_role,
      approver_user_id: r.approver_user_id || "",
      is_active: r.is_active,
    });
    setError("");
  };

  const handleSaveRule = () => {
    if (!formData.name.trim()) {
      setError("Rule name is required.");
      return;
    }

    const payload = {
      name: formData.name.trim(),
      description: formData.description.trim(),
      ministry_id: formData.ministry_id || null,
      expense_category_id: formData.expense_category_id || null,
      min_amount: Number(formData.min_amount) || 0,
      max_amount: formData.max_amount ? Number(formData.max_amount) : null,
      sequence: Number(formData.sequence) || 1,
      approver_role: formData.approver_role as any,
      approver_user_id: formData.approver_user_id || null,
      is_active: formData.is_active,
    };

    if (isCreating) {
      db.createApprovalRule(payload);
      setIsCreating(false);
    } else if (editingRule) {
      db.updateApprovalRule(editingRule.id, payload);
      setEditingRule(null);
    }

    refresh();
  };

  const handleDeleteRule = (id: string) => {
    if (confirm("Are you sure you want to remove this approval rule?")) {
      db.deleteApprovalRule(id);
      refresh();
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <GitBranch className="w-6 h-6 text-emerald-700" />
              Approval Workflow Rules & Thresholds
            </h1>
            <p className="text-xs text-slate-500">
              Configure dynamic multi-tier routing policies, role sequences, and mandatory executive final approval thresholds.
            </p>
          </div>

          <Button
            onClick={handleOpenCreate}
            className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs gap-1.5 shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>+ Add Approval Rule</span>
          </Button>
        </div>

        {/* Executive Final Approval Threshold Card */}
        <Card className="border-emerald-300 bg-emerald-50/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold text-emerald-900 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-700" />
              Executive Final Approval Threshold Policy
            </CardTitle>
            <CardDescription className="text-xs text-emerald-800">
              Any expense claim exceeding this threshold requires mandatory 3rd-tier approval from the Senior Pastor / Final Approver.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="relative w-48">
                <span className="absolute left-3 top-2.5 text-xs font-bold text-slate-500">RM</span>
                <Input
                  type="number"
                  step="50"
                  value={threshold}
                  onChange={(e) => setThreshold(parseFloat(e.target.value) || 0)}
                  className="pl-10 font-bold text-slate-900 bg-white"
                />
              </div>
              <Button
                onClick={handleSaveThreshold}
                className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs"
              >
                Save Threshold Limit
              </Button>
            </div>

            {savedSuccess && (
              <div className="flex items-center gap-1.5 text-xs text-emerald-800 font-semibold animate-in fade-in">
                <CheckCircle2 className="w-4 h-4" />
                <span>Approval threshold policy updated successfully.</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Approval Rules Table */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold">Active Approval Rules Engine</CardTitle>
            <CardDescription className="text-xs">
              Workflow steps snapshot into claims upon submission, guaranteeing historical integrity.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50/75 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
                    <th className="py-3 px-4 w-14 text-center">Seq</th>
                    <th className="py-3 px-4">Rule Name</th>
                    <th className="py-3 px-4">Ministry</th>
                    <th className="py-3 px-4">Min Amount</th>
                    <th className="py-3 px-4">Max Amount</th>
                    <th className="py-3 px-4">Approver Role</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rules.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/70">
                      <td className="py-3.5 px-4 font-bold text-slate-400 text-center">{r.sequence}</td>
                      <td className="py-3.5 px-4 font-semibold text-slate-900">{r.name}</td>
                      <td className="py-3.5 px-4 text-slate-600">{r.ministry?.name || "All Ministries"}</td>
                      <td className="py-3.5 px-4 font-mono">{formatCurrency(r.min_amount)}</td>
                      <td className="py-3.5 px-4 font-mono">{r.max_amount ? formatCurrency(r.max_amount) : "No Limit"}</td>
                      <td className="py-3.5 px-4">
                        <span className="font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 text-[10px]">
                          {r.approver_role.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                          {r.is_active ? "ACTIVE" : "INACTIVE"}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenEdit(r)}
                          className="text-xs h-7 px-2.5"
                        >
                          <Edit className="w-3 h-3 mr-1" />
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteRule(r.id)}
                          className="text-xs h-7 px-2.5 text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Create / Edit Rule Modal */}
      {(isCreating || editingRule) && (
        <Dialog open={true} onOpenChange={() => { setIsCreating(false); setEditingRule(null); }}>
          <DialogHeader>
            <DialogTitle>{isCreating ? "Create Approval Workflow Rule" : `Edit Rule: ${editingRule?.name}`}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 my-2 text-xs">
            <div className="space-y-1">
              <label className="font-semibold text-slate-700">Rule Name *</label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. Youth Camp Large Expenditure Endorsement"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Sequence Step #</label>
                <Input
                  type="number"
                  min="1"
                  value={formData.sequence}
                  onChange={(e) => setFormData({ ...formData, sequence: Number(e.target.value) })}
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Approver Role *</label>
                <select
                  value={formData.approver_role}
                  onChange={(e) => setFormData({ ...formData, approver_role: e.target.value })}
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs"
                >
                  <option value="MINISTRY_LEADER">Ministry Leader</option>
                  <option value="FINANCE_OFFICER">Finance Officer</option>
                  <option value="FINAL_APPROVER">Final Approver (Senior Pastor)</option>
                  <option value="SPECIFIC_USER">Specific Designated User</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Min Amount (RM)</label>
                <Input
                  type="number"
                  step="10"
                  value={formData.min_amount}
                  onChange={(e) => setFormData({ ...formData, min_amount: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Max Amount (RM, Blank for No Limit)</label>
                <Input
                  type="number"
                  step="10"
                  placeholder="No upper limit"
                  value={formData.max_amount}
                  onChange={(e) => setFormData({ ...formData, max_amount: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-slate-700">Scope to Specific Ministry (Optional)</label>
              <select
                value={formData.ministry_id}
                onChange={(e) => setFormData({ ...formData, ministry_id: e.target.value })}
                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs"
              >
                <option value="">All Church Ministries</option>
                {ministries.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>

            {formData.approver_role === "SPECIFIC_USER" && (
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Designated Approver User *</label>
                <select
                  value={formData.approver_user_id}
                  onChange={(e) => setFormData({ ...formData, approver_user_id: e.target.value })}
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs"
                >
                  <option value="">-- Select Specific User --</option>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>{p.full_name} ({p.email})</option>
                  ))}
                </select>
              </div>
            )}

            <div className="space-y-1">
              <label className="font-semibold text-slate-700">Rule Description</label>
              <Textarea
                rows={2}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>

            {error && <p className="text-xs text-red-600 font-medium">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsCreating(false); setEditingRule(null); }}>
              Cancel
            </Button>
            <Button onClick={handleSaveRule} className="bg-emerald-700 hover:bg-emerald-800 text-white">
              {isCreating ? "Create Workflow Rule" : "Save Changes"}
            </Button>
          </DialogFooter>
        </Dialog>
      )}
    </AppLayout>
  );
}
