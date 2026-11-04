import type { Profile, RoleCode, SignupInvitation } from "@/lib/types/database";
import { workspaceStore } from "./store";

const IAM_ENDPOINT = "/api/v1/iam";

export class IamClient {
  private cachedProfilesRef: Profile[] | null = null;
  private profileByIdMap = new Map<string, Profile>();
  private cachedInvitationsKey = "";
  private cachedInvitations: SignupInvitation[] = [];

  constructor() {
    workspaceStore.onClear(() => {
      this.cachedProfilesRef = null;
      this.profileByIdMap.clear();
      this.cachedInvitationsKey = "";
      this.cachedInvitations = [];
    });
  }

  getProfiles(): Profile[] {
    return workspaceStore.getState().profiles || [];
  }

  private ensureProfileMap(): Map<string, Profile> {
    const profiles = this.getProfiles();
    if (this.cachedProfilesRef !== profiles) {
      this.profileByIdMap = new Map();
      for (const p of profiles) {
        if (p && p.id) {
          this.profileByIdMap.set(p.id, p);
        }
      }
      this.cachedProfilesRef = profiles;
    }
    return this.profileByIdMap;
  }

  getProfileById(id?: string | null): Profile | undefined {
    if (!id) return undefined;
    return this.ensureProfileMap().get(id);
  }

  getSignupInvitations(): SignupInvitation[] {
    const compositeKey = workspaceStore.getCompositeVersion("iam", "master-data");
    if (this.cachedInvitationsKey === compositeKey) {
      return this.cachedInvitations;
    }
    const state = workspaceStore.getState();
    const ministryMap = new Map(
      (state.ministries || []).map((m) => [
        m.id,
        {
          ...m,
          leader: m.leader_id ? this.getProfileById(m.leader_id) : null,
        },
      ])
    );
    this.cachedInvitations = (state.signupInvitations || []).map((inv) => ({
      ...inv,
      ministry:
        inv.ministry ||
        (inv.ministry_id ? ministryMap.get(inv.ministry_id) ?? null : null),
      creator: this.getProfileById(inv.created_by),
    }));
    this.cachedInvitationsKey = compositeKey;
    return this.cachedInvitations;
  }

  async createSignupInvitation(data: {
    role_code: RoleCode;
    max_uses?: number;
    expires_in_days?: number;
    description?: string;
    is_multi_user?: boolean;
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

  async completeOnboarding(data: {
    full_name: string;
    phone?: string;
    is_multi_user?: boolean;
    bank_name?: string;
    bank_code?: string;
    bank_account_holder_name?: string;
    bank_account_number?: string;
    beneficiary_new_ic?: string;
    beneficiary_address?: string;
  }) {
    return workspaceStore.dispatchDomainCommand(
      IAM_ENDPOINT,
      "complete_onboarding",
      data
    );
  }

  async saveClaimantBankProfile(data: {
    id?: string;
    full_name: string;
    email?: string;
    phone?: string;
    ministry_id?: string | null;
    bank_name?: string;
    bank_code: string;
    bank_account_holder_name?: string;
    bank_account_number: string;
    beneficiary_new_ic?: string;
    beneficiary_address?: string;
  }): Promise<Profile> {
    const result = await workspaceStore.dispatchDomainCommand(
      IAM_ENDPOINT,
      "create_payee_profile",
      data
    );
    return this.getProfileById(result.id)!;
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
    full_name?: string;
    phone?: string;
    roles: RoleCode[];
    is_multi_user?: boolean;
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
    await workspaceStore.refreshDomain(IAM_ENDPOINT, { forceFresh: true });
    return body;
  }
}

export const iamClient = new IamClient();
