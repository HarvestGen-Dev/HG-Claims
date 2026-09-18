import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("Demo workspace persistence", () => {
  beforeEach(() => {
    vi.resetModules();
    const storage = new Map<string, string>();
    vi.stubGlobal("window", { localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    } });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("restores edited drafts and their receipt changes after a reload", async () => {
    const { db } = await import("@/lib/mock-db/repository");
    const data = {
      claimant_id: "u-jaeden-01", claimant_name: "Jaeden Ting", claimant_email: "jaeden@nlcc.org.my", claimant_phone: "+60 12-345 6789",
      ministry_id: "m-youth-01", cost_centre_id: "cc-youth-01",
      programme_event: "Rehearsal", claim_date: "2026-09-10", purpose: "Transport",
      payment_method: "PERSONAL_REIMBURSEMENT", expenses: [],
    };
    const draft = db.saveClaimDraft(data);
    db.saveClaimDraft({ ...data, id: draft.id, attachments: [{
      original_filename: "receipt.png", storage_path: "receipts/test", mime_type: "image/png",
      file_size: 100, file_category: "RECEIPT", uploaded_by: "u-jaeden-01",
    }] });
    vi.resetModules();
    const restored = (await import("@/lib/mock-db/repository")).db;
    expect(restored.getClaimById(draft.id)?.attachments?.[0].original_filename).toBe("receipt.png");
    restored.saveClaimDraft({ ...data, id: draft.id, attachments: [] });
    vi.resetModules();
    expect((await import("@/lib/mock-db/repository")).db.getClaimById(draft.id)?.attachments).toEqual([]);
  });

  it("restores profile and notification changes", async () => {
    const { db } = await import("@/lib/mock-db/repository");
    db.updateProfile("u-jaeden-01", { phone: "0123456789" });
    db.markAllNotificationsAsRead("u-jaeden-01");
    vi.resetModules();
    const restored = (await import("@/lib/mock-db/repository")).db;
    expect(restored.getProfileById("u-jaeden-01")?.phone).toBe("0123456789");
    expect(restored.getNotifications("u-jaeden-01").every(item => item.is_read)).toBe(true);
  });
});
