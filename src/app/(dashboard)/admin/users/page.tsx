"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Copy, Link2, Mail } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { iamClient, workspaceStore } from "@/lib/domains";
import { formatRole, roleLabels } from "@/lib/auth/roles";
import type { Profile, RoleCode, SignupInvitation } from "@/lib/types/database";
import { showToast } from "@/lib/utils/toast";

const roles = Object.keys(roleLabels) as RoleCode[];
const field = "space-y-1.5";
const form = "space-y-4 text-sm";
const row = "grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2 px-4 py-4 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_7.5rem_13rem] md:items-center md:gap-4 md:px-5";
const rowIdentity = "col-span-2 min-w-0 break-words md:col-span-1";
const rowStatus = "justify-self-end md:justify-self-start";
const rowActions = "table-actions col-span-2 w-fit md:col-span-1 md:justify-self-end";

function RoleOptions({ value, onChange }: { value: RoleCode[]; onChange: (roles: RoleCode[]) => void }) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="mb-1 font-medium">Roles</legend>
      {roles.map((role) => (
        <label key={role} className="flex min-h-8 cursor-pointer items-center gap-2.5">
          <Checkbox
            checked={value.includes(role)}
            onCheckedChange={(checked) => onChange(checked ? [...value, role] : value.filter((item) => item !== role))}
          />
          {roleLabels[role]}
        </label>
      ))}
    </fieldset>
  );
}

function SharedAccount({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex min-h-9 cursor-pointer items-center gap-2.5 border-t border-border pt-3">
      <Checkbox checked={checked} onCheckedChange={onChange} />
      Shared account
    </label>
  );
}

