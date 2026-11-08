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
  private cachedMinistriesKey = "";
  private cachedMinistries: Ministry[] = [];
  private ministryByIdMap = new Map<string, Ministry>();

  private cachedCategoriesKey = "";
  private cachedCategories: ExpenseCategory[] = [];
  private categoryByIdMap = new Map<string, ExpenseCategory>();

  private cachedCostCentresKey = "";
  private cachedCostCentres: CostCentre[] = [];
  private costCentreByIdMap = new Map<string, CostCentre>();

  constructor() {
    workspaceStore.onClear(() => {
      this.cachedMinistriesKey = "";
      this.cachedMinistries = [];
      this.ministryByIdMap.clear();
      this.cachedCategoriesKey = "";
      this.cachedCategories = [];
      this.categoryByIdMap.clear();
      this.cachedCostCentresKey = "";
      this.cachedCostCentres = [];
      this.costCentreByIdMap.clear();
    });
  }

  getMinistries(): Ministry[] {
    const compositeKey = workspaceStore.getCompositeVersion("master-data", "iam");
    if (this.cachedMinistriesKey === compositeKey) {
      return this.cachedMinistries;
    }
    this.cachedMinistries = (workspaceStore.getState().ministries || []).map(
      (m) => ({
        ...m,
        leader: m.leader_id ? iamClient.getProfileById(m.leader_id) : null,
      })
    );
    this.ministryByIdMap = new Map(
      this.cachedMinistries.map((m) => [m.id, m])
    );
    this.cachedMinistriesKey = compositeKey;
    return this.cachedMinistries;
  }

  getMinistryById(id?: string | null): Ministry | undefined {
    if (!id) return undefined;
    this.getMinistries();
    return this.ministryByIdMap.get(id);
  }

  getCategories(): ExpenseCategory[] {
    const domainVer = String(workspaceStore.getDomainVersion("master-data"));
    if (this.cachedCategoriesKey === domainVer) {
      return this.cachedCategories;
    }
    this.cachedCategories = [
      ...(workspaceStore.getState().categories || []),
    ].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
    this.categoryByIdMap = new Map(
      this.cachedCategories.map((c) => [c.id, c])
    );
    this.cachedCategoriesKey = domainVer;
    return this.cachedCategories;
  }

  getCategoryById(id?: string | null): ExpenseCategory | undefined {
    if (!id) return undefined;
    this.getCategories();
    return this.categoryByIdMap.get(id);
  }

  getCostCentres(): CostCentre[] {
    const compositeKey = workspaceStore.getCompositeVersion("master-data", "iam");
    if (this.cachedCostCentresKey === compositeKey) {
      return this.cachedCostCentres;
    }
    this.getMinistries();
    this.cachedCostCentres = [
      ...(workspaceStore.getState().costCentres || []),
    ]
      .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
      .map((c) => ({
        ...c,
        ministry: c.ministry_id
          ? this.ministryByIdMap.get(c.ministry_id)
          : undefined,
      }));
    this.costCentreByIdMap = new Map(
      this.cachedCostCentres.map((c) => [c.id, c])
    );
    this.cachedCostCentresKey = compositeKey;
    return this.cachedCostCentres;
  }

  getCostCentreById(id?: string | null): CostCentre | undefined {
    if (!id) return undefined;
    this.getCostCentres();
    return this.costCentreByIdMap.get(id);
  }

  getSetting(key: string) {
    return (workspaceStore.getState().systemSettings || []).find(
      (setting) => setting.key === key
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

  async setMinistryBudget(
    ministryId: string,
    year: number,
    amount: number,
    notes?: string
  ) {
    return workspaceStore.dispatchDomainCommand(
      MASTER_DATA_ENDPOINT,
      "set_ministry_budget",
      {
        ministry_id: ministryId,
        year,
        amount,
        notes: notes || undefined,
      }
    );
  }

  async setMinistryTeamLeads(ministryId: string, userIds: string[]) {
    return workspaceStore.dispatchDomainCommand(
      MASTER_DATA_ENDPOINT,
      "set_ministry_team_leads",
      {
        ministry_id: ministryId,
        user_ids: userIds,
      }
    );
  }
}

export const masterDataClient = new MasterDataClient();
