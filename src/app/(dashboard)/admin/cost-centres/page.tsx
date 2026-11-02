"use client";

import React, { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { masterDataClient, workspaceStore } from "@/lib/domains";
import { CostCentre } from "@/lib/types/database";
import { PieChart, Plus, Edit, GripVertical, ArrowUp, ArrowDown, Loader2, Trash2 } from "lucide-react";
import { showToast } from "@/lib/utils/toast";

export default function CostCentreManagementPage() {
  const [costCentres, setCostCentres] = useState<CostCentre[]>(masterDataClient.getCostCentres());
  const [ministries, setMinistries] = useState(masterDataClient.getMinistries());

  const [editingCC, setEditingCC] = useState<CostCentre | null>(null);
  const [deletingCC, setDeletingCC] = useState<CostCentre | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isReordering, setIsReordering] = useState(false);

  // Drag-and-drop state
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const [formData, setFormData] = useState({
    code: "",
    name: "",
    ministry_id: "",
    description: "",
    display_order: 1,
    is_active: true,
  });
  const [error, setError] = useState("");

  const refresh = () => {
    setCostCentres(masterDataClient.getCostCentres());
    setMinistries(masterDataClient.getMinistries());
  };

  React.useEffect(() => {
    const unsub = workspaceStore.subscribe(() => {
      setCostCentres(masterDataClient.getCostCentres());
      setMinistries(masterDataClient.getMinistries());
    });
    return unsub;
  }, []);

  const handleOpenCreate = () => {
    setFormData({
      code: "",
      name: "",
      ministry_id: ministries[0]?.id || "",
      description: "",
      display_order: costCentres.length + 1,
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
      display_order: cc.display_order ?? (costCentres.findIndex(c => c.id === cc.id) + 1),
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
      setIsSaving(true);

      if (isCreating) {
        await masterDataClient.createCostCentre({
          code: formData.code.trim().toUpperCase(),
          name: formData.name.trim(),
          ministry_id: formData.ministry_id || null,
          description: formData.description.trim(),
          display_order: Number(formData.display_order),
          is_active: formData.is_active,
        });
        setIsCreating(false);
        showToast.success("Cost centre created successfully.", "Cost Centre Created");
      } else if (editingCC) {
        await masterDataClient.updateCostCentre(editingCC.id, {
          code: formData.code.trim().toUpperCase(),
          name: formData.name.trim(),
          ministry_id: formData.ministry_id || null,
          description: formData.description.trim(),
          display_order: Number(formData.display_order),
          is_active: formData.is_active,
        });
        setEditingCC(null);
        showToast.success("Changes have been made.", "Cost Centre Updated");
      }

      refresh();
    } catch (error) {
      showToast.error(error instanceof Error ? error.message : "Unable to save changes.", "Save Error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleStatus = async (cc: CostCentre) => {
    try {
      await masterDataClient.updateCostCentre(cc.id, { is_active: !cc.is_active });
      refresh();
      showToast.info(`Cost centre status changed to ${!cc.is_active ? "Active" : "Inactive"}.`, "Status Updated");
    } catch (error) {
      showToast.error(error instanceof Error ? error.message : "Unable to update status.", "Error");
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingCC) return;
    try {
      setIsDeleting(true);
      await masterDataClient.deleteCostCentre(deletingCC.id);
      showToast.success(`Cost centre "${deletingCC.name}" deleted successfully.`, "Cost Centre Deleted");
      setDeletingCC(null);
      refresh();
    } catch (error) {
      showToast.error(error instanceof Error ? error.message : "Unable to delete cost centre.", "Delete Error");
    } finally {
      setIsDeleting(false);
    }
  };

  // Reorder persistence helper
  const persistNewOrder = async (reorderedList: CostCentre[]) => {
    const updatedList = reorderedList.map((cc, idx) => ({
      ...cc,
      display_order: idx + 1,
    }));
    setCostCentres(updatedList);
    setIsReordering(true);

    try {
      for (let i = 0; i < updatedList.length; i++) {
        await masterDataClient.updateCostCentre(updatedList[i].id, {
          display_order: updatedList[i].display_order,
        });
      }
      refresh();
      showToast.success("Cost centre order updated and saved.", "Arrangement Saved");
    } catch (err: any) {
      showToast.error(err instanceof Error ? err.message : "Failed to save cost centre order.", "Reorder Error");
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

    const items = [...costCentres];
    const [movedItem] = items.splice(draggedIndex, 1);
    items.splice(targetIndex, 0, movedItem);

    setDraggedIndex(null);
    setDragOverIndex(null);
    void persistNewOrder(items);
  };

  // Up / Down arrow pull handlers
  const handleMoveUp = (index: number) => {
    if (index === 0 || isReordering) return;
    const items = [...costCentres];
    const temp = items[index];
    items[index] = items[index - 1];
    items[index - 1] = temp;
    void persistNewOrder(items);
  };

  const handleMoveDown = (index: number) => {
    if (index === costCentres.length - 1 || isReordering) return;
    const items = [...costCentres];
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
              <PieChart className="w-6 h-6 text-emerald-700" />
              Budget Cost Centres
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Drag and pull cost centres to arrange the display order in claimant dropdowns and submission forms.
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
              <span>+ Add Cost Centre</span>
            </Button>
          </div>
        </div>

        {/* Guidance tip */}
        <div className="p-3 bg-emerald-50/80 border border-emerald-200/80 rounded-xl text-xs text-emerald-900 flex items-center justify-between shadow-2xs">
          <div className="flex items-center gap-2">
            <GripVertical className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              <strong>Tip:</strong> Click &amp; drag the handle <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-emerald-200 text-emerald-800">⠿</span> on any row to reorder cost centres, or use the up/down arrows. Changes apply across all expense forms automatically.
            </span>
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            {/* Mobile Cost Centres Card List */}
            <div className="sm:hidden divide-y divide-slate-100">
              {(costCentres || []).map((cc, index) => (
                <div key={cc.id} className="p-4 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="inline-block px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-xs font-bold">
                        #{index + 1}
                      </span>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-slate-900 text-sm">{cc.name}</span>
                          <span className="font-mono text-[11px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded">
                            {cc.code}
                          </span>
                        </div>
                        <p className="text-xs text-emerald-800 font-medium mt-0.5">
                          Ministry: {cc.ministry?.name || "General Budget"}
                        </p>
                      </div>
                    </div>

                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      cc.is_active ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"
                    }`}>
                      {cc.is_active ? "ACTIVE" : "INACTIVE"}
                    </span>
                  </div>

                  {cc.description && (
                    <p className="text-xs text-slate-600 pl-8">{cc.description}</p>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                    {/* Arrange Up/Down Buttons */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-slate-400">Arrange:</span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleMoveUp(index)}
                        disabled={index === 0 || isReordering}
                        className="h-8 px-2.5 text-xs text-slate-700"
                        title="Move Up"
                      >
                        <ArrowUp className="w-3.5 h-3.5 mr-1" />
                        Up
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleMoveDown(index)}
                        disabled={index === costCentres.length - 1 || isReordering}
                        className="h-8 px-2.5 text-xs text-slate-700"
                        title="Move Down"
                      >
                        <ArrowDown className="w-3.5 h-3.5 mr-1" />
                        Down
                      </Button>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenEdit(cc)}
                        className="text-xs h-8 px-2.5"
                      >
                        <Edit className="w-3 h-3 mr-1" />
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleToggleStatus(cc)}
                        className={`text-xs h-8 px-2.5 ${cc.is_active ? "text-amber-600 hover:bg-amber-50" : "text-emerald-600 hover:bg-emerald-50"}`}
                      >
                        {cc.is_active ? "Deactivate" : "Activate"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeletingCC(cc)}
                        className="text-xs h-8 px-2.5 text-red-600 hover:bg-red-50"
                        title="Delete Cost Centre"
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-1" />
                        Delete
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table View */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50/75 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider select-none">
                    <th className="py-3 px-3 w-10 text-center">Move</th>
                    <th className="py-3 px-4 w-16 text-center">Order</th>
                    <th className="py-3 px-4">Code</th>
                    <th className="py-3 px-4">Cost Centre Name</th>
                    <th className="py-3 px-4">Linked Ministry</th>
                    <th className="py-3 px-4">Description</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(costCentres || []).map((cc, index) => {
                    const isDragging = draggedIndex === index;
                    const isDragOver = dragOverIndex === index;

                    return (
                      <tr
                        key={cc.id}
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
                                aria-label="Move cost centre up"
                              >
                                <ArrowUp className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleMoveDown(index)}
                                disabled={index === costCentres.length - 1 || isReordering}
                                className="p-0.5 text-slate-400 hover:text-slate-800 disabled:opacity-20 disabled:hover:text-slate-400 transition-colors"
                                title="Move down"
                                aria-label="Move cost centre down"
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
                        <td className="py-3.5 px-4 text-right space-x-1.5">
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
                            className={`text-xs h-7 px-2.5 ${cc.is_active ? "text-amber-600 hover:bg-amber-50" : "text-emerald-600 hover:bg-emerald-50"}`}
                          >
                            {cc.is_active ? "Deactivate" : "Activate"}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeletingCC(cc)}
                            className="text-xs h-7 px-2 text-red-600 hover:bg-red-50"
                            title="Delete Cost Centre"
                          >
                            <Trash2 className="w-3 h-3" />
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

            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-1">
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
                <label className="font-semibold text-slate-700">Display Order</label>
                <Input
                  type="number"
                  min={1}
                  value={formData.display_order}
                  onChange={(e) => setFormData({ ...formData, display_order: parseInt(e.target.value) || 1 })}
                  required
                />
              </div>
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
            <Button variant="outline" onClick={() => { setIsCreating(false); setEditingCC(null); }} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={handleSave} loading={isSaving} disabled={isSaving} className="bg-emerald-700 hover:bg-emerald-800 text-white">
              {isSaving ? "Saving..." : isCreating ? "Create Cost Centre" : "Save Changes"}
            </Button>
          </DialogFooter>
        </Dialog>
      )}

      {/* Delete Confirmation Dialog */}
      {deletingCC && (
        <Dialog open={true} onOpenChange={() => !isDeleting && setDeletingCC(null)}>
          <DialogHeader>
            <DialogTitle>Delete Budget Cost Centre</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 my-2 text-xs">
            <p className="text-slate-600">
              Are you sure you want to delete the cost centre <strong className="text-slate-900">{deletingCC.name} ({deletingCC.code})</strong>?
            </p>
            <p className="text-slate-500">
              This will remove the cost centre and prevent new claims from charging expenses to it.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingCC(null)} disabled={isDeleting}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirmDelete}
              loading={isDeleting}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {isDeleting ? "Deleting..." : "Delete Cost Centre"}
            </Button>
          </DialogFooter>
        </Dialog>
      )}
    </AppLayout>
  );
}
