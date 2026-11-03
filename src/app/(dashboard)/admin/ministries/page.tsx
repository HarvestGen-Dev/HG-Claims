"use client";

import { Select } from "@/components/ui/select";
import React, { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { iamClient, masterDataClient, workspaceStore } from "@/lib/domains";
import { Ministry, Profile } from "@/lib/types/database";
import { Building2, Plus, Edit, CheckCircle2, UserCheck, Trash2 } from "lucide-react";
import { showToast } from "@/lib/utils/toast";

export default function MinistryManagementPage() {
  const [ministries, setMinistries] = useState<Ministry[]>(masterDataClient.getMinistries());
  const [profiles, setProfiles] = useState<Profile[]>(iamClient.getProfiles());

  const [editingMin, setEditingMin] = useState<Ministry | null>(null);
  const [deletingMin, setDeletingMin] = useState<Ministry | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [formData, setFormData] = useState({
    code: "",
    name: "",
    description: "",
    leader_id: "",
    is_active: true,
  });
  const [error, setError] = useState("");

  const refresh = () => {
    setMinistries(masterDataClient.getMinistries());
    setProfiles(iamClient.getProfiles());
  };

  React.useEffect(() => {
    const unsub = workspaceStore.subscribe(() => {
      setMinistries(masterDataClient.getMinistries());
      setProfiles(iamClient.getProfiles());
    });
    return unsub;
  }, []);

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
      setIsSaving(true);

      if (isCreating) {
        await masterDataClient.createMinistry({
          code: formData.code.trim().toUpperCase(),
          name: formData.name.trim(),
          description: formData.description.trim(),
          leader_id: formData.leader_id || null,
          is_active: formData.is_active,
        });
        setIsCreating(false);
        showToast.success("Ministry created successfully.", "Ministry Created");
      } else if (editingMin) {
        await masterDataClient.updateMinistry(editingMin.id, {
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
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleStatus = async (m: Ministry) => {
    try {
      await masterDataClient.updateMinistry(m.id, { is_active: !m.is_active });
      refresh();
      showToast.info(`Ministry status changed to ${!m.is_active ? "Active" : "Inactive"}.`, "Status Updated");
    } catch (error) {
      showToast.error(error instanceof Error ? error.message : "Unable to update status.", "Error");
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
    } catch (error) {
      showToast.error(error instanceof Error ? error.message : "Unable to delete ministry.", "Delete Error");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <Building2 className="w-6 h-6 text-zinc-900" />
              Ministries & Department Leaders
            </h1>
            <p className="text-xs text-slate-500">
              Create, edit and configure ministries and assign approving ministry leaders.
            </p>
          </div>

          <Button
            onClick={handleOpenCreate}
            className="bg-zinc-900 hover:bg-zinc-800 text-white text-xs gap-1.5 shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>+ Add New Ministry</span>
          </Button>
        </div>

        <Card>
          <CardContent className="p-0">
            {/* Mobile Ministries Card List */}
            <div className="sm:hidden divide-y divide-slate-100">
              {(ministries || []).map((m) => (
                <div key={m.id} className="p-4 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-slate-900 text-sm">{m.name}</span>
                        <span className="font-mono text-[11px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded">
                          {m.code}
                        </span>
                      </div>
                      {m.leader ? (
                        <p className="text-xs text-emerald-800 font-medium flex items-center gap-1 mt-1">
                          <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Leader: {m.leader.full_name}</span>
                        </p>
                      ) : (
                        <p className="text-xs text-slate-400 italic mt-1">Leader unassigned</p>
                      )}
                    </div>

                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      m.is_active ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"
                    }`}>
                      {m.is_active ? "ACTIVE" : "INACTIVE"}
                    </span>
                  </div>

                  {m.description && (
                    <p className="text-xs text-slate-600">{m.description}</p>
                  )}

                  <div className="flex items-center justify-end gap-1.5 pt-2 border-t border-slate-100">
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
                      className={`text-xs h-8 px-2.5 ${m.is_active ? "text-amber-600 hover:bg-amber-50" : "text-emerald-600 hover:bg-emerald-50"}`}
                    >
                      {m.is_active ? "Deactivate" : "Activate"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeletingMin(m)}
                      className="text-xs h-8 px-2.5 text-red-600 hover:bg-red-50"
                      title="Delete Ministry"
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-1" />
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table View */}
            <div className="hidden sm:block overflow-x-auto">
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
                      <td className="py-3.5 px-4 text-right space-x-1.5">
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
                          className={`text-xs h-7 px-2.5 ${m.is_active ? "text-amber-600 hover:bg-amber-50" : "text-emerald-600 hover:bg-emerald-50"}`}
                        >
                          {m.is_active ? "Deactivate" : "Activate"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeletingMin(m)}
                          className="text-xs h-7 px-2 text-red-600 hover:bg-red-50"
                          title="Delete Ministry"
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
              <label htmlFor="ministries-select-1" className="font-semibold text-slate-700">Designated Approver (Ministry Leader)</label>
              <Select id="ministries-select-1"
                value={formData.leader_id}
                onChange={(e) => setFormData({ ...formData, leader_id: e.target.value })}
                className="w-full"
              >
                <option value="">-- No Leader Assigned --</option>
                {(profiles || []).map((p) => (
                  <option key={p.id} value={p.id}>{p.full_name} ({p.email})</option>
                ))}
              </Select>
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
              <span className="font-semibold text-slate-800">Ministry Active & Available in Claim Forms</span>
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
            <p className="text-slate-600">
              Are you sure you want to delete the ministry <strong className="text-slate-900">{deletingMin.name} ({deletingMin.code})</strong>?
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
