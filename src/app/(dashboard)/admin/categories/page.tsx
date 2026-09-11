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
import { Tag, Plus, Edit, GripVertical, ArrowUp, ArrowDown, CheckCircle2, Loader2 } from "lucide-react";
import { showToast } from "@/lib/utils/toast";

export default function CategoryManagementPage() {
  const [categories, setCategories] = useState<ExpenseCategory[]>(db.getCategories());
  const [editingCat, setEditingCat] = useState<ExpenseCategory | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isReordering, setIsReordering] = useState(false);

  // Drag-and-drop state
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

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
      setIsSaving(true);

      if (isCreating) {
        await db.createCategory({
          code: formData.code.trim().toUpperCase(),
          name: formData.name.trim(),
          description: formData.description.trim(),
          display_order: Number(formData.display_order),
          is_active: formData.is_active,
        });
        setIsCreating(false);
        showToast.success("Expense category created successfully.", "Category Created");
      } else if (editingCat) {
        await db.updateCategory(editingCat.id, {
          code: formData.code.trim().toUpperCase(),
          name: formData.name.trim(),
          description: formData.description.trim(),
          display_order: Number(formData.display_order),
          is_active: formData.is_active,
        });
        setEditingCat(null);
        showToast.success("Changes have been made.", "Category Updated");
      }

      refresh();
    } catch (error) {
      showToast.error(error instanceof Error ? error.message : "Unable to save changes.", "Save Error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleStatus = async (c: ExpenseCategory) => {
    try {
      await db.updateCategory(c.id, { is_active: !c.is_active });
      refresh();
      showToast.info(`Category status changed to ${!c.is_active ? "Active" : "Inactive"}.`, "Status Updated");
    } catch (error) {
      showToast.error(error instanceof Error ? error.message : "Unable to update status.", "Error");
    }
  };

  // Reorder persistence helper
  const persistNewOrder = async (reorderedList: ExpenseCategory[]) => {
    const updatedList = reorderedList.map((cat, idx) => ({
      ...cat,
      display_order: idx + 1,
    }));
    setCategories(updatedList);
    setIsReordering(true);

    try {
      for (let i = 0; i < updatedList.length; i++) {
        await db.updateCategory(updatedList[i].id, {
          display_order: updatedList[i].display_order,
        });
      }
      refresh();
      showToast.success("Category order updated and saved.", "Arrangement Saved");
    } catch (err: any) {
      showToast.error(err instanceof Error ? err.message : "Failed to save category order.", "Reorder Error");
      refresh();
    } finally {
      setIsReordering(false);
    }
  };

  // Drag and drop event handlers
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", index.toString());
  };

  const handleDragEnter = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex !== null && draggedIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === targetIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    const items = [...categories];
    const [movedItem] = items.splice(draggedIndex, 1);
    items.splice(targetIndex, 0, movedItem);

    setDraggedIndex(null);
    setDragOverIndex(null);
    void persistNewOrder(items);
  };

  // Up / Down arrow pull handlers
  const handleMoveUp = (index: number) => {
    if (index === 0 || isReordering) return;
    const items = [...categories];
    const temp = items[index];
    items[index] = items[index - 1];
    items[index - 1] = temp;
    void persistNewOrder(items);
  };

  const handleMoveDown = (index: number) => {
    if (index === categories.length - 1 || isReordering) return;
    const items = [...categories];
    const temp = items[index];
    items[index] = items[index + 1];
    items[index + 1] = temp;
    void persistNewOrder(items);
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
            <p className="text-xs text-slate-500 mt-1">
              Drag and pull categories to arrange the display order in claimant dropdowns and submission forms.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {isReordering && (
              <div className="flex items-center gap-1.5 text-xs text-emerald-700 font-medium animate-pulse">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Saving order...</span>
              </div>
            )}
            <Button
              onClick={handleOpenCreate}
              className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs gap-1.5 shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>+ Add Category</span>
            </Button>
          </div>
        </div>

        {/* Guidance tip */}
        <div className="p-3 bg-emerald-50/80 border border-emerald-200/80 rounded-xl text-xs text-emerald-900 flex items-center justify-between shadow-2xs">
          <div className="flex items-center gap-2">
            <GripVertical className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              <strong>Tip:</strong> Click &amp; drag the handle <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-emerald-200 text-emerald-800">⠿</span> on any row to reorder categories, or use the up/down arrows. Changes apply across all expense forms automatically.
            </span>
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50/75 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider select-none">
                    <th className="py-3 px-3 w-10 text-center">Move</th>
                    <th className="py-3 px-4 w-16 text-center">Order</th>
                    <th className="py-3 px-4">Code</th>
                    <th className="py-3 px-4">Category Name</th>
                    <th className="py-3 px-4">Guidance &amp; Examples</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(categories || []).map((c, index) => {
                    const isDragging = draggedIndex === index;
                    const isDragOver = dragOverIndex === index;

                    return (
                      <tr
                        key={c.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, index)}
                        onDragEnter={(e) => handleDragEnter(e, index)}
                        onDragOver={handleDragOver}
                        onDragEnd={handleDragEnd}
                        onDrop={(e) => handleDrop(e, index)}
                        className={`transition-all ${
                          isDragging
                            ? "opacity-30 bg-emerald-100/60 scale-[0.99] border-dashed border-2 border-emerald-500"
                            : isDragOver
                            ? "border-t-2 border-emerald-600 bg-emerald-50/50"
                            : "hover:bg-slate-50/80"
                        }`}
                      >
                        {/* Drag Handle & Pull Buttons */}
                        <td className="py-3.5 px-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <span
                              className="cursor-grab active:cursor-grabbing p-1 hover:bg-slate-200/70 rounded text-slate-400 hover:text-emerald-700 transition-colors"
                              title="Drag to rearrange"
                            >
                              <GripVertical className="w-4 h-4" />
                            </span>
                            <div className="flex flex-col">
                              <button
                                type="button"
                                onClick={() => handleMoveUp(index)}
                                disabled={index === 0 || isReordering}
                                className="p-0.5 text-slate-400 hover:text-slate-800 disabled:opacity-20 disabled:hover:text-slate-400 transition-colors"
                                title="Move up"
                                aria-label="Move category up"
                              >
                                <ArrowUp className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleMoveDown(index)}
                                disabled={index === categories.length - 1 || isReordering}
                                className="p-0.5 text-slate-400 hover:text-slate-800 disabled:opacity-20 disabled:hover:text-slate-400 transition-colors"
                                title="Move down"
                                aria-label="Move category down"
                              >
                                <ArrowDown className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        </td>

                        {/* Order Number */}
                        <td className="py-3.5 px-4 font-bold text-slate-400 text-center">
                          <span className="inline-block px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-mono text-[11px]">
                            {index + 1}
                          </span>
                        </td>

                        {/* Code */}
                        <td className="py-3.5 px-4 font-mono font-bold text-slate-900">{c.code}</td>

                        {/* Name */}
                        <td className="py-3.5 px-4 font-semibold text-slate-800">{c.name}</td>

                        {/* Description */}
                        <td className="py-3.5 px-4 text-slate-500 max-w-md truncate">{c.description || "-"}</td>

                        {/* Status */}
                        <td className="py-3.5 px-4 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            c.is_active ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"
                          }`}>
                            {c.is_active ? "ACTIVE" : "INACTIVE"}
                          </span>
                        </td>

                        {/* Actions */}
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
                    );
                  })}
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
              <label className="font-semibold text-slate-700">Description &amp; Claimant Guidance</label>
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
            <Button variant="outline" onClick={() => { setIsCreating(false); setEditingCat(null); }} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={handleSave} loading={isSaving} disabled={isSaving} className="bg-emerald-700 hover:bg-emerald-800 text-white">
              {isSaving ? "Saving..." : isCreating ? "Create Category" : "Save Changes"}
            </Button>
          </DialogFooter>
        </Dialog>
      )}
    </AppLayout>
  );
}
