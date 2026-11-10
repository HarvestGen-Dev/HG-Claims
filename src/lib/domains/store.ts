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
  ReimbursementBatch,
  ManagedClaimValue,
  RecurringPayment,
} from "@/lib/types/database";

export type WorkspaceDomainScope =
  | "iam"
  | "master-data"
  | "claims"
  | "finance"
  | "notifications";

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
  reimbursementBatches: ReimbursementBatch[];
  managedClaimValues: ManagedClaimValue[];
  recurringPayments: RecurringPayment[];
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
  reimbursementBatches: [],
  managedClaimValues: [],
  recurringPayments: [],
});

const createInitialDomainVersions = (): Record<WorkspaceDomainScope, number> => ({
  iam: 0,
  "master-data": 0,
  claims: 0,
  finance: 0,
  notifications: 0,
});

function normalizeDomainEndpoint(endpoint: string): string {
  if (endpoint.startsWith("/")) return endpoint;
  return `/api/v1/${endpoint}`;
}

function detectChangedDomains(
  prev: WorkspaceState,
  partial: Partial<WorkspaceState> & Record<string, unknown>
): Set<WorkspaceDomainScope> {
  const changed = new Set<WorkspaceDomainScope>();
  if (partial.managedClaimValues) changed.add("master-data");
  if (partial.recurringPayments) changed.add("finance");
  if (
    (typeof partial.user_id === "string" && partial.user_id !== prev.user_id) ||
    (Array.isArray(partial.profiles) && partial.profiles !== prev.profiles) ||
    (Array.isArray(partial.signupInvitations) &&
      partial.signupInvitations !== prev.signupInvitations)
  ) {
    changed.add("iam");
  }
  if (
    (Array.isArray(partial.ministries) &&
      partial.ministries !== prev.ministries) ||
    (Array.isArray(partial.categories) &&
      partial.categories !== prev.categories) ||
    (Array.isArray(partial.costCentres) &&
      partial.costCentres !== prev.costCentres) ||
    (Array.isArray(partial.systemSettings) &&
      partial.systemSettings !== prev.systemSettings)
  ) {
    changed.add("master-data");
  }
  if (Array.isArray(partial.claims) && partial.claims !== prev.claims) {
    changed.add("claims");
    changed.add("finance");
  }
  if (
    (Array.isArray(partial.approvalRules) &&
      partial.approvalRules !== prev.approvalRules) ||
    (Array.isArray(partial.reimbursementBatches) &&
      partial.reimbursementBatches !== prev.reimbursementBatches)
  ) {
    changed.add("finance");
  }
  if (
    (Array.isArray(partial.notifications) &&
      partial.notifications !== prev.notifications) ||
    (Array.isArray(partial.auditLogs) && partial.auditLogs !== prev.auditLogs)
  ) {
    changed.add("notifications");
  }
  return changed;
}

export class WorkspaceStore {
  private data: WorkspaceState = createEmptyWorkspaceState();
  private listeners = new Set<() => void>();
  private scopedListeners = new Set<{
    domains: Set<WorkspaceDomainScope>;
    listener: () => void;
  }>();
  private version = 0;
  private domainVersions: Record<WorkspaceDomainScope, number> =
    createInitialDomainVersions();
  private lastRefreshedAt = 0;
  private clearGeneration = 0;
  private inflightRefresh: Promise<Profile> | null = null;
  private inflightDomainRefreshes = new Map<string, Promise<void>>();
  private domainAppliedSeq = new Map<string, number>();
  private domainNextSeq = new Map<string, number>();
  private externalClearCallbacks = new Set<() => void>();

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /**
   * Subscribe only to specific data domains so unrelated updates (e.g. marking a
   * notification read) do not trigger claim list recalculations or component rerenders.
   */
  subscribeDomains = (
    domains: WorkspaceDomainScope[],
    listener: () => void
  ) => {
    const entry = { domains: new Set(domains), listener };
    this.scopedListeners.add(entry);
    return () => {
      this.scopedListeners.delete(entry);
    };
  };

  /**
   * Subscribe with a selector and equality function; invokes listener only when
   * the selected slice actually changes.
   */
  subscribeSelector = <T>(
    selector: (state: WorkspaceState) => T,
    listener: (next: T) => void,
    isEqual: (a: T, b: T) => boolean = Object.is
  ) => {
    let currentSlice = selector(this.data);
    const wrapped = () => {
      const nextSlice = selector(this.data);
      if (!isEqual(currentSlice, nextSlice)) {
        currentSlice = nextSlice;
        listener(nextSlice);
      }
    };
    this.listeners.add(wrapped);
    return () => {
      this.listeners.delete(wrapped);
    };
  };

