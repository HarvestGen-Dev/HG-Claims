import {
  DomainCommandResult,
  executeRpcCommand,
  fetchAuthorizedSnapshot,
} from "@/services/shared/http";

export const CLAIMS_ACTIONS = [
  "save_draft",
  "submit_claim",
  "delete_claim",
  "comment",
] as const;

export type ClaimsAction = (typeof CLAIMS_ACTIONS)[number];

export function isClaimsAction(action: string): action is ClaimsAction {
  return (CLAIMS_ACTIONS as readonly string[]).includes(action);
}

export class ClaimsService {
  async getDomainState(): Promise<DomainCommandResult> {
    const snapshot = await fetchAuthorizedSnapshot("claims");
    if (snapshot.error || !snapshot.data) return snapshot;
    return {
      status: 200,
      data: {
        claims: snapshot.data.claims ?? [],
      },
    };
  }

  async execute(
    action: string,
    payload: Record<string, unknown>
  ): Promise<DomainCommandResult> {
    if (!isClaimsAction(action)) {
      return {
        error: `Unsupported Claims action: ${action}`,
        status: 400,
      };
    }
    return executeRpcCommand(action, payload);
  }
}

export const claimsService = new ClaimsService();
