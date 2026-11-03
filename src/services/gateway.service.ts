import {
  DomainCommandResult,
  executeRpcCommand,
  fetchAuthorizedSnapshot,
} from "@/services/shared/http";
import { iamService, isIamAction } from "@/services/iam/iam.service";
import {
  masterDataService,
  isMasterDataCommand,
} from "@/services/master-data/master-data.service";
import {
  claimsService,
  isClaimsAction,
} from "@/services/claims/claims.service";
import {
  financeService,
  isFinanceCommand,
} from "@/services/finance/finance.service";
import {
  notificationsService,
  isNotificationAction,
} from "@/services/notifications/notifications.service";

export class GatewayService {
  async getWorkspaceSnapshot(mode?: "bootstrap" | "full") {
    return fetchAuthorizedSnapshot(mode === "bootstrap" ? "bootstrap" : undefined);
  }

  async dispatch(
    action: string,
    payload: Record<string, unknown>
  ): Promise<DomainCommandResult> {
    if (isIamAction(action)) {
      return iamService.execute(action, payload);
    }
    if (isClaimsAction(action)) {
      return claimsService.execute(action, payload);
    }
    if (isFinanceCommand(action, payload)) {
      return financeService.execute(action, payload);
    }
    if (isMasterDataCommand(action, payload)) {
      return masterDataService.execute(action, payload);
    }
    if (isNotificationAction(action)) {
      return notificationsService.execute(action, payload);
    }
    return executeRpcCommand(action, payload);
  }
}

export const gatewayService = new GatewayService();
