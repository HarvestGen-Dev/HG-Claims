import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ upload: vi.fn(), download: vi.fn(), getUser: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ auth: { getUser: mocks.getUser }, storage: { from: () => mocks } }) }));
import { getReceipt, saveReceipt } from "@/lib/data/receipts";
beforeEach(() => { vi.clearAllMocks(); mocks.getUser.mockResolvedValue({ data: { user: { id: "owner" } }, error: null }); });
describe("Persistent private receipts", () => {
  it("does not report upload success when storage is missing", async () => {
    mocks.upload.mockResolvedValue({ error: { message: "Bucket not found" } });
    await expect(saveReceipt("owner/test.png", new Blob(["receipt"]))).rejects.toThrow("Bucket not found");
  });
  it("does not return another session's cached receipt after access is denied", async () => {
    mocks.download.mockResolvedValueOnce({ data: new Blob(["receipt"]), error: null });
    await getReceipt("owner/test.png");
    mocks.download.mockResolvedValueOnce({ data: null, error: { message: "Access denied" } });
    await expect(getReceipt("owner/test.png")).rejects.toThrow("Access denied");
  });
  it("requires authentication before attempting upload", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(saveReceipt("owner/test.png", new Blob())).rejects.toThrow("Sign in");
    expect(mocks.upload).not.toHaveBeenCalled();
  });
});
