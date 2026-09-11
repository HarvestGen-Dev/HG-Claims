"use client";

import React, { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { db } from "@/lib/data/repository";
import { Ministry, Profile } from "@/lib/types/database";
import { Building2, Plus, Edit, CheckCircle2, UserCheck } from "lucide-react";
import { showToast } from "@/lib/utils/toast";



export default function MinistryManagementPage() {
  const [ministries, setMinistries] = useState<Ministry[]>(db.getMinistries());
  const profiles = db.getProfiles();

  const [editingMin, setEditingMin] = useState<Ministry | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState({
    code: "",
    name: "",
    description: "",
    leader_id: "",
    is_active: true,
  });
  const [error, setError] = useState("");

  const refresh = () => {
    setMinistries(db.getMinistries());
  };

  const handleOpenCreate = () => {
    setFormData({
      code: "",
      name: "",
      description: "",
      leader_id: profiles[0]?.id || "",
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
      leader_id: m.leader_id || "",
      is_active: m.is_active,
    });
    setError("");
  };

  const handleSave = async () => {
    try {
      if (!formData.name.trim() || !formData.code.trim()) {
        setError("Ministry name and code are required.");
        return;
      }

      if (isCreating) {
        await db.createMinistry({
          code: formData.code.trim().toUpperCase(),
          name: formData.name.trim(),
          description: formData.description.trim(),
          leader_id: formData.leader_id || null,
          is_active: formData.is_active,
        });
        setIsCreating(false);
        showToast.success("Ministry created successfully.", "Ministry Created");
      } else if (editingMin) {
        await db.updateMinistry(editingMin.id, {
          code: formData.code.trim().toUpperCase(),
          name: formData.name.trim(),
          description: formData.description.trim(),
          leader_id: formData.leader_id || null,
          is_active: formData.is_active,
        });
        setEditingMin(null);
        showToast.success("Changes have been made.", "Ministry Updated");
      }

      refresh();
    } catch (error) {
      showToast.error(error instanceof Error ? error.message : "Unable to save changes.", "Save Error");
    }
  };

  const handleToggleStatus = async (m: Ministry) => {
    try {
      await db.updateMinistry(m.id, { is_active: !m.is_active });
      refresh();
      showToast.info(`Ministry status changed to ${!m.is_active ? "Active" : "Inactive"}.`, "Status Updated");
    } catch (error) {
      showToast.error(error instanceof Error ? error.message : "Unable to update status.", "Error");
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <Building2 className="w-6 h-6 text-emerald-700" />
              Ministries & Department Leaders
            </h1>
            <p className="text-xs text-slate-500">
              Create, edit and configure church ministries and assign approving ministry leaders.
            </p>
          </div>

          <Button
            onClick={handleOpenCreate}
            className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs gap-1.5 shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>+ Add New Ministry</span>
          </Button>
        </div>

        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50/75 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
                    <th className="py-3 px-4">Code</th>
                    <th className="py-3 px-4">Ministry Name</th>
                    <th className="py-3 px-4">Designated Approving Leader</th>
                    <th className="py-3 px-4">Description</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(ministries || []).map((m) => (
                    <tr key={m.id} className="hover:bg-slate-50/70">
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-900">{m.code}</td>
                      <td className="py-3.5 px-4 font-semibold text-slate-800">{m.name}</td>
                      <td className="py-3.5 px-4">
                        {m.leader ? (
                          <div className="flex items-center gap-1.5 text-emerald-800 font-medium">
                            <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                            <span>{m.leader.full_name}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">Unassigned</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-slate-500 max-w-sm truncate">{m.description || "-"}</td>
                      <td className="py-3.5 px-4 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          m.is_active ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"
                        }`}>
                          {m.is_active ? "ACTIVE" : "INACTIVE"}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenEdit(m)}
                          className="text-xs h-7 px-2.5"
                        >
                          <Edit className="w-3 h-3 mr-1" />
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleToggleStatus(m)}
                          className={`text-xs h-7 px-2.5 ${m.is_active ? "text-red-600 hover:bg-red-50" : "text-emerald-600 hover:bg-emerald-50"}`}
                        >
                          {m.is_active ? "Deactivate" : "Activate"}
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
              <label className="font-semibold text-slate-700">Designated Approver (Ministry Leader)</label>
              <select
                value={formData.leader_id}
                onChange={(e) => setFormData({ ...formData, leader_id: e.target.value })}
                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs"
              >
                <option value="">-- No Leader Assigned --</option>
                {(profiles || []).map((p) => (
                  <option key={p.id} value={p.id}>{p.full_name} ({p.email})</option>
                ))}
              </select>
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
                className="rounded text-emerald-600 focus:ring-emerald-500 accent-emerald-600"
              />
              <span className="font-semibold text-slate-800">Ministry Active & Available in Claim Forms</span>
            </label>

            {error && <p className="text-xs text-red-600 font-medium">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsCreating(false); setEditingMin(null); }}>
              Cancel
            </Button>
            <Button onClick={handleSave} className="bg-emerald-700 hover:bg-emerald-800 text-white">
              {isCreating ? "Create Ministry" : "Save Changes"}
            </Button>
          </DialogFooter>
        </Dialog>
      )}
    </AppLayout>
  );
}
