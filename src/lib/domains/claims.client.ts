import type {
  Claim,
  ClaimAttachment,
  ClaimStatus,
  Profile,
} from "@/lib/types/database";
import { workspaceStore } from "./store";
import { iamClient } from "./iam.client";
import { masterDataClient } from "./master-data.client";

const CLAIMS_ENDPOINT = "/api/v1/claims";

export interface ClientClaimsQueryParams {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: ClaimStatus | "ALL" | "PENDING";
  ministryId?: string;
  startDate?: string;
  endDate?: string;
  sortField?:
    | "created_at"
    | "submitted_at"
    | "claim_date"
    | "total_amount"
    | "status"
    | "claim_number";
  sortDir?: "asc" | "desc";
}

export interface PaginatedClaimsResult {
  items: Claim[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const PENDING_STATUSES = new Set<ClaimStatus>([
  "SUBMITTED",
  "PENDING_MINISTRY_APPROVAL",
  "PENDING_FINANCE_REVIEW",
  "PENDING_FINAL_APPROVAL",
]);

export class ClaimsClient {
  private cachedSources: Pick<
    ReturnType<typeof workspaceStore.getState>,
    "claims" | "profiles" | "ministries" | "categories" | "costCentres"
  > | null = null;
  private cachedRelationalSources: Pick<
    ReturnType<typeof workspaceStore.getState>,
    "profiles" | "ministries" | "categories" | "costCentres"
  > | null = null;
  private cachedClaims: Claim[] = [];
  private hydratedById = new Map<string, { raw: Claim; hydrated: Claim }>();
  private inflightDetailRequests = new Map<string, Promise<Claim | null>>();
  private inflightListRequests = new Map<string, Promise<PaginatedClaimsResult>>();

  constructor() {
    workspaceStore.onClear(() => {
      this.cachedSources = null;
      this.cachedRelationalSources = null;
      this.cachedClaims = [];
      this.hydratedById.clear();
      this.inflightDetailRequests.clear();
      this.inflightListRequests.clear();
    });
  }

  private hydrateSingleClaim(c: Claim): Claim {
    const profile = (id?: string | null) =>
      id ? iamClient.getProfileById(id) : undefined;
    const ministry = masterDataClient.getMinistryById(c.ministry_id);
    const costCentre = masterDataClient.getCostCentreById(
      c.cost_centre_id || ""
    );

    const attachmentsByExpense = new Map<string, ClaimAttachment[]>();
    for (const attachment of c.attachments || []) {
      if (!attachment.expense_id) continue;
      const group = attachmentsByExpense.get(attachment.expense_id);
      if (group) {
        group.push(attachment);
      } else {
        attachmentsByExpense.set(attachment.expense_id, [attachment]);
      }
    }

    let disbursementVoucher = c.disbursement_voucher;
    let batchNumber = c.batch_number;
    let disbursementLineOrder = c.disbursement_line_order;
    if (!disbursementVoucher) {
      const batches = workspaceStore.getState().reimbursementBatches || [];
      for (const b of batches) {
        const inst = b.instructions?.find((i) =>
          (c.active_instruction_id && i.id === c.active_instruction_id) ||
          i.claims?.some((ic) => ic.claim_id === c.id)
        );
        if (inst) {
          disbursementVoucher = inst.payment_description;
          batchNumber = b.batch_number;
          disbursementLineOrder = inst.line_order;
          break;
        }
      }
    }
    if (!disbursementVoucher && c.payment) {
      const match = (c.payment.payment_reference || c.payment.notes || "").match(/P\d{6}/);
      if (match) {
        disbursementVoucher = match[0];
      }
    }

    return {
      ...c,
      disbursement_voucher: disbursementVoucher || null,
      batch_number: batchNumber || null,
      disbursement_line_order: disbursementLineOrder || null,
      claimant: profile(c.claimant_id),
      submitted_by: profile(c.submitted_by_user_id || c.claimant_id),
      ministry,
      cost_centre: costCentre,
      returned_by_user: c.returned_by ? profile(c.returned_by) : null,
      expenses: (c.expenses || []).map((e) => ({
        ...e,
        expense_category: masterDataClient.getCategoryById(
          e.expense_category_id || ""
        ),
        cost_centre: masterDataClient.getCostCentreById(
          e.cost_centre_id || ""
        ),
        attachments: e.attachments?.length
          ? e.attachments
          : attachmentsByExpense.get(e.id) || [],
      })),
      workflow_steps: (c.workflow_steps || []).map((s) => ({
        ...s,
        assigned_user: profile(s.assigned_user_id),
        completed_by_user: profile(s.completed_by),
      })),
      approval_actions: (c.approval_actions || []).map((a) => ({
        ...a,
        actor: profile(a.actor_id),
      })),
      comments: (c.comments || []).map((comment) => ({
        ...comment,
        author: profile(comment.author_id),
      })),
      finance_review: c.finance_review
        ? {
            ...c.finance_review,
            reviewer: profile(c.finance_review.reviewer_id),
          }
        : null,
      payment: c.payment
        ? {
            ...c.payment,
            processor: profile(c.payment.processed_by),
          }
        : null,
    };
  }

  getClaims(_user?: Profile): Claim[] {
    void _user;
    const state = workspaceStore.getState();
    if (
      this.cachedSources &&
      this.cachedSources.claims === state.claims &&
      this.cachedSources.profiles === state.profiles &&
      this.cachedSources.ministries === state.ministries &&
      this.cachedSources.categories === state.categories &&
      this.cachedSources.costCentres === state.costCentres
    ) {
      return this.cachedClaims;
    }

    const relationalUnchanged =
      this.cachedRelationalSources &&
      this.cachedRelationalSources.profiles === state.profiles &&
      this.cachedRelationalSources.ministries === state.ministries &&
      this.cachedRelationalSources.categories === state.categories &&
      this.cachedRelationalSources.costCentres === state.costCentres;

    if (!relationalUnchanged) {
      this.hydratedById.clear();
    }

    const rawClaims = state.claims || [];
    const nextHydratedMap = new Map<string, { raw: Claim; hydrated: Claim }>();
    const nextList: Claim[] = new Array(rawClaims.length);

    for (let i = 0; i < rawClaims.length; i++) {
      const raw = rawClaims[i];
      const existing = this.hydratedById.get(raw.id);
      if (existing && existing.raw === raw) {
        nextList[i] = existing.hydrated;
        nextHydratedMap.set(raw.id, existing);
      } else {
        const hydrated = this.hydrateSingleClaim(raw);
        nextList[i] = hydrated;
        nextHydratedMap.set(raw.id, { raw, hydrated });
      }
    }

    this.hydratedById = nextHydratedMap;
    this.cachedClaims = nextList;
    this.cachedSources = state;
    this.cachedRelationalSources = state;
    return this.cachedClaims;
  }

  getClaimById(id: string): Claim | null {
    if (!id) return null;
    this.getClaims();
    return this.hydratedById.get(id)?.hydrated || null;
  }

  /**
   * Fetches full claim details (with expenses, attachments, workflow steps,
   * approval actions, and comments) on demand when opening a specific claim,
   * deduplicating concurrent requests for the same claim ID.
   */
  fetchClaimDetail(
    id: string,
    options?: { force?: boolean }
  ): Promise<Claim | null> {
    if (!id) return Promise.resolve(null);

    const inflight = this.inflightDetailRequests.get(id);
    if (inflight && !options?.force) {
      return inflight;
    }

    if (!options?.force) {
      const rawClaim = workspaceStore
        .getState()
        .claims.find((c) => c.id === id);
      if (
        rawClaim &&
        Array.isArray(rawClaim.expenses) &&
        Array.isArray(rawClaim.workflow_steps) &&
        Array.isArray(rawClaim.comments) &&
        Array.isArray(rawClaim.approval_actions)
      ) {
        return Promise.resolve(this.getClaimById(id));
      }
    }

    const promise: Promise<Claim | null> = (async () => {
      try {
        const response = await fetch(
          `${CLAIMS_ENDPOINT}?id=${encodeURIComponent(id)}`,
          { cache: "no-store" }
        );
        if (!response.ok) {
          return this.getClaimById(id);
        }
        const data = await response.json();
        if (data?.claim && data.claim.id) {
          workspaceStore.upsertClaim(data.claim as Claim);
          return this.getClaimById(id);
        }
        return this.getClaimById(id);
      } catch {
        return this.getClaimById(id);
      }
    })().finally(() => {
      if (this.inflightDetailRequests.get(id) === promise) {
        this.inflightDetailRequests.delete(id);
      }
    });

    this.inflightDetailRequests.set(id, promise);
    return promise;
  }

  /**
   * Synchronous filtering, sorting, and pagination over authorized claims.
   */
  queryClaimsSync(
    params: ClientClaimsQueryParams,
    sourceClaims?: Claim[]
  ): PaginatedClaimsResult {
    const allClaims = sourceClaims ?? this.getClaims();
    const page = Math.max(1, Math.floor(params.page || 1));
    const pageSize = Math.min(
      100,
      Math.max(1, Math.floor(params.pageSize || 25))
    );
    const search = (params.search || "").trim().toLowerCase();
    const statusFilter =
      params.status && params.status !== "ALL" ? params.status : "";
    const ministryFilter =
      params.ministryId && params.ministryId !== "ALL"
        ? params.ministryId
        : "";
    const startDate = (params.startDate || "").trim();
    const endDate = (params.endDate || "").trim();
    const sortField = params.sortField || "created_at";
    const sortDir = params.sortDir === "asc" ? "asc" : "desc";

    const filtered = allClaims.filter((c) => {
      if (ministryFilter && c.ministry_id !== ministryFilter) return false;
      if (statusFilter) {
        if (statusFilter === "PENDING") {
          if (!PENDING_STATUSES.has(c.status)) return false;
        } else if (c.status !== statusFilter) {
          return false;
        }
      }
      if (startDate && c.claim_date < startDate) return false;
      if (endDate && c.claim_date > endDate) return false;
      if (search) {
        const numMatch = (c.claim_number || "").toLowerCase().includes(search);
        const purpMatch = (c.purpose || "").toLowerCase().includes(search);
        const nameMatch = (c.claimant_name || c.claimant?.full_name || "")
          .toLowerCase()
          .includes(search);
        const emailMatch = (c.claimant_email || c.claimant?.email || "")
          .toLowerCase()
          .includes(search);
        const minMatch = (c.ministry?.name || "").toLowerCase().includes(search);
        if (!numMatch && !purpMatch && !nameMatch && !emailMatch && !minMatch) {
          return false;
        }
      }
      return true;
    });

    filtered.sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      if (sortField === "total_amount") {
        return (
          ((Number(a.total_amount) || 0) - (Number(b.total_amount) || 0)) * dir
        );
      }
      if (sortField === "claim_date") {
        return (a.claim_date || "").localeCompare(b.claim_date || "") * dir;
      }
      if (sortField === "submitted_at") {
        const da = a.submitted_at || a.created_at || "";
        const db = b.submitted_at || b.created_at || "";
        return da.localeCompare(db) * dir;
      }
      if (sortField === "status") {
        return (a.status || "").localeCompare(b.status || "") * dir;
      }
      if (sortField === "claim_number") {
        return (a.claim_number || "").localeCompare(b.claim_number || "") * dir;
      }
      return (a.created_at || "").localeCompare(b.created_at || "") * dir;
    });

    const totalCount = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    const safePage = Math.min(page, totalPages);
    const offset = (safePage - 1) * pageSize;

    return {
      items: filtered.slice(offset, offset + pageSize),
      totalCount,
      page: safePage,
      pageSize,
      totalPages,
    };
  }