  onClear = (callback: () => void) => {
    this.externalClearCallbacks.add(callback);
    return () => {
      this.externalClearCallbacks.delete(callback);
    };
  };

  getState(): WorkspaceState {
    return this.data;
  }

  getVersion(): number {
    return this.version;
  }

  getDomainVersion(domain: WorkspaceDomainScope): number {
    return this.domainVersions[domain];
  }

  getCompositeVersion(...domains: WorkspaceDomainScope[]): string {
    return domains.map((d) => `${d}:${this.domainVersions[d]}`).join("|");
  }

  clear() {
    this.clearGeneration++;
    this.data = createEmptyWorkspaceState();
    this.version++;
    this.domainVersions = {
      iam: this.domainVersions.iam + 1,
      "master-data": this.domainVersions["master-data"] + 1,
      claims: this.domainVersions.claims + 1,
      finance: this.domainVersions.finance + 1,
      notifications: this.domainVersions.notifications + 1,
    };
    this.lastRefreshedAt = 0;
    this.inflightRefresh = null;
    this.inflightDomainRefreshes.clear();
    this.domainAppliedSeq.clear();
    this.domainNextSeq.clear();
    this.externalClearCallbacks.forEach((cb) => cb());
    this.notify(
      new Set<WorkspaceDomainScope>([
        "iam",
        "master-data",
        "claims",
        "finance",
        "notifications",
      ])
    );
  }

  private notify(changedDomains?: Set<WorkspaceDomainScope>) {
    this.listeners.forEach((listener) => listener());
    if (!changedDomains || changedDomains.size === 0) return;
    this.scopedListeners.forEach((entry) => {
      for (const domain of Array.from(changedDomains)) {
        if (entry.domains.has(domain)) {
          entry.listener();
          break;
        }
      }
    });
  }

  patchState(partial: Partial<WorkspaceState>) {
    if (!partial || typeof partial !== "object") return;
    const changedDomains = detectChangedDomains(this.data, partial);
    this.data = {
      ...this.data,
      ...(typeof partial.user_id === "string"
        ? { user_id: partial.user_id }
        : {}),
      ...(Array.isArray(partial.managedClaimValues) ? { managedClaimValues: partial.managedClaimValues } : {}),
      ...(Array.isArray(partial.recurringPayments) ? { recurringPayments: partial.recurringPayments } : {}),
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
      ...(Array.isArray(partial.reimbursementBatches)
        ? { reimbursementBatches: partial.reimbursementBatches }
        : {}),
    };
    this.version++;
    for (const domain of Array.from(changedDomains)) {
      this.domainVersions[domain]++;
    }
    this.notify(changedDomains);
  }

  /**
   * Upserts a single claim (e.g. after on-demand detail fetch) while preserving
   * object references for all other claims in the store.
   */
  upsertClaim(claim: Claim) {
    if (!claim || !claim.id) return;
    const existingIdx = this.data.claims.findIndex((c) => c.id === claim.id);
    let nextClaims: Claim[];
    if (existingIdx === -1) {
      nextClaims = [claim, ...this.data.claims];
    } else {
      nextClaims = [...this.data.claims];
      nextClaims[existingIdx] = {
        ...nextClaims[existingIdx],
        ...claim,
      };
    }
    this.patchState({ claims: nextClaims });
  }

  async refreshIfStale(maxAgeMs = 15000, hintUserId?: string): Promise<Profile> {
    if (
      this.lastRefreshedAt > 0 &&
      Date.now() - this.lastRefreshedAt < maxAgeMs &&
      this.data.user_id
    ) {
      const cached = this.data.profiles.find((p) => p.id === this.data.user_id);
      if (cached) return cached;
    }
    return this.refresh(hintUserId);
  }

