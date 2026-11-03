import { createClient } from "@/lib/supabase/server";
import {
  DomainCommandResult,
  executeRpcCommand,
  fetchAuthorizedSnapshot,
} from "@/services/shared/http";
import type { Claim } from "@/lib/types/database";

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

export interface ClaimsListQueryParams {
  page?: number;
  page_size?: number;
  search?: string;
  status?: string;
  ministry_id?: string;
  start_date?: string;
  end_date?: string;
  sort_field?: string;
  sort_dir?: "asc" | "desc";
}

const PENDING_STATUSES = new Set([
  "SUBMITTED",
  "PENDING_MINISTRY_APPROVAL",
  "PENDING_FINANCE_REVIEW",
  "PENDING_FINAL_APPROVAL",
]);

export function filterAndPaginateClaimsList(
  rawClaims: Claim[],
  params: ClaimsListQueryParams
) {
  const page = Math.max(1, Math.floor(Number(params.page) || 1));
  const pageSize = Math.min(100, Math.max(1, Math.floor(Number(params.page_size) || 25)));
  const search = (params.search || "").trim().toLowerCase();
  const statusFilter =
    params.status && params.status !== "ALL" ? params.status.trim() : "";
  const ministryFilter =
    params.ministry_id && params.ministry_id !== "ALL"
      ? params.ministry_id.trim()
      : "";
  const startDate = (params.start_date || "").trim();
  const endDate = (params.end_date || "").trim();
  const sortField = params.sort_field || "created_at";
  const sortDir = params.sort_dir === "asc" ? "asc" : "desc";

  let totalAmountCents = 0;
  let pendingCount = 0;
  let pendingCents = 0;
  let approvedCount = 0;
  let approvedCents = 0;
  let paidCount = 0;
  let paidCents = 0;
  let returnedCount = 0;
  let rejectedCount = 0;
  let draftCount = 0;

  for (const c of rawClaims) {
    const cents = Math.round((Number(c.total_amount) || 0) * 100);
    totalAmountCents += cents;
    if (PENDING_STATUSES.has(c.status)) {
      pendingCount++;
      pendingCents += cents;
    } else if (c.status === "APPROVED" || c.status === "APPROVED_FOR_PAYMENT") {
      approvedCount++;
      approvedCents += cents;
    } else if (c.status === "PAID") {
      paidCount++;
      paidCents += cents;
    } else if (c.status === "RETURNED_FOR_CLARIFICATION") {
      returnedCount++;
    } else if (c.status === "REJECTED") {
      rejectedCount++;
    } else if (c.status === "DRAFT") {
      draftCount++;
    }
  }

  const filtered = rawClaims.filter((c) => {
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
      return ((Number(a.total_amount) || 0) - (Number(b.total_amount) || 0)) * dir;
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
  const pagedSlice = filtered.slice(offset, offset + pageSize);

  // Strip heavy comment/action histories from list payloads
  const items = pagedSlice.map((c) => {
    const {
      comments: _comments,
      approval_actions: _actions,
      ...rest
    } = c as Claim & {
      expense_count?: number;
      attachment_count?: number;
    };
    void _comments;
    void _actions;
    return {
      ...rest,
      expense_count:
        typeof rest.expense_count === "number"
          ? rest.expense_count
          : Array.isArray(c.expenses)
          ? c.expenses.length
          : 0,
      attachment_count:
        typeof rest.attachment_count === "number"
          ? rest.attachment_count
          : Array.isArray(c.attachments)
          ? c.attachments.length
          : 0,
    };
  });

  return {
    items,
    total_count: totalCount,
    page: safePage,
    page_size: pageSize,
    total_pages: totalPages,
    summary: {
      total_claims: rawClaims.length,
      total_amount: Number((totalAmountCents / 100).toFixed(2)),
      pending_count: pendingCount,
      pending_amount: Number((pendingCents / 100).toFixed(2)),
      approved_count: approvedCount,
      approved_amount: Number((approvedCents / 100).toFixed(2)),
      paid_count: paidCount,
      paid_amount: Number((paidCents / 100).toFixed(2)),
      returned_count: returnedCount,
      rejected_count: rejectedCount,
      draft_count: draftCount,
    },
  };
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

  async getClaimDetail(claimId: string): Promise<DomainCommandResult> {
    if (!claimId || typeof claimId !== "string") {
      return { error: "Claim ID is required.", status: 400 };
    }
    try {
      const client = await createClient();
      const {
        data: { user },
        error: authError,
      } = await client.auth.getUser();
      if (authError || !user) {
        return { error: "Sign in to continue.", status: 401 };
      }

      const { data, error } = await client.rpc("nlcc_claim_detail", {
        p_claim_id: claimId,
      });

      if (!error && data) {
        return {
          status: 200,
          data: (data as Record<string, unknown>) ?? {},
        };
      }

      // Fallback if older database deployment does not yet have nlcc_claim_detail
      if (error && ["42883", "PGRST202"].includes(error.code)) {
        const snapshot = await fetchAuthorizedSnapshot("claims");
        if (snapshot.error || !snapshot.data) return snapshot;
        const claims = (snapshot.data.claims as Claim[]) || [];
        const found = claims.find((c) => c.id === claimId);
        if (!found) {
          return { error: "Claim not found or access denied.", status: 404 };
        }
        return {
          status: 200,
          data: { claim: found },
        };
      }

      return {
        error:
          error?.code === "42501"
            ? "Claim not accessible."
            : "Unable to load claim details.",
        status: error?.code === "42501" ? 403 : 503,
      };
    } catch {
      return {
        error: "The backend is not configured or is unavailable.",
        status: 503,
      };
    }
  }

  async queryClaims(params: ClaimsListQueryParams): Promise<DomainCommandResult> {
    try {
      const client = await createClient();
      const {
        data: { user },
        error: authError,
      } = await client.auth.getUser();
      if (authError || !user) {
        return { error: "Sign in to continue.", status: 401 };
      }

      const { data, error } = await client.rpc("nlcc_query_claims", {
        p_params: params,
      });

      if (!error && data) {
        return {
          status: 200,
          data: (data as Record<string, unknown>) ?? {},
        };
      }

      if (error && ["42883", "PGRST202"].includes(error.code)) {
        const snapshot = await fetchAuthorizedSnapshot("claims");
        if (snapshot.error || !snapshot.data) return snapshot;
        const rawClaims = (snapshot.data.claims as Claim[]) || [];
        return {
          status: 200,
          data: filterAndPaginateClaimsList(rawClaims, params),
        };
      }

      return {
        error:
          error?.code === "42501"
            ? "Your account is inactive or has not been provisioned."
            : "Unable to query claims.",
        status: error?.code === "42501" ? 403 : 503,
      };
    } catch {
      return {
        error: "The backend is not configured or is unavailable.",
        status: 503,
      };
    }
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
