import type {
  Ministry,
  ExpenseCategory,
  CostCentre,
  SystemSetting,
} from "@/lib/types/database";
import { workspaceStore } from "./store";
import { iamClient } from "./iam.client";

const MASTER_DATA_ENDPOINT = "/api/v1/master-data";

export class MasterDataClient {
  private cachedMinistriesVersion = -1;
  private cachedMinistries: Ministry[] = [];
  private cachedCategoriesVersion = -1;
  private cachedCategories: ExpenseCategory[] = [];
  private cachedCostCentresVersion = -1;
  private cachedCostCentres: CostCentre[] = [];

  getMinistries(): Ministry[] {
    const currentVersion = workspaceStore.getVersion();
    if (this.cachedMinistriesVersion === currentVersion) {
      return this.cachedMinistries;
    }
    this.cachedMinistries = (workspaceStore.getState().ministries || []).map(
      m => ({
        ...m,
        leader: m.leader_id ? iamClient.getProfileById(m.leader_id) : null,
      })
    );
    this.cachedMinistriesVersion = currentVersion;
    return this.cachedMinistries;
  }

  getCategories(): ExpenseCategory[] {
    const currentVersion = workspaceStore.getVersion();
    if (this.cachedCategoriesVersion === currentVersion) {
      return this.cachedCategories;
    }
    this.cachedCategories = [
      ...(workspaceStore.getState().categories || []),
    ].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
    this.cachedCategoriesVersion = currentVersion;
    return this.cachedCategories;
  }

  getCostCentres(): CostCentre[] {
    const currentVersion = workspaceStore.getVersion();
    if (this.cachedCostCentresVersion === currentVersion) {
      return this.cachedCostCentres;
    }
    const ministries = this.getMinistries();
    this.cachedCostCentres = [
      ...(workspaceStore.getState().costCentres || []),
    ]
      .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
      .map(c => ({
        ...c,
        ministry: ministries.find(m => m.id === c.ministry_id),
      }));
    this.cachedCostCentresVersion = currentVersion;
    return this.cachedCostCentres;
  }

  getSetting(key: string) {
    return (workspaceStore.getState().systemSettings || []).find(
      setting => setting.key === key
    )?.value;
  }

  getSystemSettings(): SystemSetting[] {
    return workspaceStore.getState().systemSettings || [];
  }

  updateSettings(
    settings: { key: string; value: Record<string, unknown> }[]
  ) {
    return workspaceStore.dispatchDomainCommand(
      MASTER_DATA_ENDPOINT,
      "settings",
      { settings }
    );
  }

  updateSetting(
    key: string,
    value: Record<string, unknown>,
    _actor?: string
  ) {
    void _actor;
    return workspaceStore.dispatchDomainCommand(
      MASTER_DATA_ENDPOINT,
      "setting",
      { key, value }
    );
  }

  createMinistry(data: Partial<Ministry>) {
    return workspaceStore.dispatchDomainCommand(
      MASTER_DATA_ENDPOINT,
      "master_save",
      { table: "ministries", data }
    );
  }

  updateMinistry(id: string, data: Partial<Ministry>) {
    return workspaceStore.dispatchDomainCommand(
      MASTER_DATA_ENDPOINT,
      "master_save",
      { table: "ministries", id, data }
    );
  }

  async deleteMinistry(id: string) {
    return workspaceStore.dispatchDomainCommand(
      MASTER_DATA_ENDPOINT,
      "master_delete",
      { table: "ministries", id }
    );
  }

  createCategory(data: Partial<ExpenseCategory>) {
    return workspaceStore.dispatchDomainCommand(
      MASTER_DATA_ENDPOINT,
      "master_save",
      { table: "expense_categories", data }
    );
  }

  updateCategory(id: string, data: Partial<ExpenseCategory>) {
    return workspaceStore.dispatchDomainCommand(
      MASTER_DATA_ENDPOINT,
      "master_save",
      { table: "expense_categories", id, data }
    );
  }

  async deleteCategory(id: string) {
    return workspaceStore.dispatchDomainCommand(
      MASTER_DATA_ENDPOINT,
      "master_delete",
      { table: "expense_categories", id }
    );
  }

  createCostCentre(data: Partial<CostCentre>) {
    return workspaceStore.dispatchDomainCommand(
      MASTER_DATA_ENDPOINT,
      "master_save",
      { table: "cost_centres", data }
    );
  }

  updateCostCentre(id: string, data: Partial<CostCentre>) {
    return workspaceStore.dispatchDomainCommand(
      MASTER_DATA_ENDPOINT,
      "master_save",
      { table: "cost_centres", id, data }
    );
  }

  async deleteCostCentre(id: string) {
    return workspaceStore.dispatchDomainCommand(
      MASTER_DATA_ENDPOINT,
      "master_delete",
      { table: "cost_centres", id }
    );
  }
}

export const masterDataClient = new MasterDataClient();
