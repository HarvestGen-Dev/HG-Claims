"use client";

import React, { useState, useMemo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { masterDataClient, iamClient, claimsClient, workspaceStore } from "@/lib/domains";
import { Ministry, Profile, Claim } from "@/lib/types/database";
import { formatCurrency } from "@/lib/utils/formatters";
import { Building2, Plus, Edit, Trash2, Users, DollarSign, CheckCircle2, AlertCircle } from "lucide-react";
import { showToast } from "@/lib/utils/toast";

export default function MinistryManagementPage() {
  const [ministries, setMinistries] = useState<Ministry[]>(masterDataClient.getMinistries());
  const [profiles, setProfiles] = useState<Profile[]>(iamClient.getProfiles());
  const [claims, setClaims] = useState<Claim[]>(claimsClient.getClaims());

  const [editingMin, setEditingMin] = useState<Ministry | null>(null);
  const [deletingMin, setDeletingMin] = useState<Ministry | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Team Leads Modal State
  const [teamLeadMin, setTeamLeadMin] = useState<Ministry | null>(null);
  const [selectedTeamLeadIds, setSelectedTeamLeadIds] = useState<string[]>([]);
  const [isSavingTeamLeads, setIsSavingTeamLeads] = useState(false);
  const [teamLeadSearch, setTeamLeadSearch] = useState("");

  // Budget Modal State
  const currentCalendarYear = new Date().getFullYear();
  const [budgetMin, setBudgetMin] = useState<Ministry | null>(null);
  const [budgetYear, setBudgetYear] = useState<number>(currentCalendarYear);
  const [budgetAmount, setBudgetAmount] = useState<string>("");
  const [budgetNotes, setBudgetNotes] = useState<string>("");
  const [isSavingBudget, setIsSavingBudget] = useState(false);

  const [formData, setFormData] = useState({
    code: "",
    name: "",
    description: "",
    is_active: true,
  });
  const [error, setError] = useState("");

  const refresh = () => {
    setMinistries(masterDataClient.getMinistries());
    setProfiles(iamClient.getProfiles());
    setClaims(claimsClient.getClaims());
  };

  React.useEffect(() => {
    const unsub = workspaceStore.subscribeDomains(["master-data", "iam", "claims"], () => {
      setMinistries(masterDataClient.getMinistries());
      setProfiles(iamClient.getProfiles());
      setClaims(claimsClient.getClaims());
    });
    return unsub;
  }, []);

  const profilesById = useMemo(() => {
    return new Map(profiles.map((p) => [p.id, p]));
  }, [profiles]);

  // Calculate annual spending for a ministry in a calendar year
  const getMinistrySpending = (ministryId: string, year: number) => {
    const ministryClaims = claims.filter((c) => {
      if (c.ministry_id !== ministryId) return false;
      if (c.status === "REJECTED" || c.status === "CANCELLED" || c.status === "DRAFT") return false;
      if (!c.claim_date) return false;
      const claimYear = new Date(c.claim_date).getFullYear();
      return claimYear === year;
    });

    const total = ministryClaims.reduce((sum, c) => sum + (Number(c.total_amount) || 0), 0);
    return {
      claimCount: ministryClaims.length,
      totalAmount: total,
    };
  };

  const handleOpenCreate = () => {
    setFormData({
      code: "",
      name: "",
      description: "",
      is_active: true,
    });
    setError("");
    setIsCreating(true);
  };

  const handleOpenEdit = (m: Ministry) => {
    setEditingMin(m);
    setFormData({
      code: m.code,
      name: m.name,
      description: m.description || "",
      is_active: m.is_active,
    });
    setError("");
  };

  const handleOpenTeamLeads = (m: Ministry) => {
    setTeamLeadMin(m);
    setSelectedTeamLeadIds(m.team_lead_ids || []);
    setTeamLeadSearch("");
  };

  const handleOpenBudget = (m: Ministry, year = currentCalendarYear) => {
    setBudgetMin(m);
    setBudgetYear(year);
    const existing = (m.budgets || []).find((b) => b.year === year);
    setBudgetAmount(existing ? String(existing.amount) : "");
    setBudgetNotes(existing?.notes || "");
  };

  const handleSave = async () => {
    try {
      if (!formData.name.trim() || !formData.code.trim()) {
        setError("Ministry name and code are required.");
        return;
      }
      setIsSaving(true);

      if (isCreating) {
        await masterDataClient.createMinistry({
          code: formData.code.trim().toUpperCase(),
          name: formData.name.trim(),
          description: formData.description.trim(),
          is_active: formData.is_active,
        });
        setIsCreating(false);
        showToast.success("Ministry created successfully.", "Ministry Created");
      } else if (editingMin) {
        await masterDataClient.updateMinistry(editingMin.id, {
          code: formData.code.trim().toUpperCase(),
          name: formData.name.trim(),
          description: formData.description.trim(),
          is_active: formData.is_active,
        });
        setEditingMin(null);
        showToast.success("Changes have been made.", "Ministry Updated");
      }

      refresh();
    } catch (err) {
      showToast.error(err instanceof Error ? err.message : "Unable to save changes.", "Save Error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveTeamLeads = async () => {
    if (!teamLeadMin) return;
    try {
      setIsSavingTeamLeads(true);
      await masterDataClient.setMinistryTeamLeads(teamLeadMin.id, selectedTeamLeadIds);
      showToast.success("Ministry team leads assigned successfully.", "Team Leads Updated");
      setTeamLeadMin(null);
      refresh();
    } catch (err) {
      showToast.error(err instanceof Error ? err.message : "Failed to update team leads.", "Error");
    } finally {
      setIsSavingTeamLeads(false);
    }
  };

  const handleSaveBudget = async () => {
    if (!budgetMin) return;
    const amount = parseFloat(budgetAmount);
    if (isNaN(amount) || amount < 0) {
      showToast.error("Please enter a valid budget amount (0 or greater).", "Invalid Amount");
      return;
    }
    try {
      setIsSavingBudget(true);
      await masterDataClient.setMinistryBudget(budgetMin.id, budgetYear, amount, budgetNotes.trim());
      showToast.success(`Annual budget for ${budgetYear} updated.`, "Budget Saved");
      setBudgetMin(null);
      refresh();
    } catch (err) {
      showToast.error(err instanceof Error ? err.message : "Failed to save budget.", "Error");
    } finally {
      setIsSavingBudget(false);
    }
  };

  const handleToggleStatus = async (m: Ministry) => {
    try {
      await masterDataClient.updateMinistry(m.id, { is_active: !m.is_active });
      refresh();
      showToast.info(`Ministry status changed to ${!m.is_active ? "Active" : "Inactive"}.`, "Status Updated");
    } catch (err) {
      showToast.error(err instanceof Error ? err.message : "Unable to update status.", "Error");
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingMin) return;
    try {
      setIsDeleting(true);
      await masterDataClient.deleteMinistry(deletingMin.id);
      showToast.success(`Ministry "${deletingMin.name}" deleted successfully.`, "Ministry Deleted");
      setDeletingMin(null);
      refresh();
    } catch (err) {
      showToast.error(err instanceof Error ? err.message : "Unable to delete ministry.", "Delete Error");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Ministries &amp; Budgets</h1>
            <p className="text-sm text-muted-foreground">Configure church ministries, assign team leads, and manage annual budgets.</p>
          </div>
          <Button onClick={handleOpenCreate} className="bg-zinc-900 hover:bg-zinc-800 text-white gap-1.5 h-9 text-xs">
            <Plus className="w-3.5 h-3.5" />
            <span>New Ministry</span>
          </Button>
        </header>

        <div className="space-y-4">
        <Card className="rounded-xl border border-zinc-200/80 bg-white dark:border-zinc-800 dark:bg-zinc-950 shadow-2xs overflow-hidden">
          <CardContent className="p-0">
            {/* Mobile Ministries Card List */}
            <div className="sm:hidden divide-y divide-border">
              {(ministries || []).map((m) => {
                const leadNames = (m.team_lead_ids || [])
                  .map((id) => profilesById.get(id)?.full_name)
                  .filter(Boolean);
                const currentBudget = (m.budgets || []).find((b) => b.year === currentCalendarYear);
                const spending = getMinistrySpending(m.id, currentCalendarYear);
                const pct = currentBudget && currentBudget.amount > 0
                  ? Math.min(100, Math.round((spending.totalAmount / currentBudget.amount) * 100))
                  : null;

                return (
                  <div key={m.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="break-words font-semibold text-foreground text-sm">{m.name}</span>
                          <span className="font-mono text-[11px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded">
                            {m.code}
                          </span>
                        </div>
                      </div>

                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        m.is_active ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"
                      }`}>
                        {m.is_active ? "Active" : "Inactive"}
                      </span>
                    </div>

                    {/* Team Leads Info */}
                    <div className="text-xs space-y-1">
                      <div className="flex items-center gap-1 text-zinc-500 text-[11px]">
                        <Users className="w-3 h-3" />
                        <span>Team Leads ({leadNames.length}):</span>
                      </div>
                      <p className="font-medium text-zinc-800 dark:text-zinc-200">
                        {leadNames.length > 0 ? leadNames.join(", ") : "None assigned"}
                      </p>
                    </div>

                    {/* Budget Info */}
                    <div className="p-2 rounded bg-zinc-50 dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 text-xs space-y-1">
                      <div className="flex items-center justify-between text-[11px] text-zinc-500">
                        <span>{currentCalendarYear} Budget:</span>
                        <span className="font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                          {currentBudget ? formatCurrency(currentBudget.amount) : "Not set"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-zinc-500">
                        <span>YTD Claims Spent:</span>
                        <span className="font-mono font-medium text-zinc-700 dark:text-zinc-300">
                          {formatCurrency(spending.totalAmount)}
                        </span>
                      </div>
                      {pct !== null && (
                        <div className="w-full bg-zinc-200 rounded-full h-1.5 mt-1 overflow-hidden">
                          <div
                            className={`h-1.5 rounded-full ${
                              pct > 90 ? "bg-red-500" : pct > 75 ? "bg-amber-500" : "bg-emerald-500"
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-1.5 pt-2 border-t border-slate-100">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenBudget(m)}
                        className="text-xs h-8 px-2.5 gap-1"
                      >
                        <DollarSign className="w-3 h-3" />
                        Budget
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenTeamLeads(m)}
                        className="text-xs h-8 px-2.5 gap-1"
                      >
                        <Users className="w-3 h-3" />
                        Leads
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenEdit(m)}
                        className="text-xs h-8 px-2.5"
                      >
                        <Edit className="w-3 h-3 mr-1" />
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleToggleStatus(m)}
                        className={`text-xs h-8 px-2.5 ${
                          m.is_active ? "text-amber-600 hover:bg-amber-50" : "text-emerald-600 hover:bg-emerald-50"
                        }`}
                      >
                        {m.is_active ? "Deactivate" : "Activate"}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop Table View */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-muted/50 border-b border-border">
                    <th className="py-3 px-4">Code</th>
                    <th className="py-3 px-4">Ministry</th>
                    <th className="py-3 px-4">Team Leads</th>
                    <th className="py-3 px-4">{currentCalendarYear} Annual Budget & Spend</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {(ministries || []).map((m) => {
                    const leadNames = (m.team_lead_ids || [])
                      .map((id) => profilesById.get(id)?.full_name)
                      .filter(Boolean);
                    const currentBudget = (m.budgets || []).find((b) => b.year === currentCalendarYear);
                    const spending = getMinistrySpending(m.id, currentCalendarYear);
                    const pct = currentBudget && currentBudget.amount > 0
                      ? Math.min(100, Math.round((spending.totalAmount / currentBudget.amount) * 100))
                      : null;

                    return (
                      <tr key={m.id} className="hover:bg-muted/40">
                        <td className="py-3.5 px-4 font-mono font-bold text-foreground">{m.code}</td>
                        <td className="py-3.5 px-4 font-semibold text-foreground">
                          <div>{m.name}</div>
                          {m.description && <div className="text-[11px] text-muted-foreground line-clamp-1">{m.description}</div>}
                        </td>
                        <td className="py-3.5 px-4 text-muted-foreground max-w-xs">
                          {leadNames.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {leadNames.map((name, idx) => (
                                <span
                                  key={idx}
                                  className="inline-flex items-center px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-800 text-[10px] font-medium"
                                >
                                  {name}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-zinc-400 italic">None assigned</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 min-w-[200px]">
                          {currentBudget ? (
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                                  {formatCurrency(currentBudget.amount)}
                                </span>
                                <span className="text-zinc-500">
                                  Spent: {formatCurrency(spending.totalAmount)} ({pct}%)
                                </span>
                              </div>
                              {pct !== null && (
                                <div className="w-full bg-zinc-200 dark:bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                                  <div
                                    className={`h-1.5 rounded-full ${
                                      pct > 90 ? "bg-red-500" : pct > 75 ? "bg-amber-500" : "bg-emerald-500"
                                    }`}
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="text-zinc-400 text-[11px]">
                              <span>Not configured &middot; Spent: {formatCurrency(spending.totalAmount)}</span>
                            </div>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            m.is_active ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"
                          }`}>
                            {m.is_active ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right w-px">
                          <div className="table-actions">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenBudget(m)}
                              className="text-xs h-7 px-2 gap-1 text-emerald-700 hover:bg-emerald-50"
                              title="Set Annual Budget"
                            >
                              <DollarSign className="w-3 h-3" />
                              Budget
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenTeamLeads(m)}
                              className="text-xs h-7 px-2 gap-1 text-indigo-700 hover:bg-indigo-50"
                              title="Assign Team Leads"
                            >
                              <Users className="w-3 h-3" />
                              Team Leads
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenEdit(m)}
                              className="text-xs h-7 px-2"
                            >
                              <Edit className="w-3 h-3 mr-1" />
                              Edit
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleToggleStatus(m)}
                              className={`text-xs h-7 px-2 ${
                                m.is_active ? "text-amber-600 hover:bg-amber-50" : "text-emerald-600 hover:bg-emerald-50"
                              }`}
                            >
                              {m.is_active ? "Deactivate" : "Activate"}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDeletingMin(m)}
                              className="text-xs h-7 px-2 text-red-600 hover:bg-red-50"
                              aria-label={`Delete ${m.name}`}
                              title="Delete Ministry"
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
      </div>

      {/* Assign Team Leads Modal */}
      {teamLeadMin && (
        <Dialog open={true} onOpenChange={() => !isSavingTeamLeads && setTeamLeadMin(null)}>
          <DialogHeader>
            <DialogTitle>Assign Team Leads: {teamLeadMin.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 my-2 text-xs">
            <p className="text-zinc-500">
              Select 0 or more users to serve as Team Leads for <strong className="text-zinc-900">{teamLeadMin.name}</strong>.
              Team Leads can submit claims on behalf of others and monitor the ministry&rsquo;s annual budget.
            </p>

            <Input
              type="text"
              placeholder="Search user by name or email..."
              value={teamLeadSearch}
              onChange={(e) => setTeamLeadSearch(e.target.value)}
              className="h-8 text-xs"
            />

            <div className="max-h-60 overflow-y-auto border border-zinc-200 dark:border-zinc-800 rounded-lg divide-y divide-zinc-100 dark:divide-zinc-800">
              {profiles
                .filter(
                  (p) =>
                    p.status === "ACTIVE" &&
                    !p.is_payee_only &&
                    (p.full_name?.toLowerCase().includes(teamLeadSearch.toLowerCase()) ||
                      p.email?.toLowerCase().includes(teamLeadSearch.toLowerCase()))
                )
                .map((p) => {
                  const isChecked = selectedTeamLeadIds.includes(p.id);
                  return (
                    <label
                      key={p.id}
                      className={`flex items-center justify-between p-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-900 cursor-pointer transition-colors ${
                        isChecked ? "bg-indigo-50/50 dark:bg-indigo-950/20" : ""
                      }`}
                    >
                      <div className="min-w-0 pr-2">
                        <div className="font-semibold text-zinc-900 dark:text-zinc-100">{p.full_name}</div>
                        <div className="text-[11px] text-zinc-500 truncate">{p.email}</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedTeamLeadIds([...selectedTeamLeadIds, p.id]);
                          } else {
                            setSelectedTeamLeadIds(selectedTeamLeadIds.filter((id) => id !== p.id));
                          }
                        }}
                        className="rounded border-zinc-300 text-indigo-600 focus:ring-indigo-600 size-4"
                      />
                    </label>
                  );
                })}
            </div>
            <div className="text-[11px] text-zinc-500">
              Selected: <strong className="text-zinc-900">{selectedTeamLeadIds.length}</strong> team lead(s)
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTeamLeadMin(null)} disabled={isSavingTeamLeads}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveTeamLeads}
              loading={isSavingTeamLeads}
              disabled={isSavingTeamLeads}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              Save Team Leads
            </Button>
          </DialogFooter>
        </Dialog>
      )}

      {/* Set Annual Budget Modal */}
      {budgetMin && (
        <Dialog open={true} onOpenChange={() => !isSavingBudget && setBudgetMin(null)}>
          <DialogHeader>
            <DialogTitle>Set Ministry Budget: {budgetMin.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 my-2 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Calendar Year *</label>
                <select
                  value={budgetYear}
                  onChange={(e) => {
                    const yr = parseInt(e.target.value, 10);
                    handleOpenBudget(budgetMin, yr);
                  }}
                  className="w-full h-8 px-2 text-xs border border-zinc-200 dark:border-zinc-800 rounded-md bg-white dark:bg-zinc-900 font-mono"
                >
                  {[currentCalendarYear - 1, currentCalendarYear, currentCalendarYear + 1, currentCalendarYear + 2].map((yr) => (
                    <option key={yr} value={yr}>
                      {yr}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Annual Budget (RM) *</label>
                <Input
                  type="number"
                  step="100"
                  min="0"
                  placeholder="e.g. 50000.00"
                  value={budgetAmount}
                  onChange={(e) => setBudgetAmount(e.target.value)}
                  className="font-mono font-semibold"
                  required
                />
              </div>
            </div>

            {/* Real-time Spending Calculation Preview */}
            {(() => {
              const sp = getMinistrySpending(budgetMin.id, budgetYear);
              const bAmount = parseFloat(budgetAmount) || 0;
              const remaining = bAmount - sp.totalAmount;
              const pct = bAmount > 0 ? Math.round((sp.totalAmount / bAmount) * 100) : 0;
              return (
                <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-2">
                  <div className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
                    {budgetYear} Spending vs. Budget Analysis:
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="p-1.5 rounded bg-white dark:bg-zinc-950 border border-zinc-100">
                      <div className="text-[10px] text-zinc-400">Claims Incurred</div>
                      <div className="font-mono font-bold text-zinc-900 dark:text-zinc-100">
                        {sp.claimCount} claims
                      </div>
                    </div>
                    <div className="p-1.5 rounded bg-white dark:bg-zinc-950 border border-zinc-100">
                      <div className="text-[10px] text-zinc-400">Total Spent</div>
                      <div className="font-mono font-bold text-zinc-900 dark:text-zinc-100">
                        {formatCurrency(sp.totalAmount)}
                      </div>
                    </div>
                    <div className="p-1.5 rounded bg-white dark:bg-zinc-950 border border-zinc-100">
                      <div className="text-[10px] text-zinc-400">Remaining</div>
                      <div className={`font-mono font-bold ${remaining < 0 ? "text-red-600" : "text-emerald-600"}`}>
                        {formatCurrency(remaining)}
                      </div>
                    </div>
                  </div>
                  {bAmount > 0 && (
                    <div className="w-full bg-zinc-200 dark:bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                      <div
                        className={`h-1.5 rounded-full ${
                          pct > 90 ? "bg-red-500" : pct > 75 ? "bg-amber-500" : "bg-emerald-500"
                        }`}
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                    </div>
                  )}
                </div>
              );
            })()}

            <div className="space-y-1">
              <label className="font-semibold text-slate-700">Notes & Guidelines</label>
              <Textarea
                rows={2}
                value={budgetNotes}
                onChange={(e) => setBudgetNotes(e.target.value)}
                placeholder="Optional budgeting guidance or approval allocations..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBudgetMin(null)} disabled={isSavingBudget}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveBudget}
              loading={isSavingBudget}
              disabled={isSavingBudget}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              Save Annual Budget
            </Button>
          </DialogFooter>
        </Dialog>
      )}

      {/* Create / Edit Modal */}
      {(isCreating || editingMin) && (
        <Dialog open={true} onOpenChange={() => { setIsCreating(false); setEditingMin(null); }}>
          <DialogHeader>
            <DialogTitle>{isCreating ? "Create New Ministry" : `Edit Ministry: ${editingMin?.name}`}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 my-2 text-xs">
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Code (e.g. YOUTH) *</label>
                <Input
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                  className="font-mono font-bold"
                  placeholder="CODE"
                  required
                />
              </div>
              <div className="col-span-2 space-y-1">
                <label className="font-semibold text-slate-700">Ministry Name *</label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Youth Ministry"
                  required
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-slate-700">Description & Purpose</label>
              <Textarea
                rows={2}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Ministry scope and focus area..."
              />
            </div>

            <label className="flex items-center gap-2 pt-1 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.is_active}
                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                className="rounded text-zinc-900 focus:ring-zinc-900 accent-zinc-900"
              />
              <span className="font-semibold text-foreground">Ministry Active & Available in Claim Forms</span>
            </label>

            {error && <p className="text-xs text-red-600 font-medium">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsCreating(false); setEditingMin(null); }} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={handleSave} loading={isSaving} disabled={isSaving} className="bg-zinc-900 hover:bg-zinc-800 text-white">
              {isSaving ? "Saving..." : isCreating ? "Create Ministry" : "Save Changes"}
            </Button>
          </DialogFooter>
        </Dialog>
      )}

      {/* Delete Confirmation Dialog */}
      {deletingMin && (
        <Dialog open={true} onOpenChange={() => !isDeleting && setDeletingMin(null)}>
          <DialogHeader>
            <DialogTitle>Delete Ministry</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 my-2 text-xs">
            <p className="text-muted-foreground">
              Are you sure you want to delete the ministry <strong className="text-foreground">{deletingMin.name} ({deletingMin.code})</strong>?
            </p>
            <p className="text-slate-500">
              This will remove the ministry from the system and prevent future claims under this ministry.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingMin(null)} disabled={isDeleting}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirmDelete}
              loading={isDeleting}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {isDeleting ? "Deleting..." : "Delete Ministry"}
            </Button>
          </DialogFooter>
        </Dialog>
      )}
    </AppLayout>
  );
}