  /**
   * Server-backed paginated/filtered claim query with in-flight request deduplication.
   */
  async queryClaimsPage(
    params: ClientClaimsQueryParams
  ): Promise<PaginatedClaimsResult> {
    const query = new URLSearchParams();
    query.set("page", String(Math.max(1, Math.floor(params.page || 1))));
    query.set(
      "page_size",
      String(Math.min(100, Math.max(1, Math.floor(params.pageSize || 25))))
    );
    if (params.search?.trim()) query.set("search", params.search.trim());
    if (params.status && params.status !== "ALL")
      query.set("status", params.status);
    if (params.ministryId && params.ministryId !== "ALL")
      query.set("ministry_id", params.ministryId);
    if (params.startDate?.trim())
      query.set("start_date", params.startDate.trim());
    if (params.endDate?.trim()) query.set("end_date", params.endDate.trim());
    if (params.sortField) query.set("sort_field", params.sortField);
    if (params.sortDir) query.set("sort_dir", params.sortDir);

    const key = query.toString();
    const existing = this.inflightListRequests.get(key);
    if (existing) return existing;

    const promise: Promise<PaginatedClaimsResult> = (async () => {
      try {
        const response = await fetch(`${CLAIMS_ENDPOINT}?${key}`, {
          cache: "no-store",
        });
        if (!response.ok) {
          return this.queryClaimsSync(params);
        }
        const data = await response.json();
        if (Array.isArray(data?.items)) {
          const items = (data.items as Claim[]).map((c) =>
            this.hydrateSingleClaim(c)
          );
          return {
            items,
            totalCount: Number(data.total_count ?? items.length),
            page: Number(data.page ?? 1),
            pageSize: Number(data.page_size ?? 25),
            totalPages: Number(data.total_pages ?? 1),
          };
        }
        return this.queryClaimsSync(params);
      } catch {
        return this.queryClaimsSync(params);
      }
    })().finally(() => {
      if (this.inflightListRequests.get(key) === promise) {
        this.inflightListRequests.delete(key);
      }
    });

    this.inflightListRequests.set(key, promise);
    return promise;
  }

  async saveClaimDraft(payload: Record<string, unknown>): Promise<Claim> {
    const result = await workspaceStore.dispatchDomainCommand(
      CLAIMS_ENDPOINT,
      "save_draft",
      payload
    );
    return this.getClaimById(result.id)!;
  }

  async submitClaim(payload: Record<string, unknown>): Promise<Claim> {
    const result = await workspaceStore.dispatchDomainCommand(
      CLAIMS_ENDPOINT,
      "submit_claim",
      payload
    );
    return this.getClaimById(result.id)!;
  }

  async deleteClaim(id: string) {
    return workspaceStore.dispatchDomainCommand(
      CLAIMS_ENDPOINT,
      "delete_claim",
      { id }
    );
  }

  async addComment(
    id: string,
    _author: Profile,
    content: string,
    visibility: string
  ): Promise<Claim> {
    const result = await workspaceStore.dispatchDomainCommand(
      CLAIMS_ENDPOINT,
      "comment",
      {
        claim_id: id,
        version: this.getClaimById(id)?.version,
        content,
        visibility,
      }
    );
    return this.getClaimById(result.id)!;
  }
}

export const claimsClient = new ClaimsClient();
