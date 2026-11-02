import { generateSecureToken, hashToken } from "@/lib/utils/token";
import {
  DomainCommandResult,
  executeRpcCommand,
  fetchAuthorizedSnapshot,
} from "@/services/shared/http";

export const IAM_ACTIONS = [
  "complete_onboarding",
  "profile",
  "create_invitation",
  "revoke_invitation",
  "delete_invitation",
] as const;

export type IamAction = (typeof IAM_ACTIONS)[number];

export function isIamAction(action: string): action is IamAction {
  return (IAM_ACTIONS as readonly string[]).includes(action);
}

export class IamService {
  async getDomainState(): Promise<DomainCommandResult> {
    const snapshot = await fetchAuthorizedSnapshot("iam");
    if (snapshot.error || !snapshot.data) return snapshot;
    return {
      status: 200,
      data: {
        user_id: snapshot.data.user_id,
        profiles: snapshot.data.profiles ?? [],
        signupInvitations: snapshot.data.signupInvitations ?? [],
      },
    };
  }

  async execute(
    action: string,
    payload: Record<string, unknown>
  ): Promise<DomainCommandResult> {
    if (!isIamAction(action)) {
      return {
        error: `Unsupported IAM action: ${action}`,
        status: 400,
      };
    }

    const rawToken =
      action === "create_invitation" ? generateSecureToken(32) : null;
    const enrichedPayload = rawToken
      ? { ...payload, token_hash: hashToken(rawToken) }
      : payload;

    const result = await executeRpcCommand(action, enrichedPayload);
    if (result.error) return result;

    if (rawToken) {
      return {
        status: 200,
        data: {
          ...(result.data ?? {}),
          raw_token: rawToken,
          signup_url: `/signup?invite=${rawToken}`,
          success: true,
        },
      };
    }
    return result;
  }
}

export const iamService = new IamService();
