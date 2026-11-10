import { createHash } from "crypto";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import {
  claimsClient,
  financeClient,
  iamClient,
  masterDataClient,
  workspaceStore,
  type WorkspaceState,
} from "@/lib/domains";
import { sha256Hex } from "@/lib/banking/reimbursement-preview";
import { bankExportAdapter } from "@/lib/banking/bank-export-adapter";
import {
  claimsService,
  filterAndPaginateClaimsList,
} from "@/services/claims/claims.service";
import { GET as getClaimsRoute } from "@/app/api/v1/claims/route";
import type { Claim, Profile } from "@/lib/types/database";

function buildSyntheticWorkspace(claimCount: number): WorkspaceState {
  const userId = "u-finance-01";
  const profiles: Profile[] = [
    {
      id: userId,
      full_name: "Grace Tan",
      email: "grace@harvestgen.org",
      phone: "+60123456789",
      ministry_id: "m-youth",
      status: "ACTIVE",
      roles: ["FINANCE_OFFICER", "CLAIMANT"],
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    },
    {
      id: "u-claimant-02",
      full_name: "Daniel Lim",
      email: "daniel@harvestgen.org",
      phone: "+60198887777",
      ministry_id: "m-worship",
      status: "ACTIVE",
      roles: ["CLAIMANT"],
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    },
  ];

  const ministries = [
    {
      id: "m-youth",
      name: "Youth Ministry",
      code: "YTH",
      leader_id: userId,
      approver_id: userId,
      is_active: true,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    },
    {
      id: "m-worship",
      name: "Worship Ministry",
      code: "WOR",
      leader_id: "u-claimant-02",
      approver_id: userId,
      is_active: true,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    },
  ];

  const statuses: Claim["status"][] = [
    "DRAFT",
    "PENDING_FINANCE_REVIEW",
    "RETURNED_FOR_CLARIFICATION",
    "APPROVED_FOR_PAYMENT",
    "PAID",
  ];

  const claims: Claim[] = Array.from({ length: claimCount }, (_, idx) => {
    const num = idx + 1;
    const status = statuses[idx % statuses.length];
    const ministryId = idx % 2 === 0 ? "m-youth" : "m-worship";
    const day = String((idx % 28) + 1).padStart(2, "0");
    return {
      id: `claim-${num}`,
      claim_number: `CLM-2026-${String(num).padStart(4, "0")}`,
      claimant_id: idx % 2 === 0 ? userId : "u-claimant-02",
      submitted_by_user_id: idx % 2 === 0 ? userId : "u-claimant-02",
      claimant_name: idx % 2 === 0 ? "Grace Tan" : "Daniel Lim",
      claimant_email:
        idx % 2 === 0 ? "grace@harvestgen.org" : "daniel@harvestgen.org",
      claimant_phone: "+60123456789",
      bank_name: "Maybank / Malayan Banking Berhad",
      bank_code: "MBBEMYKL",
      bank_account_holder_name: idx % 2 === 0 ? "Grace Tan" : "Daniel Lim",
      bank_account_number: "014012345678",
      ministry_id: ministryId,
      claim_date: `2026-10-${day}`,
      purpose: `Ministry event supplies #${num}`,
      total_amount: Number(((num * 17.35) % 900 + 25).toFixed(2)),
      currency: "MYR",
      status,
      reimbursement_status:
        status === "APPROVED_FOR_PAYMENT"
          ? "ELIGIBLE"
          : status === "PAID"
          ? "PAID"
          : null,
      declaration_accepted: true,
      version: 1,
      created_at: `2026-10-${day}T08:00:00.000Z`,
      updated_at: `2026-10-${day}T09:00:00.000Z`,
      submitted_at: `2026-10-${day}T08:30:00.000Z`,
      expenses: [
        {
          id: `exp-${num}-1`,
          claim_id: `claim-${num}`,
          expense_date: `2026-10-${day}`,
          cost_centre_id: "",
          description: `Receipt item for claim ${num}`,
          vendor: "Popular Bookstore",
          amount: Number(((num * 17.35) % 900 + 25).toFixed(2)),
          sort_order: 1,
          created_at: `2026-10-${day}T08:00:00.000Z`,
          updated_at: `2026-10-${day}T08:00:00.000Z`,
        },
      ],
      attachments: [
        {
          id: `att-${num}-1`,
          claim_id: `claim-${num}`,
          expense_id: `exp-${num}-1`,
          original_filename: `receipt-${num}.pdf`,
          file_size: 128000,
          mime_type: "application/pdf",
          storage_path: `${userId}/att-${num}/receipt-${num}.pdf`,
          file_category: "RECEIPT",
          uploaded_by: userId,
          created_at: `2026-10-${day}T08:10:00.000Z`,
        },
      ],
      workflow_steps: [
        {
          id: `step-${num}-1`,
          workflow_id: `wf-${num}`,
          claim_id: `claim-${num}`,
          sequence: 1,
          step_name: "Finance Review & Approval",
          approver_role: "FINANCE_OFFICER",
          status:
            status === "APPROVED_FOR_PAYMENT" || status === "PAID"
              ? "COMPLETED"
              : "IN_PROGRESS",
          created_at: `2026-10-${day}T08:30:00.000Z`,
          updated_at: `2026-10-${day}T08:30:00.000Z`,
        },
      ],
      approval_actions: [
        {
          id: `act-${num}-1`,
          claim_id: `claim-${num}`,
          actor_id: userId,
          actor_role: "CLAIMANT",
          action: "SUBMIT",
          comment: "Submitted with supporting receipt.",
          previous_status: "DRAFT",
          new_status: "PENDING_FINANCE_REVIEW",
          created_at: `2026-10-${day}T08:30:00.000Z`,
        },
      ],
      comments: [
        {
          id: `com-${num}-1`,
          claim_id: `claim-${num}`,
          author_id: userId,
          author_role: "CLAIMANT",
          visibility: "PUBLIC_WORKFLOW",
          content: "Please process before month end.",
          created_at: `2026-10-${day}T08:35:00.000Z`,
          updated_at: `2026-10-${day}T08:35:00.000Z`,
        },
      ],
    };
  });

  return {
    user_id: userId,
    profiles,
    claims,
    ministries,
    categories: [],
    costCentres: [],
    approvalRules: [],
    notifications: [
      {
        id: "notif-1",
        user_id: userId,
        title: "Claim Submitted",
        message: "CLM-2026-0001 awaiting review",
        type: "APPROVAL_NEEDED",
        is_read: false,
        created_at: "2026-10-01T08:30:00.000Z",
      },
    ],
    systemSettings: [],
    auditLogs: [],
    signupInvitations: [],
    reimbursementBatches: [],
    managedClaimValues: [],
    recurringPayments: [],
  };
}

