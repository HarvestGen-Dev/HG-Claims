"use client";

import React, { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { db } from "@/lib/data/repository";
import { CostCentre } from "@/lib/types/database";
import { PieChart, Plus, Edit } from "lucide-react";
import { showToast } from "@/lib/utils/toast";



export default function CostCentreManagementPage() {
  const [costCentres, setCostCentres] = useState<CostCentre[]>(db.getCostCentres());
  const ministries = db.getMinistries();

  const [editingCC, setEditingCC] = useState<CostCentre | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState({
    code: "",
    name: "",
    ministry_id: "",
    description: "",
    is_active: true,
  });
  const [error, setError] = useState("");

  const refresh = () => setCostCentres(db.getCostCentres());

  const handleOpenCreate = () => {
    setFormData({
      code: "",
      name: "",
      ministry_id: ministries[0]?.id || "",
      description: "",
      is_active: true,
    });
    setError("");
    setIsCreating(true);
  };

  const handleOpenEdit = (cc: CostCentre) => {
    setEditingCC(cc);
    setFormData({
      code: cc.code,
      name: cc.name,
      ministry_id: cc.ministry_id || "",
      description: cc.description || "",
      is_active: cc.is_active,
    });
    setError("");
  };

  const handleSave = async () => {
    try {
      if (!formData.name.trim() || !formData.code.trim()) {
        setError("Cost centre name and code are required.");
        return;
      }

      if (isCreating) {
        await db.createCostCentre({
          code: formData.code.trim().toUpperCase(),
          name: formData.name.trim(),
          ministry_id: formData.ministry_id || null,
          description: formData.description.trim(),
          is_active: formData.is_active,
        });
        setIsCreating(false);
        showToast.success("Cost centre created successfully.", "Cost Centre Created");
      } else if (editingCC) {
        await db.updateCostCentre(editingCC.id, {
          code: formData.code.trim().toUpperCase(),
          name: formData.name.trim(),
          ministry_id: formData.ministry_id || null,
          description: formData.description.trim(),
          is_active: formData.is_active,
        });
        setEditingCC(null);
        showToast.success("Changes have been made.", "Cost Centre Updated");
      }

      refresh();
    } catch (error) {
      showToast.error(error instanceof Error ? error.message : "Unable to save changes.", "Save Error");
    }
  };

  const handleToggleStatus = async (cc: CostCentre) => {
    try {
      await db.updateCostCentre(cc.id, { is_active: !cc.is_active });
      refresh();
      showToast.info(`Cost centre status changed to ${!cc.is_active ? "Active" : "Inactive"}.`, "Status Updated");
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
              <PieChart className="w-6 h-6 text-emerald-700" />
              Budget Cost Centres
            </h1>
            <p className="text-xs text-slate-500">
              Configure accounting budget line codes and link them to ministries.
            </p>
          </div>

          <Button
            onClick={handleOpenCreate}
            className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs gap-1.5 shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>+ Add Cost Centre</span>
          </Button>
        </div>

        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50/75 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
                    <th className="py-3 px-4">Code</th>
                    <th className="py-3 px-4">Cost Centre Name</th>
                    <th className="py-3 px-4">Linked Ministry</th>
                    <th className="py-3 px-4">Description</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(costCentres || []).map((cc) => (
                    <tr key={cc.id} className="hover:bg-slate-50/70">
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-900">{cc.code}</td>
                      <td className="py-3.5 px-4 font-semibold text-slate-800">{cc.name}</td>
                      <td className="py-3.5 px-4 text-emerald-800 font-medium">{cc.ministry?.name || "General Budget"}</td>
                      <td className="py-3.5 px-4 text-slate-500 max-w-sm truncate">{cc.description || "-"}</td>
                      <td className="py-3.5 px-4 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          cc.is_active ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"
                        }`}>
                          {cc.is_active ? "ACTIVE" : "INACTIVE"}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenEdit(cc)}
                          className="text-xs h-7 px-2.5"
                        >
                          <Edit className="w-3 h-3 mr-1" />
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleToggleStatus(cc)}
                          className={`text-xs h-7 px-2.5 ${cc.is_active ? "text-red-600 hover:bg-red-50" : "text-emerald-600 hover:bg-emerald-50"}`}
                        >
                          {cc.is_active ? "Deactivate" : "Activate"}
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
      {(isCreating || editingCC) && (
        <Dialog open={true} onOpenChange={() => { setIsCreating(false); setEditingCC(null); }}>
          <DialogHeader>
            <DialogTitle>{isCreating ? "Add Budget Cost Centre" : `Edit Cost Centre: ${editingCC?.code}`}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 my-2 text-xs">
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Code</label>
                <Input
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                  className="font-mono font-bold"
                  placeholder="CODE-YYYY"
                  required
                />
              </div>
              <div className="col-span-2 space-y-1">
                <label className="font-semibold text-slate-700">Cost Centre Name *</label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Youth Camp Fund"
                  required
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-slate-700">Associated Ministry</label>
              <select
                value={formData.ministry_id}
                onChange={(e) => setFormData({ ...formData, ministry_id: e.target.value })}
                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs"
              >
                <option value="">General / All Ministries</option>
                {(ministries || []).map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-slate-700">Description</label>
              <Textarea
                rows={2}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Budget description..."
              />
            </div>

            <label className="flex items-center gap-2 pt-1 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.is_active}
                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                className="rounded text-emerald-600 focus:ring-emerald-500 accent-emerald-600"
              />
              <span className="font-semibold text-slate-800">Cost Centre Active in Claim Forms</span>
            </label>

            {error && <p className="text-xs text-red-600 font-medium">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsCreating(false); setEditingCC(null); }}>
              Cancel
            </Button>
            <Button onClick={handleSave} className="bg-emerald-700 hover:bg-emerald-800 text-white">
              {isCreating ? "Create Cost Centre" : "Save Changes"}
            </Button>
          </DialogFooter>
        </Dialog>
      )}
    </AppLayout>
  );
}
