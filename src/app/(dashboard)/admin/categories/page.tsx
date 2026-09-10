"use client";

import React, { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { db } from "@/lib/data/repository";
import { ExpenseCategory } from "@/lib/types/database";
import { Tag, Plus, Edit } from "lucide-react";

export default function CategoryManagementPage() {
  const [categories, setCategories] = useState<ExpenseCategory[]>(db.getCategories());
  const [editingCat, setEditingCat] = useState<ExpenseCategory | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState({
    code: "",
    name: "",
    description: "",
    display_order: 1,
    is_active: true,
  });
  const [error, setError] = useState("");

  const refresh = () => setCategories(db.getCategories());

  const handleOpenCreate = () => {
    setFormData({
      code: "",
      name: "",
      description: "",
      display_order: categories.length + 1,
      is_active: true,
    });
    setError("");
    setIsCreating(true);
  };

  const handleOpenEdit = (c: ExpenseCategory) => {
    setEditingCat(c);
    setFormData({
      code: c.code,
      name: c.name,
      description: c.description || "",
      display_order: c.display_order,
      is_active: c.is_active,
    });
    setError("");
  };

  const handleSave = async () => {
    try {
    if (!formData.name.trim() || !formData.code.trim()) {
      setError("Category name and code are required.");
      return;
    }

    if (isCreating) {
      await db.createCategory({
        code: formData.code.trim().toUpperCase(),
        name: formData.name.trim(),
        description: formData.description.trim(),
        display_order: Number(formData.display_order),
        is_active: formData.is_active,
      });
      setIsCreating(false);
    } else if (editingCat) {
      await db.updateCategory(editingCat.id, {
        code: formData.code.trim().toUpperCase(),
        name: formData.name.trim(),
        description: formData.description.trim(),
        display_order: Number(formData.display_order),
        is_active: formData.is_active,
      });
      setEditingCat(null);
    }

    refresh();

    } catch (error) { window.dispatchEvent(new CustomEvent("workspace-error", { detail: error instanceof Error ? error.message : "Unable to save changes." })); }
  };

  const handleToggleStatus = async (c: ExpenseCategory) => {
    try {
    await db.updateCategory(c.id, { is_active: !c.is_active });
    refresh();

    } catch (error) { window.dispatchEvent(new CustomEvent("workspace-error", { detail: error instanceof Error ? error.message : "Unable to save changes." })); }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <Tag className="w-6 h-6 text-emerald-700" />
              Expense Categories & Descriptions
            </h1>
            <p className="text-xs text-slate-500">
              Manage tax and accounting expense categories. Modifying categories preserves historical claim records.
            </p>
          </div>

          <Button
            onClick={handleOpenCreate}
            className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs gap-1.5 shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>+ Add Category</span>
          </Button>
        </div>

        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50/75 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
                    <th className="py-3 px-4 w-16 text-center">Order</th>
                    <th className="py-3 px-4">Code</th>
                    <th className="py-3 px-4">Category Name</th>
                    <th className="py-3 px-4">Guidance & Examples</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {categories.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50/70">
                      <td className="py-3.5 px-4 font-bold text-slate-400 text-center">{c.display_order}</td>
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-900">{c.code}</td>
                      <td className="py-3.5 px-4 font-semibold text-slate-800">{c.name}</td>
                      <td className="py-3.5 px-4 text-slate-500 max-w-md truncate">{c.description || "-"}</td>
                      <td className="py-3.5 px-4 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          c.is_active ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"
                        }`}>
                          {c.is_active ? "ACTIVE" : "INACTIVE"}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenEdit(c)}
                          className="text-xs h-7 px-2.5"
                        >
                          <Edit className="w-3 h-3 mr-1" />
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleToggleStatus(c)}
                          className={`text-xs h-7 px-2.5 ${c.is_active ? "text-red-600 hover:bg-red-50" : "text-emerald-600 hover:bg-emerald-50"}`}
                        >
                          {c.is_active ? "Deactivate" : "Activate"}
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
      {(isCreating || editingCat) && (
        <Dialog open={true} onOpenChange={() => { setIsCreating(false); setEditingCat(null); }}>
          <DialogHeader>
            <DialogTitle>{isCreating ? "Add Expense Category" : `Edit Category: ${editingCat?.name}`}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 my-2 text-xs">
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Code (e.g. MEALS) *</label>
                <Input
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                  className="font-mono font-bold"
                  placeholder="CODE"
                  required
                />
              </div>
              <div className="col-span-2 space-y-1">
                <label className="font-semibold text-slate-700">Category Name *</label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Hospitality & Meals"
                  required
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-slate-700">Display Order</label>
              <Input
                type="number"
                value={formData.display_order}
                onChange={(e) => setFormData({ ...formData, display_order: Number(e.target.value) })}
              />
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-slate-700">Description & Claimant Guidance</label>
              <Textarea
                rows={2}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Give examples of what should be claimed under this category..."
              />
            </div>

            <label className="flex items-center gap-2 pt-1 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.is_active}
                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                className="rounded text-emerald-600 focus:ring-emerald-500 accent-emerald-600"
              />
              <span className="font-semibold text-slate-800">Category Active in Claim Form</span>
            </label>

            {error && <p className="text-xs text-red-600 font-medium">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsCreating(false); setEditingCat(null); }}>
              Cancel
            </Button>
            <Button onClick={handleSave} className="bg-emerald-700 hover:bg-emerald-800 text-white">
              {isCreating ? "Create Category" : "Save Changes"}
            </Button>
          </DialogFooter>
        </Dialog>
      )}
    </AppLayout>
  );
}