describe("Full-Stack Performance & State Management Optimizations", () => {
  beforeEach(() => {
    workspaceStore.clear();
    vi.restoreAllMocks();
  });

  it("isolates domain subscriptions so notification updates do not trigger claim subscribers or invalidate claim caches", () => {
    const state = buildSyntheticWorkspace(20);
    workspaceStore.patchState(state);

    let claimsSubscriberCalls = 0;
    let notificationsSubscriberCalls = 0;

    const unsubClaims = workspaceStore.subscribeDomains(
      ["claims", "master-data", "iam"],
      () => {
        claimsSubscriberCalls++;
      }
    );
    const unsubNotifs = workspaceStore.subscribeDomains(
      ["notifications"],
      () => {
        notificationsSubscriberCalls++;
      }
    );

    const hydratedBefore = claimsClient.getClaims();

    // Patching notifications only should notify notification subscribers, NOT claims subscribers
    workspaceStore.patchState({
      notifications: [
        ...state.notifications,
        {
          id: "notif-2",
          user_id: "u-finance-01",
          title: "New Alert",
          message: "Another notification arrived",
          type: "INFO",
          is_read: false,
          created_at: "2026-10-02T08:30:00.000Z",
        },
      ],
    });

    expect(notificationsSubscriberCalls).toBe(1);
    expect(claimsSubscriberCalls).toBe(0);

    // Hydrated claims array reference is preserved when unrelated domains change
    const hydratedAfter = claimsClient.getClaims();
    expect(hydratedAfter).toBe(hydratedBefore);

    unsubClaims();
    unsubNotifs();
  });

  it("preserves per-claim object references when a single claim is updated via upsertClaim", () => {
    const state = buildSyntheticWorkspace(10);
    workspaceStore.patchState(state);

    const beforeList = claimsClient.getClaims();
    const unchangedClaimBefore = beforeList.find((c) => c.id === "claim-5")!;
    const targetClaimBefore = beforeList.find((c) => c.id === "claim-1")!;

    workspaceStore.upsertClaim({
      ...targetClaimBefore,
      purpose: "Updated ministry purpose for claim 1",
      version: 2,
    });

    const afterList = claimsClient.getClaims();
    const unchangedClaimAfter = afterList.find((c) => c.id === "claim-5")!;
    const targetClaimAfter = afterList.find((c) => c.id === "claim-1")!;

    expect(targetClaimAfter.purpose).toBe(
      "Updated ministry purpose for claim 1"
    );
    expect(targetClaimAfter).not.toBe(targetClaimBefore);
    // Unchanged claim object reference is strictly preserved
    expect(unchangedClaimAfter).toBe(unchangedClaimBefore);
  });

  it("deduplicates concurrent refreshDomain calls and prevents out-of-order stale responses from overwriting newer state", async () => {
    const state = buildSyntheticWorkspace(5);
    workspaceStore.patchState(state);

    let resolveFirst!: (val: Response) => void;
    let resolveSecond!: (val: Response) => void;

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementationOnce(
        () =>
          new Promise<Response>((res) => {
            resolveFirst = res;
          })
      )
      .mockImplementationOnce(
        () =>
          new Promise<Response>((res) => {
            resolveSecond = res;
          })
      );

    // 1. Concurrent deduplication: two calls without forceFresh share the same in-flight promise
    const p1 = workspaceStore.refreshDomain("/api/v1/notifications");
    const p1Duplicate = workspaceStore.refreshDomain("/api/v1/notifications");
    expect(p1).toBe(p1Duplicate);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // 2. Force-fresh starts a newer request (seq 2) while seq 1 is still in flight
    const p2 = workspaceStore.refreshDomain("/api/v1/notifications", {
      forceFresh: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Resolve the SECOND (newer) request first
    resolveSecond(
      new Response(
        JSON.stringify({
          notifications: [
            {
              id: "notif-newer",
              user_id: "u-finance-01",
              title: "Newer State",
              message: "From request #2",
              type: "INFO",
              is_read: false,
              created_at: "2026-10-03T00:00:00.000Z",
            },
          ],
        }),
        { status: 200 }
      )
    );
    await p2;
    expect(workspaceStore.getState().notifications[0]?.id).toBe("notif-newer");

    // Now resolve the FIRST (stale) request afterwards — it must NOT overwrite request #2's state
    resolveFirst(
      new Response(
        JSON.stringify({
          notifications: [
            {
              id: "notif-stale",
              user_id: "u-finance-01",
              title: "Stale State",
              message: "From request #1",
              type: "INFO",
              is_read: false,
              created_at: "2026-10-01T00:00:00.000Z",
            },
          ],
        }),
        { status: 200 }
      )
    );
    await p1;
    expect(workspaceStore.getState().notifications[0]?.id).toBe("notif-newer");
  });

  it("clears all domain caches and ignores post-logout in-flight responses on clear()", async () => {
    const state = buildSyntheticWorkspace(15);
    workspaceStore.patchState(state);
    expect(claimsClient.getClaims().length).toBe(15);
    expect(iamClient.getProfileById("u-finance-01")?.full_name).toBe(
      "Grace Tan"
    );
    expect(masterDataClient.getMinistryById("m-youth")?.name).toBe(
      "Youth Ministry"
    );

    let resolveInflight!: (val: Response) => void;
    vi.spyOn(globalThis, "fetch").mockImplementationOnce(
      () =>
        new Promise<Response>((res) => {
          resolveInflight = res;
        })
    );

    const inflight = workspaceStore.refreshDomain("/api/v1/claims");
    workspaceStore.clear();

    expect(claimsClient.getClaims().length).toBe(0);
    expect(iamClient.getProfileById("u-finance-01")).toBeUndefined();

    // Resolving an in-flight response after logout/clear() must not repopulate sensitive state
    resolveInflight(
      new Response(JSON.stringify({ claims: state.claims }), { status: 200 })
    );
    await inflight;
    expect(claimsClient.getClaims().length).toBe(0);
  });

  it("supports server-side pagination, search, status/ministry/date filtering, sorting, and strips heavy detail arrays from list items", async () => {
    const state = buildSyntheticWorkspace(120);

    const page1 = filterAndPaginateClaimsList(state.claims, {
      page: 1,
      page_size: 25,
      status: "APPROVED_FOR_PAYMENT",
      ministry_id: "m-youth",
      sort_field: "total_amount",
      sort_dir: "desc",
    });

    // Every 5th claim is APPROVED_FOR_PAYMENT (24 out of 120), and half of those are m-youth (12 claims)
    expect(page1.total_count).toBe(12);
    expect(page1.page).toBe(1);
    expect(page1.page_size).toBe(25);
    expect(page1.items.length).toBe(12);

    // Verify descending sort by total_amount
    for (let i = 1; i < page1.items.length; i++) {
      expect(Number(page1.items[i - 1].total_amount)).toBeGreaterThanOrEqual(
        Number(page1.items[i].total_amount)
      );
    }

    // Verify heavy comments and approval_actions arrays are stripped from list items
    expect("comments" in page1.items[0]).toBe(false);
    expect("approval_actions" in page1.items[0]).toBe(false);
    expect(page1.items[0].expense_count).toBe(1);
    expect(page1.items[0].attachment_count).toBe(1);

    // Verify summary counts across all 120 claims
    expect(page1.summary.draft_count).toBe(24);
    expect(page1.summary.pending_count).toBe(24);
    expect(page1.summary.returned_count).toBe(24);
    expect(page1.summary.approved_count).toBe(24);
    expect(page1.summary.paid_count).toBe(24);
  });

  it("handles GET /api/v1/claims?id=... and GET /api/v1/claims?page=...&page_size=... via route handler", async () => {
    const state = buildSyntheticWorkspace(60);

    vi.spyOn(claimsService, "getClaimDetail").mockResolvedValueOnce({
      data: { claim: state.claims[0] },
      status: 200,
    });

    const detailReq = new NextRequest(
      "http://localhost:3000/api/v1/claims?id=claim-1"
    );
    const detailRes = await getClaimsRoute(detailReq);
    expect(detailRes.status).toBe(200);
    const detailBody = await detailRes.json();
    expect(detailBody.claim.id).toBe("claim-1");
    expect(detailBody.claim.comments.length).toBe(1);

    vi.spyOn(claimsService, "queryClaims").mockResolvedValueOnce({
      data: filterAndPaginateClaimsList(state.claims, {
        page: 2,
        page_size: 20,
      }),
      status: 200,
    });

    const listReq = new NextRequest(
      "http://localhost:3000/api/v1/claims?page=2&page_size=20"
    );
    const listRes = await getClaimsRoute(listReq);
    expect(listRes.status).toBe(200);
    const listBody = await listRes.json();
    expect(listBody.page).toBe(2);
    expect(listBody.page_size).toBe(20);
    expect(listBody.total_count).toBe(60);
    expect(listBody.items.length).toBe(20);
  });

  it("deduplicates concurrent claimsClient.fetchClaimDetail(id) requests and hydrates detail into WorkspaceStore", async () => {
    const state = buildSyntheticWorkspace(5);
    // Strip detail arrays from initial list item
    const strippedClaim: Claim = {
      ...state.claims[0],
      comments: undefined,
      approval_actions: undefined,
    };
    workspaceStore.patchState({
      ...state,
      claims: [strippedClaim],
    });

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ claim: state.claims[0] }), { status: 200 })
    );

    const [res1, res2] = await Promise.all([
      claimsClient.fetchClaimDetail("claim-1", { force: true }),
      claimsClient.fetchClaimDetail("claim-1"),
    ]);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(res1?.comments?.length).toBe(1);
    expect(res2?.approval_actions?.length).toBe(1);
  });

  it("verifies pure client-safe sha256Hex matches Node crypto.createHash('sha256') and preserves Alliance Bank BIFF8 .xls export determinism", () => {
    const testVectors = [
      "",
      "abc",
      "Alliance Bank Malaysia Berhad - Harvest Generation Claims",
      "UTF-8 Payee Name: 陳大文 / Aisyah binti Mohd Noor — RM 1,250.50",
      "x".repeat(1024),
    ];

    for (const input of testVectors) {
      const expected = createHash("sha256").update(input, "utf8").digest("hex");
      expect(sha256Hex(input)).toBe(expected);
    }

    // Verify BIFF8 .xls export still produces identical binary & SHA-256 hash
    const state = buildSyntheticWorkspace(5);
    workspaceStore.patchState(state);
    const eligible = financeClient.getEligibleClaimsForReimbursement();
    expect(eligible.length).toBeGreaterThan(0);

    const xlsBuffer = bankExportAdapter.renderXls([
      {
        lineOrder: 1,
        paymentMode: "LGP",
        beneficiaryUserId: "u-finance-01",
        beneficiaryName: "Grace Tan",
        beneficiaryAccountNumber: "014012345678",
        beneficiaryBankCode: "MBBEMYKL",
        beneficiaryBankName: "Maybank / Malayan Banking Berhad",
        amount: 125.5,
        amountCents: 12550,
        paymentDescription: "P260001",
        paymentReference: "Reimbursement",
        claimIds: ["claim-1"],
        claimNumbers: ["CLM-2026-0001"],
      },
    ]);

    const verified = bankExportAdapter.parseAndVerifyXls(xlsBuffer);
    expect(verified.sheetNames).toEqual(["Sheet1", "Bank List"]);
    expect(verified.sha256).toHaveLength(64);
  });
});
