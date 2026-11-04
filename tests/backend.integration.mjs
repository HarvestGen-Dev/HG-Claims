import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const status = JSON.parse(execFileSync(process.env.NLCC_SUPABASE_CLI || "supabase", ["status", "-o", "json", ...(process.env.NLCC_TEST_WORKDIR ? ["--workdir", process.env.NLCC_TEST_WORKDIR] : [])], { encoding: "utf8", stdio: ["ignore","pipe","ignore"] }));
assert.match(status.API_URL, /^http:\/\/(127\.0\.0\.1|localhost):/);
const service = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const anonymous = createClient(status.API_URL, status.ANON_KEY, { auth: { persistSession: false } });
const suffix = randomUUID().slice(0,8);
const users = {};
const password = randomUUID() + "!aA9";
let assertions = 0;
function check(value, message) { assert.ok(value, message); assertions++; console.log("PASS: " + message); }
async function snapshot(client) { const { data, error } = await client.rpc("nlcc_snapshot"); assert.ifError(error); return data; }
async function command(client, action, payload) { const result = await client.rpc("nlcc_command", { action, payload }); assert.ifError(result.error); return result.data; }
async function denied(client, action, payload) { const result = await client.rpc("nlcc_command", { action, payload }); check(!!result.error, "Expected rejection: " + action); }
async function transition(client, action, claimId, payload = {}) {
  const claim = (await snapshot(client)).claims.find(c => c.id === claimId);
  return command(client, action, { claim_id: claimId, version: claim.version, ...payload });
}
for (const [name, role] of Object.entries({ admin: "SYSTEM_ADMIN", claimant: "CLAIMANT", leader: "CLAIMANT", outsider: "CLAIMANT", finance: "FINANCE_OFFICER" })) {
  const email = name + "-" + suffix + "@nlcc-test.invalid";
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: name } });
  assert.ifError(error);
  if (name !== "claimant") {
    const { data: roleRow, error: roleError } = await service.from("roles").select("id").eq("code", role).single();
    assert.ifError(roleError);
    const grant = await service.from("user_roles").upsert({ user_id: data.user.id, role_id: roleRow.id }, { onConflict: "user_id,role_id" });
    assert.ifError(grant.error);
  }
  const client = createClient(status.API_URL, status.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const login = await client.auth.signInWithPassword({ email, password });
  assert.ifError(login.error);
  // Exercise concurrent database requests without sharing the Auth client's session lock.
  const authenticated = createClient(status.API_URL, status.ANON_KEY, {
    accessToken: async () => login.data.session.access_token,
  });
  users[name] = { client: authenticated, id: data.user.id, email };
}
const { admin, claimant, leader, outsider, finance } = users;
check(!!(await anonymous.rpc("nlcc_snapshot")).error, "Anonymous snapshot denied");
check(!!(await claimant.client.from("claims").insert({ claimant_id: claimant.id })).error, "Direct claim writes denied");
check(!!(await claimant.client.rpc("instantiate_claim_workflow", { p_claim_id: randomUUID() })).error, "Legacy privileged RPC denied");
await denied(claimant.client, "master_save", { table: "ministries", data: { code: "ATTACK", name: "Attack" } });
await command(claimant.client, "profile", { id: claimant.id, data: { roles: ["SYSTEM_ADMIN"], status: "ACTIVE", bank_account_number: "123456789" } });
check(!(await snapshot(claimant.client)).profiles.find(p => p.id === claimant.id).roles.includes("SYSTEM_ADMIN"), "Self role elevation denied");
check(!(await snapshot(outsider.client)).profiles.find(p => p.id === claimant.id).bank_account_number, "Bank details hidden from unrelated user");