function UserList({ profiles, onEdit, onStatus }: {
  profiles: Profile[];
  onEdit: (profile: Profile) => void;
  onStatus: (profile: Profile) => void;
}) {
  if (!profiles.length) return <p className="p-6 text-sm text-muted-foreground">No users yet.</p>;
  return (
    <>
      <div className={`${row} hidden border-b bg-muted/50 text-sm font-medium text-muted-foreground md:grid`} aria-hidden="true">
        <span>User</span><span>Roles</span><span>Status</span><span className="text-right">Actions</span>
      </div>
      <ul className="divide-y divide-border">
        {profiles.map((profile) => {
          const active = profile.status === "ACTIVE";
          return (
            <li key={profile.id} className={row}>
              <div className={rowIdentity}>
                <p className="font-medium">{profile.full_name || "Pending setup"}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">{profile.email}</p>
              </div>
              <div className="text-sm">
                <p>{profile.roles?.length ? profile.roles.map(formatRole).join(", ") : profile.is_payee_only ? "Saved payee" : "No role"}</p>
                {profile.is_multi_user && <p className="text-muted-foreground">Shared account</p>}
              </div>
              <div className={rowStatus}>
                <Badge variant={active ? profile.onboarding_completed_at ? "success" : "warning" : "secondary"}>
                  {active ? profile.onboarding_completed_at ? "Active" : "Pending setup" : profile.status === "SUSPENDED" ? "Suspended" : "Inactive"}
                </Badge>
              </div>
              <div className={rowActions}>
                <Button variant="outline" className="min-h-11" onClick={() => onEdit(profile)}>Edit</Button>
                <Button variant="ghost" className="min-h-11 min-w-28" onClick={() => onStatus(profile)}>
                  {active ? "Deactivate" : "Activate"}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

export default function UserManagementPage() {
  const [profiles, setProfiles] = useState(() => iamClient.getProfiles());
  const [invitations, setInvitations] = useState(() => iamClient.getSignupInvitations());
  const [activeTab, setActiveTab] = useState<"users" | "invitations">("users");
  const [dialog, setDialog] = useState<"email" | "link" | "edit" | "delete" | null>(null);
  const [editingUser, setEditingUser] = useState<Profile | null>(null);
  const [deletingInvite, setDeletingInvite] = useState<SignupInvitation | null>(null);
  const [email, setEmail] = useState("");
  const [selectedRoles, setSelectedRoles] = useState<RoleCode[]>(["CLAIMANT"]);
  const [inviteRole, setInviteRole] = useState<RoleCode>("CLAIMANT");
  const [maxUses, setMaxUses] = useState("1");
  const [expiresDays, setExpiresDays] = useState(7);
  const [description, setDescription] = useState("");
  const [shared, setShared] = useState(false);
  const [links, setLinks] = useState<Record<string, string>>({});
  const [generatedLink, setGeneratedLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => workspaceStore.subscribeDomains(["iam"], () => {
    setProfiles(iamClient.getProfiles());
    setInvitations(iamClient.getSignupInvitations());
  }), []);

  useEffect(() => {
    if (activeTab !== "invitations") return;

    const refresh = () => {
      if (document.visibilityState === "visible") {
        void iamClient.refreshInvitations().catch(() => {
          // Keep the last count visible while the connection is unavailable.
        });
      }
    };
    refresh();
    const interval = window.setInterval(refresh, 5000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [activeTab]);

  function openDialog(next: typeof dialog) {
    setError("");
    setGeneratedLink("");
    setCopied(false);
    setDialog(next);
  }

  function openEmail() {
    setEmail("");
    setSelectedRoles(["CLAIMANT"]);
    setShared(false);
    openDialog("email");
  }

  function openLink() {
    setInviteRole("CLAIMANT");
    setMaxUses("1");
    setExpiresDays(7);
    setDescription("");
    setShared(false);
    openDialog("link");
  }

  function openEdit(profile: Profile) {
    setEditingUser(profile);
    setSelectedRoles(roles.filter((role) => profile.roles?.includes(role)));
    setShared(Boolean(profile.is_multi_user));
    openDialog("edit");
  }

  async function run(action: () => Promise<void>, fallback: string) {
    setError("");
    setBusy(true);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : fallback);
    } finally {
      setBusy(false);
    }
  }

  function sendInvite(event: FormEvent) {
    event.preventDefault();
    if (!selectedRoles.length) {
      setError("Choose at least one role.");
      return;
    }
    void run(async () => {
      await iamClient.inviteUserByEmail({ email: email.trim(), roles: selectedRoles, is_multi_user: shared });
      setActiveTab("users");
      setDialog(null);
      showToast.success(`Invitation sent to ${email.trim()}.`);
    }, "Unable to send the invitation.");
  }

  function createLink(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      const result = await iamClient.createSignupInvitation({
        role_code: inviteRole,
        max_uses: Number(maxUses),
        expires_in_days: expiresDays,
        description: description.trim() || undefined,
        is_multi_user: shared,
      });
      const url = new URL(result.signup_url || `/signup?invite=${result.raw_token}`, window.location.origin).href;
      setLinks((previous) => ({ ...previous, [result.id]: url }));
      setGeneratedLink(url);
      setActiveTab("invitations");
    }, "Unable to create the invitation link.");
  }

  function saveUser(event: FormEvent) {
    event.preventDefault();
    if (!editingUser) return;
    if (!selectedRoles.length && !editingUser.is_payee_only) {
      setError("Choose at least one role.");
      return;
    }
    void run(async () => {
      await iamClient.updateProfile(editingUser.id, {
        full_name: editingUser.full_name,
        phone: editingUser.phone,
        ...(editingUser.is_payee_only ? {} : { roles: selectedRoles, is_multi_user: shared }),
      });
      setDialog(null);
      showToast.success("User updated.");
    }, "Unable to save the user.");
  }

  async function toggleStatus(profile: Profile) {
    try {
      const status = profile.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
      await iamClient.updateProfile(profile.id, { status });
      showToast.success(status === "ACTIVE" ? "User activated." : "User deactivated.");
    } catch (err) {
      showToast.error(err instanceof Error ? err.message : "Unable to update the user.");
    }
  }

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      if (generatedLink === url) setCopied(true);
      showToast.success("Invitation link copied.");
    } catch {
      showToast.error("Unable to copy the invitation link.");
    }
  }

  async function revokeInvite(id: string) {
    if (!confirm("Revoke this invitation link? It will stop accepting sign-ups.")) return;
    try {
      await iamClient.revokeSignupInvitation(id);
      showToast.success("Invitation revoked.");
    } catch (err) {
      showToast.error(err instanceof Error ? err.message : "Unable to revoke the invitation.");
    }
  }

  function deleteInvite() {
    if (!deletingInvite) return;
    void run(async () => {
      await iamClient.deleteSignupInvitation(deletingInvite.id);
      setDialog(null);
      showToast.success("Invitation deleted.");
    }, "Unable to delete the invitation.");
  }

  const formError = error && <Alert variant="destructive" className="p-3">{error}</Alert>;
  const cancel = <Button type="button" variant="outline" disabled={busy} onClick={() => setDialog(null)}>Cancel</Button>;

  return (
    <AppLayout>
      <div className="space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <h1>Users &amp; invitations</h1>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="gap-2" onClick={openLink}>
              <Link2 className="size-4" /> Create link
            </Button>
            <Button className="gap-2" onClick={openEmail}>
              <Mail className="size-4" /> Invite by email
            </Button>
          </div>
        </header>

        <div className="flex gap-5 border-b border-border" role="group" aria-label="User management view">
          {([["users", "Users", profiles.length], ["invitations", "Invitation links", invitations.length]] as const).map(([tab, label, count]) => (
            <button
              type="button"
              key={tab}
              aria-pressed={activeTab === tab}
              onClick={() => setActiveTab(tab)}
              className="flex min-h-11 items-center gap-2 border-b-2 border-transparent text-sm text-muted-foreground hover:text-foreground aria-pressed:border-primary aria-pressed:font-semibold aria-pressed:text-foreground"
            >
              {label} <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
            </button>
          ))}
        </div>

        <Card className="overflow-hidden">
          {activeTab === "users" ? (
            <UserList profiles={profiles} onEdit={openEdit} onStatus={toggleStatus} />
          ) : invitations.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No invitation links yet.</p>
          ) : (
            <>
              <div className={`${row} hidden border-b bg-muted/50 text-sm font-medium text-muted-foreground md:grid`} aria-hidden="true">
                <span>Invitation</span><span>Usage</span><span>Status</span><span className="text-right">Actions</span>
              </div>
              <ul className="divide-y divide-border">
                {invitations.map((invite) => {
                  const expired = new Date(invite.expires_at).getTime() <= Date.now();
                  const used = invite.use_count >= invite.max_uses;
                  const status = used ? "Used" : !invite.is_active ? "Revoked" : expired ? "Expired" : "Active";
                  const url = links[invite.id];
                  return (
                    <li key={invite.id} className={row}>
                      <div className={rowIdentity}>
                        <p className="font-medium">{formatRole(invite.role_code)}</p>
                        {invite.description && <p className="text-sm text-muted-foreground">{invite.description}</p>}
                      </div>
                      <div className="text-sm">
                        <p>{invite.use_count} of {invite.max_uses} used</p>
                        <p className="text-muted-foreground">Expires {new Date(invite.expires_at).toLocaleDateString()}</p>
                      </div>
                      <div className={rowStatus}><Badge variant={status === "Active" ? "success" : "secondary"}>{status}</Badge></div>
                      <div className={rowActions}>
                        {status === "Active" && url && <Button size="sm" variant="outline" className="min-h-11" onClick={() => copyLink(url)}>Copy link</Button>}
                        {status === "Active" && <Button size="sm" variant="ghost" className="min-h-11" onClick={() => revokeInvite(invite.id)}>Revoke</Button>}
                        <Button size="sm" variant="ghost" className="min-h-11 text-destructive" onClick={() => { setDeletingInvite(invite); openDialog("delete"); }}>Delete</Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </Card>
      </div>

      <Dialog open={dialog !== null} onOpenChange={(open) => { if (!open && !busy) setDialog(null); }}>
        {dialog === "email" && (
          <>
            <DialogHeader><DialogTitle>Invite by email</DialogTitle></DialogHeader>
            <form className={form} onSubmit={sendInvite}>
              <fieldset disabled={busy} className={form}>
                <div className={field}>
                  <Label htmlFor="invite-email">Email address</Label>
                  <Input id="invite-email" type="email" autoComplete="email" maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
                <RoleOptions value={selectedRoles} onChange={setSelectedRoles} />
                <SharedAccount checked={shared} onChange={setShared} />
              </fieldset>
              {formError}
              <DialogFooter>{cancel}<Button type="submit" loading={busy}>Send invitation</Button></DialogFooter>
            </form>
          </>
        )}

        {dialog === "link" && (
          <>
            <DialogHeader><DialogTitle>{generatedLink ? "Invitation link ready" : "Create invitation link"}</DialogTitle></DialogHeader>
            {generatedLink ? (
              <div className={form}>
                <p className="text-muted-foreground">Copy the link before closing this window.</p>
                <div className="flex gap-2">
                  <Input aria-label="Invitation link" value={generatedLink} readOnly onFocus={(e) => e.target.select()} />
                  <Button variant="outline" onClick={() => copyLink(generatedLink)} className="gap-2">
                    <Copy className="size-4" />{copied ? "Copied" : "Copy"}
                  </Button>
                </div>
                <DialogFooter><Button onClick={() => setDialog(null)}>Done</Button></DialogFooter>
              </div>
            ) : (
              <form className={form} onSubmit={createLink}>
                <fieldset disabled={busy} className={form}>
                  <div className={field}>
                    <Label htmlFor="link-role">Role</Label>
                    <Select id="link-role" className="w-full" value={inviteRole} onChange={(e) => setInviteRole(e.target.value as RoleCode)}>
                      {roles.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className={field}>
                      <Label htmlFor="link-uses">Maximum uses</Label>
                      <Input id="link-uses" type="number" min={1} max={1000} value={maxUses} onChange={(e) => setMaxUses(e.target.value)} required />
                    </div>
                    <div className={field}>
                      <Label htmlFor="link-expiry">Expires in</Label>
                      <Select id="link-expiry" className="w-full" value={expiresDays} onChange={(e) => setExpiresDays(Number(e.target.value))}>
                        {[3, 7, 14, 30].map((days) => <option key={days} value={days}>{days} days</option>)}
                      </Select>
                    </div>
                  </div>
                  <div className={field}>
                    <Label htmlFor="link-note">Note</Label>
                    <Input id="link-note" value={description} onChange={(e) => setDescription(e.target.value)} />
                  </div>
                  <SharedAccount checked={shared} onChange={setShared} />
                </fieldset>
                {formError}
                <DialogFooter>{cancel}<Button type="submit" loading={busy}>Create link</Button></DialogFooter>
              </form>
            )}
          </>
        )}

        {dialog === "edit" && editingUser && (
          <>
            <DialogHeader><DialogTitle>Edit user</DialogTitle></DialogHeader>
            <form className={form} onSubmit={saveUser}>
              <fieldset disabled={busy} className={form}>
                <p className="break-all text-muted-foreground">{editingUser.email}</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className={field}>
                    <Label htmlFor="edit-name">Full name</Label>
                    <Input id="edit-name" maxLength={150} required value={editingUser.full_name} onChange={(e) => setEditingUser({ ...editingUser, full_name: e.target.value })} />
                  </div>
                  <div className={field}>
                    <Label htmlFor="edit-phone">Phone</Label>
                    <Input id="edit-phone" type="tel" maxLength={50} value={editingUser.phone || ""} onChange={(e) => setEditingUser({ ...editingUser, phone: e.target.value })} />
                  </div>
                </div>
                {!editingUser.is_payee_only && <>
                  <RoleOptions value={selectedRoles} onChange={setSelectedRoles} />
                  <SharedAccount checked={shared} onChange={setShared} />
                </>}
              </fieldset>
              {formError}
              <DialogFooter>{cancel}<Button type="submit" loading={busy}>Save changes</Button></DialogFooter>
            </form>
          </>
        )}

        {dialog === "delete" && (
          <>
            <DialogHeader><DialogTitle>Delete invitation link?</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">Anyone with this link will lose the ability to sign up.</p>
            {formError}
            <DialogFooter>{cancel}<Button variant="destructive" loading={busy} onClick={deleteInvite}>Delete link</Button></DialogFooter>
          </>
        )}
      </Dialog>
    </AppLayout>
  );
}
