"use client";

import React, { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/data/repository";
import { Profile, RoleCode, SignupInvitation, Ministry } from "@/lib/types/database";
import {
  UserCheck,
  Plus,
  CheckCircle2,
  Edit,
  Link2,
  Copy,
  Check,
  Shield,
  Building2,
  Clock,
  Ban,
  Users,
  AlertCircle
} from "lucide-react";
import { showToast } from "@/lib/utils/toast";


export default function UserManagementPage() {
  const [profiles, setProfiles] = useState<Profile[]>(db.getProfiles());
  const [ministries, setMinistries] = useState<Ministry[]>(db.getMinistries());
  const [invitations, setInvitations] = useState<SignupInvitation[]>(db.getSignupInvitations());
  const [activeTab, setActiveTab] = useState<"users" | "invitations">("users");

  // Edit user state
  const [editingUser, setEditingUser] = useState<Profile | null>(null);
  const [selectedRoles, setSelectedRoles] = useState<RoleCode[]>([]);
  const [selectedMinistryId, setSelectedMinistryId] = useState<string>("");

  // Create invitation modal state
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [inviteRole, setInviteRole] = useState<RoleCode>("MINISTRY_LEADER");
  const [inviteMinistryId, setInviteMinistryId] = useState<string>("");
  const [inviteUsageType, setInviteUsageType] = useState<"single" | "multi">("single");
  const [inviteMaxUses, setInviteMaxUses] = useState<number>(5);
  const [inviteExpiresDays, setInviteExpiresDays] = useState<number>(7);
  const [inviteDescription, setInviteDescription] = useState<string>("");
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [inviteBusy, setInviteBusy] = useState(false);

  useEffect(() => {
    const unsub = db.subscribe(() => {
      setProfiles(db.getProfiles());
      setMinistries(db.getMinistries());
      setInvitations(db.getSignupInvitations());
    });
    return unsub;
  }, []);

  const activeRoles: { code: RoleCode; label: string; description: string }[] = [
    { code: "MINISTRY_LEADER", label: "Ministry Leader", description: "Submits expense claims on behalf of ministry claimants" },
    { code: "FINANCE_OFFICER", label: "Finance Officer", description: "Reviews, approves, and processes payments for all claims" },
    { code: "SYSTEM_ADMIN", label: "System Administrator", description: "Configures master data, workflows, users, and invite links" },
  ];

  const handleEditClick = (u: Profile) => {
    setEditingUser(u);
    // Filter to only active roles
    const validRoles = (u.roles || []).filter(r =>
      ["MINISTRY_LEADER", "FINANCE_OFFICER", "SYSTEM_ADMIN"].includes(r)
    ) as RoleCode[];
    setSelectedRoles(validRoles.length > 0 ? validRoles : ["MINISTRY_LEADER"]);
    setSelectedMinistryId(u.ministry_id || "");
  };

  const handleToggleRole = (role: RoleCode) => {
    if (selectedRoles.includes(role)) {
      if (selectedRoles.length === 1) return; // Keep at least one role
      setSelectedRoles(selectedRoles.filter(r => r !== role));
    } else {
      setSelectedRoles([...selectedRoles, role]);
    }
  };

  const handleSaveUser = async () => {
    if (!editingUser) return;
    try {
      await db.updateProfile(editingUser.id, {
        full_name: editingUser.full_name,
        email: editingUser.email,
        phone: editingUser.phone,
        ministry_id: selectedMinistryId || null,
        default_ministry_id: selectedMinistryId || null,
        status: editingUser.status,
        roles: selectedRoles,
      });
      setProfiles(db.getProfiles());
      setEditingUser(null);
      showToast.success("Changes have been made.", "User Updated");
    } catch (error) {
      showToast.error(error instanceof Error ? error.message : "Unable to save changes.", "Save Error");
    }
  };

  const handleToggleStatus = async (u: Profile) => {
    try {
      const newStatus = u.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
      await db.updateProfile(u.id, { status: newStatus });
      setProfiles(db.getProfiles());
      showToast.info(`User status changed to ${newStatus.toLowerCase()}.`, "Status Updated");
    } catch (error) {
      showToast.error(error instanceof Error ? error.message : "Unable to update status.", "Error");
    }
  };

  const handleCreateInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteError("");

    if (inviteRole === "MINISTRY_LEADER" && !inviteMinistryId) {
      setInviteError("Please select a ministry for the Ministry Leader.");
      return;
    }

    setInviteBusy(true);
    try {
      const maxUses = inviteUsageType === "single" ? 1 : Number(inviteMaxUses) || 5;
      const result = await db.createSignupInvitation({
        role_code: inviteRole,
        ministry_id: inviteRole === "MINISTRY_LEADER" ? inviteMinistryId : null,
        max_uses: maxUses,
        expires_in_days: Number(inviteExpiresDays) || 7,
        description: inviteDescription || undefined,
      });

      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const fullUrl = `${origin}${result.signup_url || `/signup?invite=${result.raw_token}`}`;
      setGeneratedLink(fullUrl);
      setInvitations(db.getSignupInvitations());
      showToast.success("Invitation link generated successfully.", "Invitation Created");
    } catch (err: any) {
      setInviteError(err instanceof Error ? err.message : "Unable to create invitation link.");
    } finally {
      setInviteBusy(false);
    }
  };

  const handleCopyLink = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    showToast.success("Invitation link copied to clipboard.", "Link Copied");
    setTimeout(() => setCopied(false), 2500);
  };

  const handleRevokeInvite = async (id: string) => {
    if (confirm("Are you sure you want to revoke this invitation link? It will immediately stop accepting new sign-ups.")) {
      try {
        await db.revokeSignupInvitation(id);
        setInvitations(db.getSignupInvitations());
        showToast.info("Invitation link has been revoked.", "Invitation Revoked");
      } catch (err: any) {
        showToast.error(err instanceof Error ? err.message : "Failed to revoke invitation.", "Revoke Error");
      }
    }
  };

  const resetInviteModal = () => {
    setCreatingInvite(false);
    setGeneratedLink(null);
    setInviteError("");
    setInviteDescription("");
    setInviteRole("MINISTRY_LEADER");
    setInviteMinistryId(ministries[0]?.id || "");
    setInviteUsageType("single");
    setCopied(false);
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <UserCheck className="w-6 h-6 text-emerald-700" />
              User & Invitation Management
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Manage authorized Ministry Leaders, Finance Officers, and generate secure sign-up links.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => {
                resetInviteModal();
                setCreatingInvite(true);
              }}
              className="gap-2 bg-emerald-700 hover:bg-emerald-800 text-white"
            >
              <Plus className="h-4 w-4" />
              Create Sign-up Link
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200">
          <button
            onClick={() => setActiveTab("users")}
            className={`pb-3 px-4 text-sm font-semibold border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === "users"
                ? "border-emerald-700 text-emerald-800"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            <Users className="h-4 w-4" />
            Active Users ({profiles.length})
          </button>
          <button
            onClick={() => setActiveTab("invitations")}
            className={`pb-3 px-4 text-sm font-semibold border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === "invitations"
                ? "border-emerald-700 text-emerald-800"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            <Link2 className="h-4 w-4" />
            Sign-up Invitation Links ({invitations.length})
          </button>
        </div>

        {/* Tab 1: Users List */}
        {activeTab === "users" && (
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50/75 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
                      <th className="py-3 px-4">User</th>
                      <th className="py-3 px-4">Email & Contact</th>
                      <th className="py-3 px-4">Roles & Ministry</th>
                      <th className="py-3 px-4 text-center">Setup Status</th>
                      <th className="py-3 px-4 text-center">Account Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(profiles || []).map((u) => {
                      const userMinistry = (ministries || []).find(m => m.id === u.ministry_id);
                      const isOnboarded = !!u.onboarding_completed_at;

                      return (
                        <tr key={u.id} className="hover:bg-slate-50/70">
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-slate-900">
                              {u.full_name || <span className="italic text-slate-400">Uncompleted Setup</span>}
                            </div>
                            <div className="text-[11px] text-slate-400">{u.id}</div>
                          </td>
                          <td className="py-3.5 px-4 text-slate-600">
                            <div>{u.email}</div>
                            {u.phone && <div className="text-[11px] text-slate-400">{u.phone}</div>}
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="flex flex-wrap items-center gap-1.5">
                              {(u.roles || []).map(r => (
                                <span
                                  key={r}
                                  className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] font-bold"
                                >
                                  {r.replace(/_/g, " ")}
                                </span>
                              ))}
                              {userMinistry && (
                                <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200 text-[10px] font-medium flex items-center gap-1">
                                  <Building2 className="w-3 h-3 text-slate-400" />
                                  {userMinistry.name}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            {isOnboarded ? (
                              <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]">
                                Ready
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[10px]">
                                Pending Onboarding
                              </Badge>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                u.status === "ACTIVE"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : "bg-red-100 text-red-800"
                              }`}
                            >
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
                              Edit
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleToggleStatus(u)}
                              className={`text-xs h-7 px-2.5 ${
                                u.status === "ACTIVE"
                                  ? "text-red-600 hover:bg-red-50"
                                  : "text-emerald-600 hover:bg-emerald-50"
                              }`}
                            >
                              {u.status === "ACTIVE" ? "Deactivate" : "Activate"}
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
        )}

        {/* Tab 2: Invitations List */}
        {activeTab === "invitations" && (
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50/75 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
                      <th className="py-3 px-4">Role & Ministry</th>
                      <th className="py-3 px-4">Note / Purpose</th>
                      <th className="py-3 px-4 text-center">Usage</th>
                      <th className="py-3 px-4">Expires</th>
                      <th className="py-3 px-4 text-center">Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {invitations.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-400">
                          No invitation links generated yet. Click &quot;Create Sign-up Link&quot; above to invite users.
                        </td>
                      </tr>
                    ) : (
                      (invitations || []).map((inv) => {
                        const isExpired = new Date(inv.expires_at).getTime() < Date.now();
                        const isExhausted = inv.use_count >= inv.max_uses;
                        const isActive = inv.is_active && !isExpired && !isExhausted;
                        const origin = typeof window !== "undefined" ? window.location.origin : "";
                        const fullUrl = `${origin}${inv.signup_url || `/signup?invite=${inv.raw_token || inv.token_hash}`}`;

                        return (
                          <tr key={inv.id} className="hover:bg-slate-50/70">
                            <td className="py-3.5 px-4 font-semibold text-slate-900">
                              <div className="flex items-center gap-1.5">
                                <Shield className="w-3.5 h-3.5 text-emerald-600" />
                                <span>{inv.role_code.replace(/_/g, " ")}</span>
                              </div>
                              {inv.ministry && (
                                <div className="text-[11px] text-slate-500 font-normal flex items-center gap-1 mt-0.5">
                                  <Building2 className="w-3 h-3 text-slate-400" />
                                  {inv.ministry.name}
                                </div>
                              )}
                            </td>
                            <td className="py-3.5 px-4 text-slate-600">
                              {inv.description || <span className="text-slate-400 italic">No notes</span>}
                            </td>
                            <td className="py-3.5 px-4 text-center font-medium">
                              <span className="text-slate-900">{inv.use_count}</span>
                              <span className="text-slate-400"> / {inv.max_uses}</span>
                            </td>
                            <td className="py-3.5 px-4 text-slate-600">
                              <div className="flex items-center gap-1">
                                <Clock className="w-3 h-3 text-slate-400" />
                                <span>{new Date(inv.expires_at).toLocaleDateString()}</span>
                              </div>
                            </td>
                            <td className="py-3.5 px-4 text-center">
                              {isActive ? (
                                <Badge className="bg-emerald-100 text-emerald-800 text-[10px]">Active</Badge>
                              ) : !inv.is_active ? (
                                <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-[10px]">Revoked</Badge>
                              ) : isExhausted ? (
                                <Badge variant="outline" className="bg-slate-100 text-slate-700 border-slate-200 text-[10px]">Used</Badge>
                              ) : (
                                <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[10px]">Expired</Badge>
                              )}
                            </td>
                            <td className="py-3.5 px-4 text-right space-x-2">
                              {isActive && (
                                <>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleCopyLink(fullUrl)}
                                    className="text-xs h-7 px-2.5"
                                  >
                                    <Copy className="w-3 h-3 mr-1" />
                                    Copy Link
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleRevokeInvite(inv.id)}
                                    className="text-xs h-7 px-2.5 text-red-600 hover:bg-red-50"
                                  >
                                    <Ban className="w-3 h-3 mr-1" />
                                    Revoke
                                  </Button>
                                </>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Create Sign-up Link Dialog */}
      <Dialog open={creatingInvite} onOpenChange={(open) => !open && resetInviteModal()}>
        <DialogHeader>
          <DialogTitle>Generate Sign-up Invitation Link</DialogTitle>
        </DialogHeader>

        {generatedLink ? (
          <div className="space-y-4 my-2 text-xs">
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-900 space-y-2">
              <div className="flex items-center gap-2 font-bold text-sm">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                Sign-up Link Ready!
              </div>
              <p className="text-xs text-emerald-700">
                Share this link with the invited person. It enforces their role and ministry assignment automatically upon registration.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-slate-700">Invitation URL</label>
              <div className="flex gap-2">
                <Input readOnly value={generatedLink} className="h-10 text-xs font-mono bg-slate-50" />
                <Button
                  onClick={() => handleCopyLink(generatedLink)}
                  className="bg-emerald-700 hover:bg-emerald-800 text-white shrink-0 gap-1.5"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
                  {copied ? "Copied!" : "Copy"}
                </Button>
              </div>
            </div>

            <DialogFooter className="mt-6">
              <Button onClick={resetInviteModal}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleCreateInvite} className="space-y-4 my-2 text-xs">
            <div className="space-y-1.5">
              <label className="font-semibold text-slate-700 block">Invited System Role</label>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as RoleCode)}
                className="w-full border border-slate-300 rounded-md p-2 text-xs bg-white h-9 focus:ring-1 focus:ring-emerald-500"
              >
                <option value="MINISTRY_LEADER">Ministry Leader (Submits claims for volunteers/staff)</option>
                <option value="FINANCE_OFFICER">Finance Officer (Reviews, approves, records payments)</option>
                <option value="SYSTEM_ADMIN">System Administrator (Full platform configuration)</option>
              </select>
            </div>

            {inviteRole === "MINISTRY_LEADER" && (
              <div className="space-y-1.5">
                <label className="font-semibold text-slate-700 flex items-center justify-between">
                  <span>Assigned Ministry <span className="text-red-500">*</span></span>
                  <span className="text-[10px] text-slate-400 font-normal">Required for Ministry Leader</span>
                </label>
                <select
                  value={inviteMinistryId}
                  onChange={(e) => setInviteMinistryId(e.target.value)}
                  required
                  className="w-full border border-slate-300 rounded-md p-2 text-xs bg-white h-9 focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="">-- Select a Ministry --</option>
                  {(ministries || []).map((m) => (
                    <option key={m.id} value={m.id}>{m.name} ({m.code})</option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="font-semibold text-slate-700 block">Usage Limit</label>
                <select
                  value={inviteUsageType}
                  onChange={(e) => setInviteUsageType(e.target.value as any)}
                  className="w-full border border-slate-300 rounded-md p-2 text-xs bg-white h-9 focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="single">Single Use (1 user)</option>
                  <option value="multi">Multiple Uses</option>
                </select>
              </div>

              {inviteUsageType === "multi" ? (
                <div className="space-y-1.5">
                  <label className="font-semibold text-slate-700 block">Max Uses</label>
                  <Input
                    type="number"
                    min={2}
                    max={100}
                    value={inviteMaxUses}
                    onChange={(e) => setInviteMaxUses(parseInt(e.target.value) || 2)}
                    className="h-9"
                  />
                </div>
              ) : (
                <div className="space-y-1.5">
                  <label className="font-semibold text-slate-700 block">Expiration Duration</label>
                  <select
                    value={inviteExpiresDays}
                    onChange={(e) => setInviteExpiresDays(parseInt(e.target.value) || 7)}
                    className="w-full border border-slate-300 rounded-md p-2 text-xs bg-white h-9 focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value={3}>3 Days</option>
                    <option value={7}>7 Days (Standard)</option>
                    <option value={14}>14 Days</option>
                    <option value={30}>30 Days</option>
                  </select>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-slate-700 block">
                Description / Purpose <span className="text-slate-400 font-normal">(Optional)</span>
              </label>
              <Input
                placeholder="e.g. New Youth Ministry Leader invite for 2026"
                value={inviteDescription}
                onChange={(e) => setInviteDescription(e.target.value)}
                className="h-9"
              />
            </div>

            {inviteError && (
              <div className="p-2.5 bg-red-50 border border-red-200 rounded text-xs text-red-700 flex items-start gap-1.5">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
                <span>{inviteError}</span>
              </div>
            )}

            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={resetInviteModal}>Cancel</Button>
              <Button type="submit" disabled={inviteBusy} className="bg-emerald-700 hover:bg-emerald-800 text-white">
                {inviteBusy ? "Generating..." : "Generate Link"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </Dialog>

      {/* Edit User Modal */}
      {editingUser && (
        <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
          <DialogHeader>
            <DialogTitle>Edit User Roles & Ministry</DialogTitle>
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
                readOnly
                className="bg-slate-50 text-slate-500"
              />
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-slate-700">Phone</label>
              <Input
                value={editingUser.phone || ""}
                onChange={(e) => setEditingUser({ ...editingUser, phone: e.target.value })}
                placeholder="+60 12-345 6789"
              />
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-slate-700">Assigned Ministry</label>
              <select
                value={selectedMinistryId}
                onChange={(e) => setSelectedMinistryId(e.target.value)}
                className="w-full border border-slate-300 rounded-md p-2 text-xs bg-white h-9 focus:ring-1 focus:ring-emerald-500"
              >
                <option value="">-- No Specific Ministry --</option>
                {(ministries || []).map((m) => (
                  <option key={m.id} value={m.id}>{m.name} ({m.code})</option>
                ))}
              </select>
            </div>

            <div className="space-y-2 pt-2">
              <label className="font-semibold text-slate-700 block">Assign Active System Roles</label>
              <div className="grid grid-cols-1 gap-2">
                {(activeRoles || []).map((r) => {
                  const isChecked = selectedRoles.includes(r.code);
                  return (
                    <label
                      key={r.code}
                      onClick={() => handleToggleRole(r.code)}
                      className={`flex items-start justify-between p-2.5 rounded-lg border cursor-pointer transition-colors ${
                        isChecked
                          ? "bg-emerald-50/80 border-emerald-400 text-emerald-950 font-semibold"
                          : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100/60"
                      }`}
                    >
                      <div>
                        <div>{r.label}</div>
                        <div className="text-[11px] font-normal text-slate-500 mt-0.5">{r.description}</div>
                      </div>
                      {isChecked && <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />}
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setEditingUser(null)}>Cancel</Button>
            <Button onClick={handleSaveUser} className="bg-emerald-700 hover:bg-emerald-800 text-white">Save Changes</Button>
          </DialogFooter>
        </Dialog>
      )}
    </AppLayout>
  );
}
