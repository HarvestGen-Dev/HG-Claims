import {
  DomainCommandResult,
  executeRpcCommand,
  fetchAuthorizedSnapshot,
} from "@/services/shared/http";

export const MASTER_DATA_TABLES = [
  "ministries",
  "expense_categories",
  "cost_centres",
] as const;

export const MASTER_DATA_ACTIONS = [
  "master_save",
  "master_delete",
  "settings",
  "setting",
  "set_ministry_budget",
  "set_ministry_team_leads",
] as const;

export type MasterDataAction = (typeof MASTER_DATA_ACTIONS)[number];

export function isMasterDataCommand(
  action: string,
  payload: Record<string, unknown>
): boolean {
  if (
    action === "settings" ||
    action === "setting" ||
    action === "set_ministry_budget" ||
    action === "set_ministry_team_leads"
  ) {
    return true;
  }
  if (action === "master_save" || action === "master_delete") {
    const table = payload.table;
    return (
      typeof table !== "string" ||
      table !== "approval_rules"
    );
  }
  return false;
}

export class MasterDataService {
  async getDomainState(): Promise<DomainCommandResult> {
    const snapshot = await fetchAuthorizedSnapshot("master-data");
    if (snapshot.error || !snapshot.data) return snapshot;
    return {
      status: 200,
      data: {
        managedClaimValues: snapshot.data.managedClaimValues ?? [],
        ministries: snapshot.data.ministries ?? [],
        categories: snapshot.data.categories ?? [],
        costCentres: snapshot.data.costCentres ?? [],
        systemSettings: snapshot.data.systemSettings ?? [],
      },
    };
  }

  async execute(
    action: string,
    payload: Record<string, unknown>
  ): Promise<DomainCommandResult> {
    if (!isMasterDataCommand(action, payload)) {
      return {
        error: `Unsupported Master Data action: ${action}`,
        status: 400,
      };
    }
    return executeRpcCommand(action, payload);
  }
}

export const masterDataService = new MasterDataService();
