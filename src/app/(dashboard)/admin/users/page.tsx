"use client";

import { Select } from "@/components/ui/select";
import React, { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { iamClient, masterDataClient, workspaceStore } from "@/lib/domains";
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
  AlertCircle,
  Trash2,
  Mail,
  Send
} from "lucide-react";
import { showToast } from "@/lib/utils/toast";


export default function UserManagementPage() {
  const [profiles, setProfiles] = useState<Profile[]>(iamClient.getProfiles());
  const [ministries, setMinistries] = useState<Ministry[]>(masterDataClient.getMinistries());
  const [invitations, setInvitations] = useState<SignupInvitation[]>(iamClient.getSignupInvitations());
  const [activeTab, setActiveTab] = useState<"users" | "invitations">("users");

  // Edit user state
  const [editingUser, setEditingUser] = useState<Profile | null>(null);
  const [selectedRoles, setSelectedRoles] = useState<RoleCode[]>([]);
  const [selectedMinistryId, setSelectedMinistryId] = useState<string>("");

  // Email user creation / invitation modal state
  const [creatingEmailUser, setCreatingEmailUser] = useState(false);
  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPhone, setNewUserPhone] = useState("");
  const [newUserRoles, setNewUserRoles] = useState<RoleCode[]>(["MINISTRY_LEADER"]);
  const [newUserMinistryId, setNewUserMinistryId] = useState<string>("");
  const [newUserIsMultiUser, setNewUserIsMultiUser] = useState(false);
  const [emailInviteError, setEmailInviteError] = useState("");
  const [emailInviteBusy, setEmailInviteBusy] = useState(false);

  // Create invitation link modal state
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [deletingInvite, setDeletingInvite] = useState<SignupInvitation | null>(null);
  const [isDeletingInvite, setIsDeletingInvite] = useState(false);
  const [inviteRole, setInviteRole] = useState<RoleCode>("MINISTRY_LEADER");
  const [inviteMinistryId, setInviteMinistryId] = useState<string>("");
  const [inviteUsageType, setInviteUsageType] = useState<"single" | "multi">("single");
  const [inviteMaxUses, setInviteMaxUses] = useState<number>(5);
  const [inviteExpiresDays, setInviteExpiresDays] = useState<number>(7);
  const [inviteDescription, setInviteDescription] = useState<string>("");
  const [inviteIsMultiUser, setInviteIsMultiUser] = useState(false);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [userSaving, setUserSaving] = useState(false);

  useEffect(() => {
    const unsub = workspaceStore.subscribe(() => {
      setProfiles(iamClient.getProfiles());
      setMinistries(masterDataClient.getMinistries());
      setInvitations(iamClient.getSignupInvitations());
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
    setUserSaving(true);
    try {
      await iamClient.updateProfile(editingUser.id, {
        full_name: editingUser.full_name,
        email: editingUser.email,
        phone: editingUser.phone,
        ministry_id: selectedMinistryId || null,
        default_ministry_id: selectedMinistryId || null,
        status: editingUser.status,
        roles: selectedRoles,
        is_multi_user: Boolean(editingUser.is_multi_user),
      });
      setProfiles(iamClient.getProfiles());
      setEditingUser(null);
      showToast.success("Changes have been made.", "User Updated");
    } catch (error) {
      showToast.error(error instanceof Error ? error.message : "Unable to save changes.", "Save Error");
    } finally {
      setUserSaving(false);
    }
  };

  const handleToggleStatus = async (u: Profile) => {
    try {
      const newStatus = u.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
      await iamClient.updateProfile(u.id, { status: newStatus });
      setProfiles(iamClient.getProfiles());
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
      const result = await iamClient.createSignupInvitation({
        role_code: inviteRole,
        ministry_id: inviteRole === "MINISTRY_LEADER" ? inviteMinistryId : null,
        max_uses: maxUses,
        expires_in_days: Number(inviteExpiresDays) || 7,
        description: inviteDescription || undefined,
        is_multi_user: inviteIsMultiUser,
      });

      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const fullUrl = `${origin}${result.signup_url || `/signup?invite=${result.raw_token}`}`;
      setGeneratedLink(fullUrl);
      setInvitations(iamClient.getSignupInvitations());
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
        await iamClient.revokeSignupInvitation(id);
        setInvitations(iamClient.getSignupInvitations());
        showToast.info("Invitation link has been revoked.", "Invitation Revoked");
      } catch (err: any) {
        showToast.error(err instanceof Error ? err.message : "Failed to revoke invitation.", "Revoke Error");
      }
    }
  };

  const handleConfirmDeleteInvite = async () => {
    if (!deletingInvite) return;
    try {
      setIsDeletingInvite(true);
      await iamClient.deleteSignupInvitation(deletingInvite.id);
      setInvitations(iamClient.getSignupInvitations());
      showToast.success("Invitation link deleted successfully.", "Invitation Deleted");
      setDeletingInvite(null);
    } catch (err: any) {
      showToast.error(err instanceof Error ? err.message : "Failed to delete invitation.", "Delete Error");
    } finally {
      setIsDeletingInvite(false);
    }
  };

  const resetEmailInviteModal = () => {
    setCreatingEmailUser(false);
    setNewUserName("");
    setNewUserEmail("");
    setNewUserPhone("");
    setNewUserRoles(["MINISTRY_LEADER"]);
    setNewUserMinistryId(ministries[0]?.id || "");
    setNewUserIsMultiUser(false);
    setEmailInviteError("");
  };

  const handleToggleNewUserRole = (role: RoleCode) => {
    if (newUserRoles.includes(role)) {
      if (newUserRoles.length === 1) return;
      setNewUserRoles(newUserRoles.filter((r) => r !== role));
    } else {
      setNewUserRoles([...newUserRoles, role]);
    }
  };

  const handleInviteUserByEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailInviteError("");

    if (!newUserEmail.trim()) {
      setEmailInviteError("Please enter a valid email address.");
      return;
    }
    if (newUserRoles.includes("MINISTRY_LEADER") && !newUserMinistryId) {
      setEmailInviteError("Please select an assigned ministry for the Ministry Leader.");
      return;
    }

    setEmailInviteBusy(true);
    try {
      await iamClient.inviteUserByEmail({
        email: newUserEmail.trim(),
        full_name: newUserName.trim() || undefined,
        phone: newUserPhone.trim() || undefined,
        roles: newUserRoles,
        ministry_id: newUserMinistryId || null,
        is_multi_user: newUserIsMultiUser,
      });
      setProfiles(iamClient.getProfiles());
      resetEmailInviteModal();
      setActiveTab("users");
      showToast.success(
        `Invitation email sent to ${newUserEmail.trim()}.`,
        "User Created & Invited"
      );
    } catch (err: unknown) {
      setEmailInviteError(
        err instanceof Error ? err.message : "Unable to send email invitation."
      );
    } finally {
      setEmailInviteBusy(false);
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
    setInviteIsMultiUser(false);
    setCopied(false);
    setInvitations(iamClient.getSignupInvitations());
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <UserCheck className="w-6 h-6 text-zinc-900" />
              User & Invitation Management
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Invite users directly by email, manage system roles, or generate shareable sign-up links.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              onClick={() => {
                resetInviteModal();
                setCreatingInvite(true);
              }}
              className="gap-2 text-xs"
            >
              <Link2 className="h-4 w-4" />
              Create Sign-up Link
            </Button>
            <Button
              onClick={() => {
                resetEmailInviteModal();
                setCreatingEmailUser(true);
              }}
              className="gap-2 bg-zinc-900 hover:bg-zinc-800 text-white text-xs"
            >
              <Mail className="h-4 w-4" />
              Invite User by Email
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200">
          <button
            onClick={() => setActiveTab("users")}
            className={`pb-3 px-4 text-sm font-semibold border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === "users"
                ? "border-zinc-900 text-zinc-900"
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
                ? "border-zinc-900 text-zinc-900"
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
              {/* Mobile Users Card View */}
              <div className="sm:hidden divide-y divide-slate-100">
                {(profiles || []).map((u) => {
                  const userMinistry = (ministries || []).find(m => m.id === u.ministry_id);
                  const isOnboarded = !!u.onboarding_completed_at;

                  return (
                    <div key={u.id} className="p-4 space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-bold text-slate-900 text-sm">
                            {u.full_name || <span className="italic text-slate-400">Uncompleted Setup</span>}
                          </p>
                          <p className="text-xs text-slate-500">{u.email}</p>
                          {u.phone && <p className="text-[11px] text-slate-400">{u.phone}</p>}
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            u.status === "ACTIVE"
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {u.status}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
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
                        {isOnboarded ? (
                          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]">
                            Ready
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[10px]">
                            Pending Setup
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditClick(u)}
                          className="text-xs h-8 px-3"
                        >
                          <Edit className="w-3 h-3 mr-1" />
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleToggleStatus(u)}
                          className={`text-xs h-8 px-3 ${
                            u.status === "ACTIVE"
                              ? "text-red-600 hover:bg-red-50"
                              : "text-emerald-600 hover:bg-emerald-50"
                          }`}
                        >
                          {u.status === "ACTIVE" ? "Deactivate" : "Activate"}
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
                            <div className="font-bold text-slate-900 flex items-center gap-1.5 flex-wrap">
                              {u.full_name || <span className="italic text-slate-400">Uncompleted Setup</span>}
                              {u.is_multi_user && (
                                <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-semibold">
                                  Multi-User
                                </span>
                              )}
                              {u.is_payee_only && (
                                <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-semibold">
                                  Claimant Profile
                                </span>
                              )}
                            </div>
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
              {/* Mobile Invitations Card View */}
              <div className="sm:hidden divide-y divide-slate-100">
                {invitations.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-400">
                    No invitation links generated yet. Click &quot;Create Sign-up Link&quot; above.
                  </div>
                ) : (
                  (invitations || []).map((inv) => {
                    const isExpired = new Date(inv.expires_at).getTime() < Date.now();
                    const isExhausted = inv.use_count >= inv.max_uses;
                    const isActive = inv.is_active && !isExpired && !isExhausted;
                    const origin = typeof window !== "undefined" ? window.location.origin : "";
                    const fullUrl = inv.signup_url ? `${origin}${inv.signup_url}` : inv.raw_token ? `${origin}/signup?invite=${inv.raw_token}` : "";

                    return (
                      <div key={inv.id} className="p-4 space-y-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-1.5 font-semibold text-slate-900 text-sm">
                              <Shield className="w-4 h-4 text-emerald-600" />
                              <span>{inv.role_code.replace(/_/g, " ")}</span>
                            </div>
                            {inv.ministry && (
                              <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                                <Building2 className="w-3 h-3 text-slate-400" />
                                {inv.ministry.name}
                              </p>
                            )}
                            {inv.description && (
                              <p className="text-xs text-slate-600 mt-1">{inv.description}</p>
                            )}
                          </div>
                          <div>
                            {isActive ? (
                              <Badge className="bg-emerald-100 text-emerald-800 text-[10px]">Active</Badge>
                            ) : !inv.is_active ? (
                              <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-[10px]">Revoked</Badge>
                            ) : isExhausted ? (
                              <Badge variant="outline" className="bg-slate-100 text-slate-700 border-slate-200 text-[10px]">Used</Badge>
                            ) : (
                              <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[10px]">Expired</Badge>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
                          <span>Uses: <strong className="text-slate-900">{inv.use_count} / {inv.max_uses}</strong></span>
                          <span>Expires: {new Date(inv.expires_at).toLocaleDateString()}</span>
                        </div>

                        <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                          {isActive && (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={!fullUrl}
                                    title={fullUrl ? "Copy invitation link" : "The link is shown only when created. Create a new link if needed."}
                                    onClick={() => handleCopyLink(fullUrl)}
                              className="flex-1 text-xs h-8 text-emerald-700 hover:bg-emerald-50 border-emerald-300"
                            >
                              <Copy className="w-3.5 h-3.5 mr-1" />
                              Copy Link
                            </Button>
                          )}
                          {isActive && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRevokeInvite(inv.id)}
                              className="text-xs h-8 text-amber-600 hover:bg-amber-50"
                            >
                              <Ban className="w-3.5 h-3.5 mr-1" />
                              Revoke
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeletingInvite(inv)}
                            className="text-xs h-8 text-red-600 hover:bg-red-50 ml-auto"
                          >
                            <Trash2 className="w-3.5 h-3.5 mr-1" />
                            Delete
                          </Button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Desktop Table View */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50/75 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
                      <th className="py-3 px-4">Role & Ministry</th>
                      <th className="py-3 px-4">Note / Purpose</th>
                      <th className="py-3 px-4">Invitation Link</th>
                      <th className="py-3 px-4 text-center">Usage</th>
                      <th className="py-3 px-4">Expires</th>
                      <th className="py-3 px-4 text-center">Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {invitations.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-400">
                          No invitation links generated yet. Click &quot;Create Sign-up Link&quot; above to invite users.
                        </td>
                      </tr>
                    ) : (
                      (invitations || []).map((inv) => {
                        const isExpired = new Date(inv.expires_at).getTime() < Date.now();
                        const isExhausted = inv.use_count >= inv.max_uses;
                        const isActive = inv.is_active && !isExpired && !isExhausted;
                        const origin = typeof window !== "undefined" ? window.location.origin : "";
                        const fullUrl = inv.signup_url ? `${origin}${inv.signup_url}` : inv.raw_token ? `${origin}/signup?invite=${inv.raw_token}` : "";

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
                            <td className="py-3.5 px-4 font-mono text-[11px]">
                              {isActive ? (
                                <div className="flex items-center gap-1.5 max-w-xs">
                                  <span className="truncate text-slate-600 bg-slate-100 px-2 py-1 rounded border border-slate-200">
                                    {fullUrl || "Link available only when created"}
                                  </span>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={!fullUrl}
                                    title={fullUrl ? "Copy invitation link" : "The link is shown only when created. Create a new link if needed."}
                                    onClick={() => handleCopyLink(fullUrl)}
                                    className="h-6 px-1.5 text-[10px] text-emerald-700 hover:bg-emerald-50 border-emerald-300"
                                  >
                                    <Copy className="w-3 h-3" />
                                  </Button>
                                </div>
                              ) : (
                                <span className="text-slate-400 italic">Link inactive</span>
                              )}
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
                            <td className="py-3.5 px-4 text-right space-x-1.5">
                              {isActive && (
                                <>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={!fullUrl}
                                    title={fullUrl ? "Copy invitation link" : "The link is shown only when created. Create a new link if needed."}
                                    onClick={() => handleCopyLink(fullUrl)}
                                    className="text-xs h-7 px-2"
                                  >
                                    <Copy className="w-3 h-3 mr-1" />
                                    Copy Link
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleRevokeInvite(inv.id)}
                                    className="text-xs h-7 px-2 text-amber-600 hover:bg-amber-50"
                                  >
                                    <Ban className="w-3 h-3 mr-1" />
                                    Revoke
                                  </Button>
                                </>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setDeletingInvite(inv)}
                                className="text-xs h-7 px-2 text-red-600 hover:bg-red-50 hover:text-red-700"
                                title="Delete Invitation"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
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

      {/* Invite User by Email Dialog */}
      <Dialog open={creatingEmailUser} onOpenChange={(open) => !open && !emailInviteBusy && resetEmailInviteModal()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-zinc-900" />
            Create & Invite User by Email
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleInviteUserByEmail} className="space-y-4 my-2 text-xs">
          <p className="text-slate-500 leading-relaxed">
            Sends an invitation email with a registration link where the user will enter their full name, mobile number, and password.
          </p>

          <div className="space-y-1.5">
            <label htmlFor="invite-email" className="font-semibold text-slate-700 block">
              Email Address <span className="text-red-500">*</span>
            </label>
            <Input
              id="invite-email"
              type="email"
              placeholder="user@harvestgen.org"
              value={newUserEmail}
              onChange={(e) => setNewUserEmail(e.target.value)}
              required
              disabled={emailInviteBusy}
              className="h-9"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="invite-full-name" className="font-semibold text-slate-700 block">
                Full Name <span className="text-slate-400 font-normal">(Optional — user can edit)</span>
              </label>
              <Input
                id="invite-full-name"
                placeholder="e.g. Sarah Tan"
                value={newUserName}
                onChange={(e) => setNewUserName(e.target.value)}
                disabled={emailInviteBusy}
                className="h-9"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="invite-phone" className="font-semibold text-slate-700 block">
                Mobile Phone <span className="text-slate-400 font-normal">(Optional)</span>
              </label>
              <Input
                id="invite-phone"
                type="tel"
                placeholder="+60 12-345 6789"
                value={newUserPhone}
                onChange={(e) => setNewUserPhone(e.target.value)}
                disabled={emailInviteBusy}
                className="h-9"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="invite-ministry" className="font-semibold text-slate-700 flex items-center justify-between">
              <span>
                Assigned Ministry{" "}
                {newUserRoles.includes("MINISTRY_LEADER") && <span className="text-red-500">*</span>}
              </span>
              <span className="text-[10px] text-slate-400 font-normal">
                {newUserRoles.includes("MINISTRY_LEADER") ? "Required for Ministry Leader" : "Optional"}
              </span>
            </label>
            <Select
              id="invite-ministry"
              value={newUserMinistryId}
              onChange={(e) => setNewUserMinistryId(e.target.value)}
              required={newUserRoles.includes("MINISTRY_LEADER")}
              disabled={emailInviteBusy}
              className="w-full"
            >
              <option value="">-- Select a Ministry --</option>
              {(ministries || []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.code})
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-2 pt-1">
            <label className="font-semibold text-slate-700 block">Assign System Role(s)</label>
            <div className="grid grid-cols-1 gap-2">
              {activeRoles.map((r) => {
                const isChecked = newUserRoles.includes(r.code);
                return (
                  <label
                    key={r.code}
                    onClick={() => !emailInviteBusy && handleToggleNewUserRole(r.code)}
                    className={`flex items-start justify-between p-2.5 rounded-lg border cursor-pointer transition-colors ${
                      isChecked
                        ? "bg-zinc-100 border-zinc-900 text-zinc-950 font-semibold"
                        : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100/60"
                    }`}
                  >
                    <div>
                      <div>{r.label}</div>
                      <div className="text-[11px] font-normal text-slate-500 mt-0.5">{r.description}</div>
                    </div>
                    {isChecked && <CheckCircle2 className="w-4 h-4 text-zinc-900 shrink-0 mt-0.5" />}
                  </label>
                );
              })}
            </div>
          </div>

            <div className="p-2.5 rounded-lg border border-slate-200 bg-slate-50/70">
              <label className="flex items-start gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={newUserIsMultiUser}
                  onChange={(e) => setNewUserIsMultiUser(e.target.checked)}
                  disabled={emailInviteBusy}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-zinc-900 focus:ring-zinc-900 accent-zinc-900"
                />
                <div className="text-xs">
                  <span className="font-semibold text-slate-900 block">
                    Multi-User / Shared Ministry Account
                  </span>
                  <span className="text-[11px] text-slate-500">
                    When enabled, this account will not be prompted for personal bank details upon sign-in; claimant bank profiles are selected or added directly on the Claim Form.
                  </span>
                </div>
              </label>
            </div>

          {emailInviteError && (
            <div className="p-2.5 bg-red-50 border border-red-200 rounded text-xs text-red-700 flex items-start gap-1.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
              <span>{emailInviteError}</span>
            </div>
          )}

          <DialogFooter className="mt-6">
            <Button
              type="button"
              variant="outline"
              onClick={resetEmailInviteModal}
              disabled={emailInviteBusy}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              loading={emailInviteBusy}
              disabled={emailInviteBusy}
              className="bg-zinc-900 hover:bg-zinc-800 text-white gap-1.5"
            >
              {!emailInviteBusy && <Send className="w-3.5 h-3.5" />}
              <span>{emailInviteBusy ? "Sending Invite..." : "Create & Send Email Invite"}</span>
            </Button>
          </DialogFooter>
        </form>
      </Dialog>

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
                  className="bg-zinc-900 hover:bg-zinc-800 text-white shrink-0 gap-1.5"
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
              <label htmlFor="users-select-2" className="font-semibold text-slate-700 block">Invited System Role</label>
              <Select id="users-select-2"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as RoleCode)}
                className="w-full"
              >
                <option value="MINISTRY_LEADER">Ministry Leader (Submits claims for volunteers/staff)</option>
                <option value="FINANCE_OFFICER">Finance Officer (Reviews, approves, records payments)</option>
                <option value="SYSTEM_ADMIN">System Administrator (Full platform configuration)</option>
              </Select>
            </div>

            {inviteRole === "MINISTRY_LEADER" && (
              <div className="space-y-1.5">
                <label htmlFor="users-select-3" className="font-semibold text-slate-700 flex items-center justify-between">
                  <span>Assigned Ministry <span className="text-red-500">*</span></span>
                  <span className="text-[10px] text-slate-400 font-normal">Required for Ministry Leader</span>
                </label>
                <Select id="users-select-3"
                  value={inviteMinistryId}
                  onChange={(e) => setInviteMinistryId(e.target.value)}
                  required
                  className="w-full"
                >
                  <option value="">-- Select a Ministry --</option>
                  {(ministries || []).map((m) => (
                    <option key={m.id} value={m.id}>{m.name} ({m.code})</option>
                  ))}
                </Select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label htmlFor="users-select-4" className="font-semibold text-slate-700 block">Usage Limit</label>
                <Select id="users-select-4"
                  value={inviteUsageType}
                  onChange={(e) => setInviteUsageType(e.target.value as any)}
                  className="w-full"
                >
                  <option value="single">Single Use (1 user)</option>
                  <option value="multi">Multiple Uses</option>
                </Select>
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
                  <label htmlFor="users-select-5" className="font-semibold text-slate-700 block">Expiration Duration</label>
                  <Select id="users-select-5"
                    value={inviteExpiresDays}
                    onChange={(e) => setInviteExpiresDays(parseInt(e.target.value) || 7)}
                    className="w-full"
                  >
                    <option value={3}>3 Days</option>
                    <option value={7}>7 Days (Standard)</option>
                    <option value={14}>14 Days</option>
                    <option value={30}>30 Days</option>
                  </Select>
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

            <div className="p-2.5 rounded-lg border border-slate-200 bg-slate-50/70">
              <label className="flex items-start gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={inviteIsMultiUser}
                  onChange={(e) => setInviteIsMultiUser(e.target.checked)}
                  disabled={inviteBusy}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-zinc-900 focus:ring-zinc-900 accent-zinc-900"
                />
                <div className="text-xs">
                  <span className="font-semibold text-slate-900 block">
                    Multi-User / Shared Ministry Account
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Skip personal bank prompt during onboarding; claimants select or add bank profiles during claim submission.
                  </span>
                </div>
              </label>
            </div>

            {inviteError && (
              <div className="p-2.5 bg-red-50 border border-red-200 rounded text-xs text-red-700 flex items-start gap-1.5">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
                <span>{inviteError}</span>
              </div>
            )}

            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={resetInviteModal} disabled={inviteBusy}>Cancel</Button>
              <Button type="submit" loading={inviteBusy} disabled={inviteBusy} className="bg-zinc-900 hover:bg-zinc-800 text-white">
                {inviteBusy ? "Generating..." : "Generate Link"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </Dialog>

      {/* Edit User Modal */}
      {editingUser && (
        <Dialog open={!!editingUser} onOpenChange={(open) => !open && !userSaving && setEditingUser(null)}>
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
              <label htmlFor="users-select-6" className="font-semibold text-slate-700">Assigned Ministry</label>
              <Select id="users-select-6"
                value={selectedMinistryId}
                onChange={(e) => setSelectedMinistryId(e.target.value)}
                className="w-full"
              >
                <option value="">-- No Specific Ministry --</option>
                {(ministries || []).map((m) => (
                  <option key={m.id} value={m.id}>{m.name} ({m.code})</option>
                ))}
              </Select>
            </div>

            <div className="p-2.5 rounded-lg border border-slate-200 bg-slate-50/70">
              <label className="flex items-start gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={Boolean(editingUser.is_multi_user)}
                  onChange={(e) => setEditingUser({ ...editingUser, is_multi_user: e.target.checked })}
                  disabled={userSaving}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-zinc-900 focus:ring-zinc-900 accent-zinc-900"
                />
                <div className="text-xs">
                  <span className="font-semibold text-slate-900 block">
                    Multi-User / Shared Ministry Account
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Do not prompt for a single personal bank account on login; select or add claimant bank profiles on the Claim Form.
                  </span>
                </div>
              </label>
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
                          ? "bg-zinc-100 border-zinc-900 text-zinc-950 font-semibold"
                          : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100/60"
                      }`}
                    >
                      <div>
                        <div>{r.label}</div>
                        <div className="text-[11px] font-normal text-slate-500 mt-0.5">{r.description}</div>
                      </div>
                      {isChecked && <CheckCircle2 className="w-4 h-4 text-zinc-900 shrink-0 mt-0.5" />}
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setEditingUser(null)} disabled={userSaving}>Cancel</Button>
            <Button onClick={handleSaveUser} loading={userSaving} disabled={userSaving} className="bg-zinc-900 hover:bg-zinc-800 text-white">Save Changes</Button>
          </DialogFooter>
        </Dialog>
      )}

      {/* Delete Invitation Confirmation Dialog */}
      <Dialog open={!!deletingInvite} onOpenChange={(open) => !open && !isDeletingInvite && setDeletingInvite(null)}>
        <DialogHeader>
          <DialogTitle className="text-red-700 flex items-center gap-2">
            <Trash2 className="w-5 h-5 text-red-600" />
            Delete Invitation Link
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 my-2 text-sm text-slate-600">
          <p>
            Are you sure you want to permanently delete this invitation link for <strong className="text-slate-900">{deletingInvite?.role_code.replace(/_/g, " ")}</strong>?
          </p>
          <p className="text-xs text-amber-700 bg-amber-50 p-2.5 rounded border border-amber-200">
            Anyone who attempts to use this link in the future will no longer be able to sign up with it.
          </p>
        </div>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => setDeletingInvite(null)} disabled={isDeletingInvite}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirmDeleteInvite}
            loading={isDeletingInvite}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            Delete Link
          </Button>
        </DialogFooter>
      </Dialog>
    </AppLayout>
  );
}