const ministry = await command(admin.client, "master_save", { table: "ministries", data: { code: "TEST-" + suffix, name: "Test ministry", leader_id: leader.id } });
const draft = { request_key: randomUUID(), ministry_id: ministry.id, claim_date: "2026-09-10", purpose: "Unprovisioned", expenses: [] };
await denied(claimant.client, "save_draft", draft);
const tokenHash = randomUUID().replaceAll("-", "") + randomUUID().replaceAll("-", "");
const invitation = { role_code: "CLAIMANT", token_hash: tokenHash, expires_in_days: 7, max_uses: 1 };
await denied(outsider.client, "create_invitation", invitation);
await command(admin.client, "create_invitation", invitation);
assert.ifError((await service.rpc("nlcc_redeem_invitation", { token_hash: tokenHash, user_id: claimant.id })).error);
const registered = (await snapshot(claimant.client)).profiles.find(p => p.id === claimant.id);
check(registered.roles.includes("CLAIMANT") && !registered.ministry_id && !registered.default_ministry_id, "Redeemed claimant invitation grants access without a ministry");
check(!!(await service.rpc("nlcc_redeem_invitation", { token_hash: tokenHash, user_id: outsider.id })).error, "Claimant invitation cannot be redeemed twice");
const costCentre = await command(admin.client, "master_save", { table: "cost_centres", data: { code: "CC-" + suffix, name: "Test budget", ministry_id: ministry.id } });
const payee = await command(claimant.client, "create_payee_profile", {
  full_name: "Fixture payee " + suffix,
  bank_code: "PBBEMYKL",
  bank_account_number: "003198765432",
  ministry_id: ministry.id,
});
check((await snapshot(claimant.client)).profiles.find(p => p.id === payee.id).bank_account_number === "003198765432", "Payee creator can view account details");
check(!(await snapshot(outsider.client)).profiles.find(p => p.id === payee.id).bank_account_number, "Unrelated user cannot view saved payee account details");
const outsiderIam = await outsider.client.rpc("nlcc_domain_snapshot", { p_domain: "iam" });
assert.ifError(outsiderIam.error);
check(!outsiderIam.data.profiles.find(p => p.id === payee.id).bank_account_number, "Scoped IAM snapshot also hides unrelated payee account details");
check((await snapshot(finance.client)).profiles.find(p => p.id === payee.id).bank_account_number === "003198765432", "Finance can view payee details for reimbursement");
const unauthorizedPayeeEdit = await outsider.client.rpc("nlcc_command", { action: "create_payee_profile", payload: {
  id: payee.id, full_name: "Changed payee", bank_code: "PBBEMYKL", bank_account_number: "9999988888",
} });
check(unauthorizedPayeeEdit.error?.code === "42501", "Unrelated user cannot change saved payee details");
const payeeDraftPayload = {
  request_key: randomUUID(), ministry_id: ministry.id, claim_date: "2026-11-03",
  claimant_name: "Fixture payee " + suffix, purpose: "Payee access check", expenses: [],
  payee_profile_id: payee.id,
};
const payeeDraft = await command(claimant.client, "save_draft", payeeDraftPayload);
check((await snapshot(claimant.client)).claims.find(c => c.id === payeeDraft.id).claimant_id === payee.id, "Payee creator can save a claim for the payee");
const unauthorizedPayeeDraft = await outsider.client.rpc("nlcc_command", { action: "save_draft", payload: { ...payeeDraftPayload, request_key: randomUUID() } });
check(unauthorizedPayeeDraft.error?.code === "42501", "Unrelated user cannot create a claim for another account's payee");
const category = (await snapshot(claimant.client)).categories[0];
const path = claimant.id + "/" + randomUUID() + "/receipt.png";
const bytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");
assert.ifError((await claimant.client.storage.from("receipts").upload(path, bytes, { contentType: "image/png" })).error);
check(!!(await outsider.client.storage.from("receipts").download(path)).error, "Unrelated receipt download denied");
const payload = {
  request_key: randomUUID(), ministry_id: ministry.id, claimant_name: "Integration Claimant",
  claim_date: "2026-09-10", purpose: "Transport", payment_method: "PERSONAL_REIMBURSEMENT", declaration_accepted: true,
  expenses: [{ temp_id: "receipt-1", expense_date: "2026-09-10", expense_category_id: category.id, description: "Travel", amount: 25.50, sort_order: 1 }],
  attachments: [{ expense_temp_id: "receipt-1", storage_path: path, original_filename: "receipt.png", file_category: "RECEIPT" }],
};
await denied(claimant.client, "submit_claim", { ...payload, attachments: [] });
await denied(claimant.client, "submit_claim", { ...payload, expenses: undefined });
await denied(claimant.client, "submit_claim", { ...payload, expenses: null });
await denied(admin.client, "setting", { key: "approval_thresholds", value: {} });
await denied(admin.client, "setting", { key: "claim_form_config", value: {} });
const saved = await command(claimant.client, "submit_claim", { ...payload, total_amount: 1, claimant_id: outsider.id });
let claim = (await snapshot(claimant.client)).claims.find(c => c.id === saved.id);
check(claim.total_amount === 25.5 && claim.claimant_id === claimant.id, "Totals and actor computed on server");
check((await command(claimant.client, "submit_claim", payload)).id === saved.id, "Submission retries are idempotent");
check(!(await snapshot(outsider.client)).claims.some(c => c.id === saved.id), "Another claimant cannot read the claim");
check(!(await snapshot(leader.client)).claims.some(c => c.id === saved.id), "A ministry contact has no access to another claimant's submission");
await denied(outsider.client, "approve", { claim_id: saved.id, version: claim.version });
await denied(claimant.client, "approve", { claim_id: saved.id, version: claim.version });
await transition(finance.client, "return", saved.id, { reason: "Clarify purpose" });
claim = (await snapshot(claimant.client)).claims.find(c => c.id === saved.id);
await command(claimant.client, "submit_claim", { ...payload, id: saved.id, version: claim.version, purpose: "Corrected transport purpose" });
claim = (await snapshot(finance.client)).claims.find(c => c.id === saved.id);
check(claim.status === "PENDING_FINANCE_REVIEW", "Submission goes directly to finance");
await denied(finance.client, "approve", { claim_id: saved.id, version: claim.version });
await transition(finance.client, "verify", saved.id, { reason: "Verified against receipt" });
claim = (await snapshot(finance.client)).claims.find(c => c.id === saved.id);
const approvals = await Promise.all([1,2].map(() => finance.client.rpc("nlcc_command", { action: "approve", payload: { claim_id: saved.id, version: claim.version } })));
check(approvals.filter(r => !r.error).length === 1, "Concurrent approval succeeds once");
await transition(finance.client, "comment", saved.id, { content: "Internal note", visibility: "FINANCE_INTERNAL" });
check(!(await snapshot(claimant.client)).claims.find(c => c.id === saved.id).comments.some(c => c.content === "Internal note"), "Internal notes stay private");
claim = (await snapshot(finance.client)).claims.find(c => c.id === saved.id);
await denied(finance.client, "pay", { claim_id: saved.id, version: claim.version, amount: 1, payment_reference: "WRONG", payment_date: "2026-09-10", payment_method: "BANK_TRANSFER" });
const payment = { claim_id: saved.id, version: claim.version, amount: 25.5, payment_reference: "TEST-" + suffix, payment_date: "2026-09-10", payment_method: "BANK_TRANSFER" };
const payments = await Promise.all([1,2].map(() => finance.client.rpc("nlcc_command", { action: "pay", payload: payment })));
check(payments.filter(p => !p.error).length === 1, "Concurrent payment is recorded once");
check((await snapshot(claimant.client)).claims.find(c => c.id === saved.id).status === "PAID", "Paid status is visible to claimant");
check(!!(await claimant.client.from("audit_logs").insert({ action: "FAKE" })).error, "Audit forgery denied");
check((await snapshot(admin.client)).auditLogs.some(a => a.entity_id === saved.id), "Audit records exist");
console.log("PASS: " + assertions + " production backend assertions, including concurrent approval/payment and receipt isolation.");
console.log("Local integration fixtures retained with suffix " + suffix + " for inspection.");
