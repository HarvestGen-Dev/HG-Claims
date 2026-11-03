import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser }, rpc: mocks.rpc }),
}));

import { GET as getIam, POST as postIam } from "@/app/api/v1/iam/route";
import {
  GET as getMasterData,
  POST as postMasterData,
} from "@/app/api/v1/master-data/route";
import { GET as getClaims, POST as postClaims } from "@/app/api/v1/claims/route";
import {
  GET as getFinance,
  POST as postFinance,
} from "@/app/api/v1/finance/route";
import {
  GET as getNotifications,
  POST as postNotifications,
} from "@/app/api/v1/notifications/route";
import {
  claimsClient,
  financeClient,
  iamClient,
  masterDataClient,
  notificationClient,
  workspaceStore,
} from "@/lib/domains";

const makeRequest = (path: string, body: unknown) =>
  new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost",
    },
    body: JSON.stringify(body),
  });

describe("Bounded-Context Domain Services & APIs (/api/v1/*)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
  });

  describe("1. Domain Boundary Enforcement on POST /api/v1/*", () => {
    it("allows IAM actions on /api/v1/iam and rejects non-IAM actions", async () => {
      mocks.rpc.mockResolvedValue({ data: { id: "user-1" }, error: null });

      const okRes = await postIam(
        makeRequest("/api/v1/iam", {
          action: "complete_onboarding",
          payload: { full_name: "Grace" },
        })
      );
      expect(okRes.status).toBe(200);
      expect(mocks.rpc).toHaveBeenCalledWith("nlcc_command", {
        action: "complete_onboarding",
        payload: { full_name: "Grace" },
      });

      const badRes = await postIam(
        makeRequest("/api/v1/iam", {
          action: "submit_claim",
          payload: { id: "claim-1" },
        })
      );
      expect(badRes.status).toBe(400);
      expect(await badRes.json()).toEqual({
        error: "Unsupported IAM action: submit_claim",
      });
    });

    it("separates Master Data tables from Finance approval_rules", async () => {
      mocks.rpc.mockResolvedValue({ data: { id: "row-1" }, error: null });

      // Ministries belong to Master Data
      const mdOk = await postMasterData(
        makeRequest("/api/v1/master-data", {
          action: "master_save",
          payload: { table: "ministries", data: { name: "Worship" } },
        })
      );
      expect(mdOk.status).toBe(200);

      // approval_rules rejected by Master Data
      const mdRejected = await postMasterData(
        makeRequest("/api/v1/master-data", {
          action: "master_save",
          payload: { table: "approval_rules", data: { name: "Rule 1" } },
        })
      );
      expect(mdRejected.status).toBe(400);

      // approval_rules accepted by Finance
      const finOk = await postFinance(
        makeRequest("/api/v1/finance", {
          action: "master_save",
          payload: { table: "approval_rules", data: { name: "Rule 1" } },
        })
      );
      expect(finOk.status).toBe(200);

      // Ministries rejected by Finance
      const finRejected = await postFinance(
        makeRequest("/api/v1/finance", {
          action: "master_save",
          payload: { table: "ministries", data: { name: "Worship" } },
        })
      );
      expect(finRejected.status).toBe(400);
    });

    it("enforces Claims vs Finance workflow boundaries", async () => {
      mocks.rpc.mockResolvedValue({ data: { id: "claim-1" }, error: null });

      // Claims accepts save_draft, submit_claim, delete_claim, comment
      expect(
        (
          await postClaims(
            makeRequest("/api/v1/claims", {
              action: "save_draft",
              payload: { purpose: "Books" },
            })
          )
        ).status
      ).toBe(200);

      // Claims rejects finance workflow actions
      expect(
        (
          await postClaims(
            makeRequest("/api/v1/claims", {
              action: "approve",
              payload: { claim_id: "claim-1" },
            })
          )
        ).status
      ).toBe(400);

      // Finance accepts approve, verify, pay, return, reject, correct
      expect(
        (
          await postFinance(
            makeRequest("/api/v1/finance", {
              action: "verify",
              payload: { claim_id: "claim-1", version: 1 },
            })
          )
        ).status
      ).toBe(200);

      // Notifications only accepts read_notifications
      expect(
        (
          await postNotifications(
            makeRequest("/api/v1/notifications", {
              action: "read_notifications",
              payload: { id: "notif-1" },
            })
          )
        ).status
      ).toBe(200);
      expect(
        (
          await postNotifications(
            makeRequest("/api/v1/notifications", {
              action: "delete_claim",
              payload: { id: "claim-1" },
            })
          )
        ).status
      ).toBe(400);
    });
  });

  describe("2. Scoped Domain State on GET /api/v1/*", () => {
    beforeEach(() => {
      mocks.rpc.mockResolvedValue({
        data: {
          user_id: "user-1",
          profiles: [{ id: "user-1", full_name: "Grace" }],
          signupInvitations: [{ id: "inv-1" }],
          ministries: [{ id: "min-1" }],
          categories: [{ id: "cat-1" }],
          costCentres: [{ id: "cc-1" }],
          systemSettings: [{ key: "claim_numbering", value: {} }],
          claims: [{ id: "claim-1" }],
          approvalRules: [{ id: "rule-1" }],
          notifications: [{ id: "notif-1" }],
          auditLogs: [{ id: "audit-1" }],
        },
        error: null,
      });
    });

    it("returns only IAM entities from GET /api/v1/iam and invokes nlcc_domain_snapshot", async () => {
      const res = await getIam();
      const body = await res.json();
      expect(Object.keys(body).sort()).toEqual([
        "profiles",
        "signupInvitations",
        "user_id",
      ]);
      expect(mocks.rpc).toHaveBeenCalledWith("nlcc_domain_snapshot", {
        p_domain: "iam",
      });
    });

    it("returns only Master Data entities from GET /api/v1/master-data", async () => {
      const res = await getMasterData();
      const body = await res.json();
      expect(Object.keys(body).sort()).toEqual([
        "categories",
        "costCentres",
        "ministries",
        "systemSettings",
      ]);
    });

    it("returns only Claims from GET /api/v1/claims", async () => {
      const res = await getClaims();
      const body = await res.json();
      expect(Object.keys(body)).toEqual(["claims"]);
    });

    it("does not retry a failed scoped snapshot with the full workspace", async () => {
      mocks.rpc.mockReset().mockResolvedValue({ data: null, error: { code: "57014" } });
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        const res = await getClaims();
        expect(res.status).toBe(503);
        expect(mocks.rpc).toHaveBeenCalledTimes(1);
      } finally {
        log.mockRestore();
      }
    });

    it("returns only Finance & Workflow entities from GET /api/v1/finance", async () => {
      const res = await getFinance();
      const body = await res.json();
      expect(Object.keys(body).sort()).toEqual([
        "approvalRules",
        "claims",
        "reimbursementBatches",
      ]);
    });

    it("returns only Notifications & Audit logs from GET /api/v1/notifications", async () => {
      const res = await getNotifications();
      const body = await res.json();
      expect(Object.keys(body).sort()).toEqual(["auditLogs", "notifications"]);
    });
  });

  describe("3. Frontend Domain Client Endpoint Routing", () => {
    const fetchMock = vi.fn();

    const snapshotPayload = {
      user_id: "user-1",
      profiles: [{ id: "user-1", full_name: "Grace" }],
      claims: [{ id: "claim-1", version: 2, status: "PENDING_FINANCE_REVIEW" }],
      ministries: [{ id: "min-1", name: "Worship" }],
    };

    beforeEach(async () => {
      vi.stubGlobal("fetch", fetchMock);
      workspaceStore.clear();
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify(snapshotPayload))
      );
      await workspaceStore.refresh();
      fetchMock.mockReset();
    });

    afterEach(() => {
      vi.unstubAllGlobals();
      workspaceStore.clear();
    });

    it("routes IAM mutations via iamClient to /api/v1/iam", async () => {
      fetchMock
        .mockResolvedValueOnce(new Response(JSON.stringify({ id: "user-1" })))
        .mockResolvedValueOnce(new Response(JSON.stringify(snapshotPayload)));

      await iamClient.completeOnboarding({ full_name: "Grace Updated" });
      expect(fetchMock.mock.calls[0][0]).toBe("/api/v1/iam");
    });

    it("routes Master Data mutations via masterDataClient to /api/v1/master-data", async () => {
      fetchMock
        .mockResolvedValueOnce(new Response(JSON.stringify({ id: "min-1" })))
        .mockResolvedValueOnce(new Response(JSON.stringify(snapshotPayload)));

      await masterDataClient.createMinistry({
        code: "YOUTH",
        name: "Youth Ministry",
      });
      expect(fetchMock.mock.calls[0][0]).toBe("/api/v1/master-data");
    });

    it("routes Claims mutations via claimsClient to /api/v1/claims", async () => {
      fetchMock
        .mockResolvedValueOnce(new Response(JSON.stringify({ id: "claim-1" })))
        .mockResolvedValueOnce(new Response(JSON.stringify(snapshotPayload)));

      await claimsClient.saveClaimDraft({ purpose: "Sound cables" });
      expect(fetchMock.mock.calls[0][0]).toBe("/api/v1/claims");
    });

    it("routes Finance workflow mutations via financeClient to /api/v1/finance", async () => {
      fetchMock
        .mockResolvedValueOnce(new Response(JSON.stringify({ id: "claim-1" })))
        .mockResolvedValueOnce(new Response(JSON.stringify(snapshotPayload)));

      await financeClient.verifyClaim(
        "claim-1",
        {} as never,
        "Receipts checked"
      );
      expect(fetchMock.mock.calls[0][0]).toBe("/api/v1/finance");
    });

    it("routes Notification mutations via notificationClient to /api/v1/notifications", async () => {
      fetchMock
        .mockResolvedValueOnce(new Response(JSON.stringify({})))
        .mockResolvedValueOnce(new Response(JSON.stringify(snapshotPayload)));

      await notificationClient.markNotificationAsRead("notif-1");
      expect(fetchMock.mock.calls[0][0]).toBe("/api/v1/notifications");
      expect(fetchMock.mock.calls[1][0]).toBe("/api/v1/notifications");
    });

    it("refreshes only the mutated domain slice while preserving other domains in memory", async () => {
      fetchMock
        .mockResolvedValueOnce(new Response(JSON.stringify({ id: "min-2" })))
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              ministries: [
                { id: "min-1", name: "Worship" },
                { id: "min-2", name: "Youth" },
              ],
            })
          )
        );

      await masterDataClient.createMinistry({ code: "YOUTH", name: "Youth" });
      expect(fetchMock.mock.calls[1][0]).toBe("/api/v1/master-data");
      expect(masterDataClient.getMinistries()).toHaveLength(2);
      // Claims and profiles from initial snapshot remain intact without re-fetching /api/workspace
      expect(claimsClient.getClaims()).toHaveLength(1);
      expect(iamClient.getProfiles()).toHaveLength(1);
    });

    it("deduplicates concurrent refresh calls and serves fresh state within TTL via refreshIfStale", async () => {
      const profile = await workspaceStore.refreshIfStale(15000);
      expect(profile.id).toBe("user-1");
      expect(fetchMock).not.toHaveBeenCalled();

      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify(snapshotPayload))
      );
      const [p1, p2] = await Promise.all([
        workspaceStore.refresh(),
        workspaceStore.refresh(),
      ]);
      expect(p1.id).toBe("user-1");
      expect(p2.id).toBe("user-1");
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("memoizes relational joins across renders until store version changes", () => {
      const firstClaims = claimsClient.getClaims();
      const secondClaims = claimsClient.getClaims();
      expect(firstClaims).toBe(secondClaims);

      const firstMinistries = masterDataClient.getMinistries();
      expect(masterDataClient.getMinistries()).toBe(firstMinistries);
    });
  });
});
