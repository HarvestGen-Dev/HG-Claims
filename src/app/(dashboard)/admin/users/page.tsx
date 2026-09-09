"use client";

import React, { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { db } from "@/lib/mock-db/repository";
import { Profile, RoleCode } from "@/lib/types/database";
import { UserCheck, Plus, CheckCircle2, ShieldAlert, Edit, CreditCard } from "lucide-react";
import { MALAYSIAN_BANKS, BANK_CATEGORIES } from "@/lib/constants/banks";

export default function UserManagementPage() {
  const [profiles, setProfiles] = useState<Profile[]>(db.getProfiles());
  const [editingUser, setEditingUser] = useState<Profile | null>(null);
  const [selectedRoles, setSelectedRoles] = useState<RoleCode[]>([]);

  const availableRoles: { code: RoleCode; label: string }[] = [
    { code: "CLAIMANT", label: "Claimant" },
    { code: "MINISTRY_LEADER", label: "Ministry Leader" },
    { code: "FINANCE_OFFICER", label: "Finance Officer" },
    { code: "FINAL_APPROVER", label: "Final Approver" },
    { code: "SYSTEM_ADMIN", label: "System Administrator" },
  ];

  const handleEditClick = (u: Profile) => {
    setEditingUser(u);
    setSelectedRoles(u.roles || []);
  };

  const handleToggleRole = (role: RoleCode) => {
    if (selectedRoles.includes(role)) {
      if (selectedRoles.length === 1) return; // Keep at least one role
      setSelectedRoles(selectedRoles.filter(r => r !== role));
    } else {
      setSelectedRoles([...selectedRoles, role]);
    }
  };

  const handleSaveUser = () => {
    if (!editingUser) return;
    const updated = db.updateProfile(editingUser.id, {
      full_name: editingUser.full_name,
      email: editingUser.email,
      phone: editingUser.phone,
      bank_name: editingUser.bank_name,
      bank_account_number: editingUser.bank_account_number,
      status: editingUser.status,
      roles: selectedRoles,
    });
    setProfiles(db.getProfiles());
    setEditingUser(null);
  };

  const handleToggleStatus = (u: Profile) => {
    const newStatus = u.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    db.updateProfile(u.id, { status: newStatus });
    setProfiles(db.getProfiles());
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <UserCheck className="w-6 h-6 text-emerald-700" />
              User & Role Management
            </h1>
            <p className="text-xs text-slate-500">
              Manage church staff, pastoral team, and volunteer access roles and status.
            </p>
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50/75 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
                    <th className="py-3 px-4">User</th>
                    <th className="py-3 px-4">Email</th>
                    <th className="py-3 px-4">Assigned Roles</th>
                    <th className="py-3 px-4">Bank Details</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {profiles.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50/70">
                      <td className="py-3.5 px-4 font-bold text-slate-900">{u.full_name}</td>
                      <td className="py-3.5 px-4 text-slate-500">{u.email}</td>
                      <td className="py-3.5 px-4">
                        <div className="flex flex-wrap gap-1">
                          {u.roles?.map(r => (
                            <span key={r} className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] font-bold">
                              {r.replace(/_/g, " ")}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 font-mono text-[11px]">
                        {u.bank_name || "-"} ({u.bank_account_number || "-"})
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          u.status === "ACTIVE" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"
                        }`}>
                          {u.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditClick(u)}
                          className="text-xs h-7 px-2.5"
                        >
                          <Edit className="w-3 h-3 mr-1" />
                          Edit Roles
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleToggleStatus(u)}
                          className={`text-xs h-7 px-2.5 ${u.status === "ACTIVE" ? "text-red-600 hover:bg-red-50" : "text-emerald-600 hover:bg-emerald-50"}`}
                        >
                          {u.status === "ACTIVE" ? "Deactivate" : "Activate"}
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

      {/* Edit User Modal */}
      {editingUser && (
        <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
          <DialogHeader>
            <DialogTitle>Edit User Roles & Account</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 my-2 text-xs">
            <div className="space-y-1">
              <label className="font-semibold text-slate-700">Full Name</label>
              <Input
                value={editingUser.full_name}
                onChange={(e) => setEditingUser({ ...editingUser, full_name: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <label className="font-semibold text-slate-700">Email Address</label>
              <Input
                value={editingUser.email}
                onChange={(e) => setEditingUser({ ...editingUser, email: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div className="space-y-1">
                <label className="font-semibold text-slate-700 flex items-center gap-1">
                  <CreditCard className="w-3.5 h-3.5 text-emerald-700" />
                  Reimbursement Bank
                </label>
                <select
                  value={editingUser.bank_name || ""}
                  onChange={(e) => setEditingUser({ ...editingUser, bank_name: e.target.value })}
                  className="h-9 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                >
                  <option value="">Select Bank...</option>
                  {BANK_CATEGORIES.map((cat) => {
                    const categoryBanks = MALAYSIAN_BANKS.filter((b) => b.category === cat.key);
                    return (
                      <optgroup key={cat.key} label={cat.label}>
                        {categoryBanks.map((b) => (
                          <option key={b.id} value={b.shortName}>
                            {b.name} ({b.shortName})
                          </option>
                        ))}
                      </optgroup>
                    );
                  })}
                  {editingUser.bank_name && !MALAYSIAN_BANKS.some((b) => b.shortName === editingUser.bank_name || b.name === editingUser.bank_name) && (
                    <option value={editingUser.bank_name}>{editingUser.bank_name} (Custom)</option>
                  )}
                </select>
              </div>
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Account Number</label>
                <Input
                  value={editingUser.bank_account_number || ""}
                  onChange={(e) => setEditingUser({ ...editingUser, bank_account_number: e.target.value })}
                  placeholder="e.g. 114012345678"
                  className="font-mono text-xs h-9"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="font-semibold text-slate-700 block">Assign Functional Roles</label>
              <div className="grid grid-cols-1 gap-2">
                {availableRoles.map((r) => {
                  const isChecked = selectedRoles.includes(r.code);
                  return (
                    <label
                      key={r.code}
                      onClick={() => handleToggleRole(r.code)}
                      className={`flex items-center justify-between p-2 rounded-lg border cursor-pointer ${
                        isChecked ? "bg-emerald-50 border-emerald-300 text-emerald-900 font-semibold" : "bg-slate-50 border-slate-200"
                      }`}
                    >
                      <span>{r.label}</span>
                      {isChecked && <CheckCircle2 className="w-4 h-4 text-emerald-700" />}
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingUser(null)}>Cancel</Button>
            <Button onClick={handleSaveUser} className="bg-emerald-700 hover:bg-emerald-800 text-white">Save Changes</Button>
          </DialogFooter>
        </Dialog>
      )}
    </AppLayout>
  );
}
