import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser }, rpc: mocks.rpc }) }));
import { POST } from "@/app/api/workspace/route";

const request = (body: unknown) => new NextRequest("http://localhost/api/workspace", {
  method: "POST", headers: { "content-type": "application/json", origin: "http://localhost" }, body: JSON.stringify(body),
});
beforeEach(() => { vi.clearAllMocks(); mocks.getUser.mockResolvedValue({ data: { user: { id: "user" } }, error: null }); });
describe("Production workspace API", () => {
  it.each(["delete_claim", "master_delete", "complete_onboarding", "revoke_invitation", "delete_invitation"])("reports database rejection for %s instead of fake success", async action => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "Access denied" } });
    const response = await POST(request({ action, payload: { id: "record" } }));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Access denied" });
    expect(mocks.rpc).toHaveBeenCalledWith("nlcc_command", { action, payload: { id: "record" } });
  });
  it("returns an invitation link only after its hash was committed", async () => {
    mocks.rpc.mockResolvedValue({ data: { id: "invitation" }, error: null });
    const response = await POST(request({ action: "create_invitation", payload: { role_code: "FINANCE_OFFICER" } }));
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.signup_url).toBe(`/signup?invite=${data.raw_token}`);
    const payload = mocks.rpc.mock.calls[0][1].payload;
    expect(payload.token_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(payload.token_hash).not.toBe(data.raw_token);
  });
  it("rejects malformed JSON and array payloads", async () => {
    expect((await POST(new NextRequest("http://localhost/api/workspace", { method: "POST", headers: { "content-type": "application/json" }, body: "{" }))).status).toBe(400);
    expect((await POST(request({ action: "save_draft", payload: [] }))).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("rejects unauthenticated and cross-origin writes", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    expect((await POST(request({ action: "delete_claim", payload: {} }))).status).toBe(401);
    expect((await POST(new NextRequest("http://localhost/api/workspace", { method: "POST", headers: { origin: "https://other.example" } }))).status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
