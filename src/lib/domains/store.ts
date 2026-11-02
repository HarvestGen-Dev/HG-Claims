import type {
  Profile,
  Claim,
  Ministry,
  ExpenseCategory,
  CostCentre,
  ApprovalRule,
  Notification,
  SystemSetting,
  AuditLog,
  SignupInvitation,
} from "@/lib/types/database";

export interface WorkspaceState {
  user_id: string;
  profiles: Profile[];
  claims: Claim[];
  ministries: Ministry[];
  categories: ExpenseCategory[];
  costCentres: CostCentre[];
  approvalRules: ApprovalRule[];
  notifications: Notification[];
  systemSettings: SystemSetting[];
  auditLogs: AuditLog[];
  signupInvitations: SignupInvitation[];
}

export const createEmptyWorkspaceState = (): WorkspaceState => ({
  user_id: "",
  profiles: [],
  claims: [],
  ministries: [],
  categories: [],
  costCentres: [],
  approvalRules: [],
  notifications: [],
  systemSettings: [],
  auditLogs: [],
  signupInvitations: [],
});

export class WorkspaceStore {
  private data: WorkspaceState = createEmptyWorkspaceState();
  private listeners = new Set<() => void>();
  private version = 0;
  private lastRefreshedAt = 0;
  private inflightRefresh: Promise<Profile> | null = null;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getState(): WorkspaceState {
    return this.data;
  }

  getVersion(): number {
    return this.version;
  }

  clear() {
    this.data = createEmptyWorkspaceState();
    this.version++;
    this.lastRefreshedAt = 0;
    this.inflightRefresh = null;
    this.notify();
  }

  private notify() {
    this.listeners.forEach(listener => listener());
  }

  patchState(partial: Partial<WorkspaceState> & Record<string, unknown>) {
    if (!partial || typeof partial !== "object") return;
    this.data = {
      ...this.data,
      ...(typeof partial.user_id === "string"
        ? { user_id: partial.user_id }
        : {}),
      ...(Array.isArray(partial.profiles)
        ? { profiles: partial.profiles }
        : {}),
      ...(Array.isArray(partial.claims) ? { claims: partial.claims } : {}),
      ...(Array.isArray(partial.ministries)
        ? { ministries: partial.ministries }
        : {}),
      ...(Array.isArray(partial.categories)
        ? { categories: partial.categories }
        : {}),
      ...(Array.isArray(partial.costCentres)
        ? { costCentres: partial.costCentres }
        : {}),
      ...(Array.isArray(partial.approvalRules)
        ? { approvalRules: partial.approvalRules }
        : {}),
      ...(Array.isArray(partial.notifications)
        ? { notifications: partial.notifications }
        : {}),
      ...(Array.isArray(partial.systemSettings)
        ? { systemSettings: partial.systemSettings }
        : {}),
      ...(Array.isArray(partial.auditLogs)
        ? { auditLogs: partial.auditLogs }
        : {}),
      ...(Array.isArray(partial.signupInvitations)
        ? { signupInvitations: partial.signupInvitations }
        : {}),
    };
    this.version++;
    this.notify();
  }

  async refreshIfStale(maxAgeMs = 15000): Promise<Profile> {
    if (
      this.lastRefreshedAt > 0 &&
      Date.now() - this.lastRefreshedAt < maxAgeMs &&
      this.data.user_id
    ) {
      const cached = this.data.profiles.find(p => p.id === this.data.user_id);
      if (cached) return cached;
    }
    return this.refresh();
  }

  async refresh(): Promise<Profile> {
    if (this.inflightRefresh) {
      return this.inflightRefresh;
    }
    this.inflightRefresh = (async () => {
      try {
        const response = await fetch("/api/workspace", { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "Unable to load the workspace.");
        }
        this.data = {
          ...createEmptyWorkspaceState(),
          ...(data && typeof data === "object" ? data : {}),
          profiles: Array.isArray(data?.profiles) ? data.profiles : [],
          claims: Array.isArray(data?.claims) ? data.claims : [],
          ministries: Array.isArray(data?.ministries) ? data.ministries : [],
          categories: Array.isArray(data?.categories) ? data.categories : [],
          costCentres: Array.isArray(data?.costCentres)
            ? data.costCentres
            : [],
          approvalRules: Array.isArray(data?.approvalRules)
            ? data.approvalRules
            : [],
          notifications: Array.isArray(data?.notifications)
            ? data.notifications
            : [],
          systemSettings: Array.isArray(data?.systemSettings)
            ? data.systemSettings
            : [],
          auditLogs: Array.isArray(data?.auditLogs) ? data.auditLogs : [],
          signupInvitations: Array.isArray(data?.signupInvitations)
            ? data.signupInvitations
            : [],
        };
        this.version++;
        this.lastRefreshedAt = Date.now();
        this.notify();
        return this.data.profiles.find(p => p.id === data.user_id)!;
      } finally {
        this.inflightRefresh = null;
      }
    })();
    return this.inflightRefresh;
  }

  async refreshDomain(endpoint: string): Promise<void> {
    const response = await fetch(endpoint, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Unable to refresh domain state.");
    }
    this.patchState(data);
  }

  async dispatchDomainCommand(
    endpoint: string,
    action: string,
    payload: Record<string, unknown>,
    options?: { skipRefresh?: boolean }
  ) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, payload }),
    });
    const data = await response.json();
    if (!response.ok) {
      if (response.status === 409) {
        await this.refreshDomain(endpoint);
      }
      throw new Error(data.error || "Unable to save changes.");
    }
    if (!options?.skipRefresh) {
      await this.refreshDomain(endpoint);
    }
    return data;
  }
}

export const workspaceStore = new WorkspaceStore();
