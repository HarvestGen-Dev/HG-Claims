import {
  DomainCommandResult,
  executeRpcCommand,
  fetchAuthorizedSnapshot,
} from "@/services/shared/http";

export const FINANCE_WORKFLOW_ACTIONS = [
  "approve",
  "return",
  "reject",
  "verify",
  "pay",
  "correct",
  "finalize_reimbursement_batch",
  "record_batch_export",
  "record_batch_bank_upload",
  "reconcile_batch_instruction",
  "disburse_reimbursement_batch",
  "void_reimbursement_batch",
] as const;

export function isFinanceCommand(
  action: string,
  payload: Record<string, unknown>
): boolean {
  if ((FINANCE_WORKFLOW_ACTIONS as readonly string[]).includes(action)) {
    return true;
  }
  if (
    (action === "master_save" || action === "master_delete") &&
    payload.table === "approval_rules"
  ) {
    return true;
  }
  return false;
}

export class FinanceService {
  async getDomainState(): Promise<DomainCommandResult> {
    const snapshot = await fetchAuthorizedSnapshot("finance");
    if (snapshot.error || !snapshot.data) return snapshot;
    return {
      status: 200,
      data: {
        approvalRules: snapshot.data.approvalRules ?? [],
        claims: snapshot.data.claims ?? [],
        reimbursementBatches: snapshot.data.reimbursementBatches ?? [],
      },
    };
  }

  async execute(
    action: string,
    payload: Record<string, unknown>
  ): Promise<DomainCommandResult> {
    if (!isFinanceCommand(action, payload)) {
      return {
        error: `Unsupported Finance action: ${action}`,
        status: 400,
      };
    }
    return executeRpcCommand(action, payload);
  }
}

export const financeService = new FinanceService();
