import type { Profile, RoleCode, SignupInvitation } from "@/lib/types/database";
import { workspaceStore } from "./store";

const IAM_ENDPOINT = "/api/v1/iam";

export class IamClient {
  private cachedInvitationsVersion = -1;
  private cachedInvitations: SignupInvitation[] = [];

  getProfiles(): Profile[] {
    return workspaceStore.getState().profiles || [];
  }

  getProfileById(id?: string | null): Profile | undefined {
    if (!id) return undefined;
    return this.getProfiles().find(profile => profile.id === id);
  }

  getSignupInvitations(): SignupInvitation[] {
    const currentVersion = workspaceStore.getVersion();
    if (this.cachedInvitationsVersion === currentVersion) {
      return this.cachedInvitations;
    }
    const state = workspaceStore.getState();
    const ministries = (state.ministries || []).map(m => ({
      ...m,
      leader: m.leader_id ? this.getProfileById(m.leader_id) : null,
    }));
    this.cachedInvitations = (state.signupInvitations || []).map(inv => ({
      ...inv,
      ministry:
        inv.ministry ||
        (inv.ministry_id
          ? ministries.find(m => m.id === inv.ministry_id)
          : null),
      creator: this.getProfileById(inv.created_by),
    }));
    this.cachedInvitationsVersion = currentVersion;
    return this.cachedInvitations;
  }

  async createSignupInvitation(data: {
    role_code: RoleCode;
    ministry_id?: string | null;
    max_uses?: number;
    expires_in_days?: number;
    description?: string;
  }) {
    return workspaceStore.dispatchDomainCommand(
      IAM_ENDPOINT,
      "create_invitation",
      data
    );
  }

  async revokeSignupInvitation(id: string) {
    return workspaceStore.dispatchDomainCommand(
      IAM_ENDPOINT,
      "revoke_invitation",
      { id }
    );
  }

  async deleteSignupInvitation(id: string) {
    return workspaceStore.dispatchDomainCommand(
      IAM_ENDPOINT,
      "delete_invitation",
      { id }
    );
  }

  async completeOnboarding(data: { full_name: string; phone?: string }) {
    return workspaceStore.dispatchDomainCommand(
      IAM_ENDPOINT,
      "complete_onboarding",
      data
    );
  }

  async updateProfile(id: string, data: Partial<Profile>): Promise<Profile> {
    await workspaceStore.dispatchDomainCommand(IAM_ENDPOINT, "profile", {
      id,
      data,
    });
    return this.getProfileById(id)!;
  }

  async inviteUserByEmail(data: {
    email: string;
    full_name: string;
    phone?: string;
    roles: RoleCode[];
    ministry_id?: string | null;
  }): Promise<{ success: boolean; user_id?: string }> {
    const response = await fetch("/api/users/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.error || "Unable to send email invitation.");
    }
    await workspaceStore.refreshDomain("iam");
    return body;
  }
}

export const iamClient = new IamClient();
