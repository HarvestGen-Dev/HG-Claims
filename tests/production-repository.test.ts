import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/data/repository";
const fetchMock = vi.fn();
beforeEach(async () => {
  vi.stubGlobal("fetch", fetchMock); db.clear();
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ user_id: "user", profiles: [{ id: "user" }], claims: [{ id: "claim" }], ministries: [{ id: "ministry" }] })));
  await db.refresh(); fetchMock.mockReset();
});
afterEach(() => { vi.unstubAllGlobals(); db.clear(); });
describe("Failed production writes", () => {
  it("keeps claims visible when deletion fails", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: "Cannot delete submitted claim" }), { status: 403 }));
    await expect(db.deleteClaim("claim")).rejects.toThrow("Cannot delete submitted claim");
    expect(db.getClaimById("claim")).not.toBeNull();
  });
  it("keeps master data visible when deletion fails", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: "Unavailable" }), { status: 503 }));
    await expect(db.deleteMinistry("ministry")).rejects.toThrow("Unavailable");
    expect(db.getMinistries()).toHaveLength(1);
  });
});
