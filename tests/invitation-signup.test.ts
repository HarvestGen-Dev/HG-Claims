import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ lookup: vi.fn(), rpc: vi.fn(), createUser: vi.fn(), deleteUser: vi.fn(), eq: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({
  from: () => ({ select: () => ({ eq: mocks.eq }) }), rpc: mocks.rpc,
  auth: { admin: { createUser: mocks.createUser, deleteUser: mocks.deleteUser } },
}) }));
import { POST } from "@/app/api/invitations/signup/route";
import { hashToken } from "@/lib/utils/token";
const request = () => new NextRequest("http://localhost/api/invitations/signup", {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ token: "test-invitation-token", email: "test@example.com", password: "test-password-123" }),
});
beforeEach(() => {
  vi.clearAllMocks(); mocks.eq.mockImplementation(() => ({ maybeSingle: mocks.lookup }));
  mocks.lookup.mockResolvedValue({ data: { id: "inv", is_active: true, expires_at: "2099-01-01", use_count: 0, max_uses: 1 }, error: null });
  mocks.createUser.mockResolvedValue({ data: { user: { id: "new-user" } }, error: null });
  mocks.deleteUser.mockResolvedValue({ error: null });
});
describe("Invitation signup integrity", () => {
  it("consumes the hashed invitation and provisions roles before reporting success", async () => {
    mocks.rpc.mockResolvedValue({ error: null });
    expect((await POST(request())).status).toBe(200);
    expect(mocks.eq).toHaveBeenCalledTimes(1);
    expect(mocks.eq).toHaveBeenCalledWith("token_hash", hashToken("test-invitation-token"));
    expect(mocks.rpc).toHaveBeenCalledWith("nlcc_redeem_invitation", { token_hash: hashToken("test-invitation-token"), user_id: "new-user" });
  });
  it("removes a new account if the invitation was concurrently consumed or revoked", async () => {
    mocks.rpc.mockResolvedValue({ error: { message: "Invitation fully used" } });
    expect((await POST(request())).status).toBe(400);
    expect(mocks.deleteUser).toHaveBeenCalledWith("new-user");
  });
  it("does not accept the stored hash as a fallback token", async () => {
    mocks.lookup.mockResolvedValue({ data: null, error: null });
    expect((await POST(request())).status).toBe(400);
    expect(mocks.eq).toHaveBeenCalledTimes(1);
    expect(mocks.createUser).not.toHaveBeenCalled();
  });
});