  async refresh(hintUserId?: string): Promise<Profile> {
    if (this.inflightRefresh) {
      return this.inflightRefresh;
    }
    const genAtStart = this.clearGeneration;
    this.inflightRefresh = (async () => {
      try {
        const response = await fetch("/api/workspace", { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "Unable to load the workspace.");
        }
        // Guard against stale refresh resolving after logout / clear()
        if (this.clearGeneration !== genAtStart) {
          const effectiveUserId = data?.user_id || hintUserId;
          return (
            (Array.isArray(data?.profiles)
              ? data.profiles.find((p: Profile) => p.id === effectiveUserId)
              : undefined) as Profile
          );
        }
        const prevUserId = this.data.user_id;
        if (prevUserId && data?.user_id && prevUserId !== data.user_id) {
          this.externalClearCallbacks.forEach((cb) => cb());
        }
        this.data = {
          ...createEmptyWorkspaceState(),
          ...(data && typeof data === "object" ? data : {}),
          user_id: data?.user_id || hintUserId || this.data.user_id || "",
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
          reimbursementBatches: Array.isArray(data?.reimbursementBatches)
            ? data.reimbursementBatches
            : [],
        };
        this.version++;
        this.domainVersions = {
          iam: this.domainVersions.iam + 1,
          "master-data": this.domainVersions["master-data"] + 1,
          claims: this.domainVersions.claims + 1,
          finance: this.domainVersions.finance + 1,
          notifications: this.domainVersions.notifications + 1,
        };
        this.lastRefreshedAt = Date.now();
        this.notify(
          new Set<WorkspaceDomainScope>([
            "iam",
            "master-data",
            "claims",
            "finance",
            "notifications",
          ])
        );
        const targetUserId =
          this.data.user_id ||
          (typeof hintUserId === "string" && hintUserId ? hintUserId : "") ||
          (typeof data?.user_id === "string" ? data.user_id : "");

        let currentUser = this.data.profiles.find((p) => p.id === targetUserId);
        if (!currentUser && hintUserId) {
          currentUser = this.data.profiles.find((p) => p.id === hintUserId);
        }
        if (!currentUser && this.data.profiles.length === 1) {
          currentUser = this.data.profiles[0];
        }
        if (!currentUser) {
          throw new Error("Your user profile could not be found.");
        }
        if (!this.data.user_id && currentUser.id) {
          this.data.user_id = currentUser.id;
        }
        return currentUser;
      } finally {
        if (this.clearGeneration === genAtStart) {
          this.inflightRefresh = null;
        }
      }
    })();
    return this.inflightRefresh;
  }

  refreshDomain(
    endpoint: string,
    options?: { forceFresh?: boolean }
  ): Promise<void> {
    const normalizedEndpoint = normalizeDomainEndpoint(endpoint);
    if (!options?.forceFresh) {
      const existingInflight =
        this.inflightDomainRefreshes.get(normalizedEndpoint);
      if (existingInflight) {
        return existingInflight;
      }
    }

    const genAtStart = this.clearGeneration;
    const seq = (this.domainNextSeq.get(normalizedEndpoint) ?? 0) + 1;
    this.domainNextSeq.set(normalizedEndpoint, seq);

    const requestPromise: Promise<void> = (async () => {
      const response = await fetch(normalizedEndpoint, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Unable to refresh domain state.");
      }
      // Out-of-order / post-logout stale response protection:
      // Never overwrite state if clear() happened or a newer request already applied.
      if (this.clearGeneration !== genAtStart) {
        return;
      }
      const appliedSeq = this.domainAppliedSeq.get(normalizedEndpoint) ?? 0;
      if (seq < appliedSeq) {
        return;
      }
      this.domainAppliedSeq.set(normalizedEndpoint, seq);
      this.patchState(data);
    })().finally(() => {
      if (
        this.inflightDomainRefreshes.get(normalizedEndpoint) === requestPromise
      ) {
        this.inflightDomainRefreshes.delete(normalizedEndpoint);
      }
    });

    this.inflightDomainRefreshes.set(normalizedEndpoint, requestPromise);
    return requestPromise;
  }

  async dispatchDomainCommand(
    endpoint: string,
    action: string,
    payload: Record<string, unknown>,
    options?: { skipRefresh?: boolean }
  ) {
    const normalizedEndpoint = normalizeDomainEndpoint(endpoint);
    const response = await fetch(normalizedEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, payload }),
    });
    const data = await response.json();
    if (!response.ok) {
      if (response.status === 409) {
        await this.refreshDomain(normalizedEndpoint, { forceFresh: true });
      }
      throw new Error(data.error || "Unable to save changes.");
    }
    if (!options?.skipRefresh) {
      await this.refreshDomain(normalizedEndpoint, { forceFresh: true });
    }
    return data;
  }
}

export const workspaceStore = new WorkspaceStore();
