import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const status = JSON.parse(execFileSync("supabase", ["status", "-o", "json", ...(process.env.NLCC_TEST_WORKDIR ? ["--workdir", process.env.NLCC_TEST_WORKDIR] : [])], { encoding: "utf8", stdio: ["ignore","pipe","ignore"] }));
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
for (const [name, role] of Object.entries({ admin: "SYSTEM_ADMIN", claimant: "CLAIMANT", leader: "MINISTRY_LEADER", outsider: "MINISTRY_LEADER", finance: "FINANCE_OFFICER", final: "FINAL_APPROVER" })) {
  const email = name + "-" + suffix + "@nlcc-test.invalid";
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: name } });
  assert.ifError(error);
  const { data: roleRow, error: roleError } = await service.from("roles").select("id").eq("code",role).single();
  assert.ifError(roleError);
  const grant = await service.from("user_roles").upsert({ user_id: data.user.id, role_id: roleRow.id }, { onConflict: "user_id,role_id" });
  assert.ifError(grant.error);
  const client = createClient(status.API_URL, status.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const login = await client.auth.signInWithPassword({ email, password });
  assert.ifError(login.error);
  // Exercise concurrent database requests without sharing the Auth client's session lock.
  const authenticated = createClient(status.API_URL, status.ANON_KEY, {
    accessToken: async () => login.data.session.access_token,
  });
  users[name] = { client: authenticated, id: data.user.id, email };
}
const { admin, claimant, leader, outsider, finance, final } = users;
check(!!(await anonymous.rpc("nlcc_snapshot")).error, "Anonymous snapshot denied");
check(!!(await claimant.client.from("claims").insert({ claimant_id: claimant.id })).error, "Direct claim writes denied");
check(!!(await claimant.client.rpc("instantiate_claim_workflow", { p_claim_id: randomUUID() })).error, "Legacy privileged RPC denied");
await denied(claimant.client, "master_save", { table: "ministries", data: { code: "ATTACK", name: "Attack" } });
await command(claimant.client, "profile", { id: claimant.id, data: { roles: ["SYSTEM_ADMIN"], status: "ACTIVE", bank_account_number: "123456789" } });
check(!(await snapshot(claimant.client)).profiles.find(p => p.id === claimant.id).roles.includes("SYSTEM_ADMIN"), "Self role elevation denied");
check(!(await snapshot(outsider.client)).profiles.find(p => p.id === claimant.id).bank_account_number, "Bank details hidden from unrelated user");

const ministry = await command(admin.client, "master_save", { table: "ministries", data: { code: "TEST-" + suffix, name: "Test ministry", leader_id: leader.id } });
const costCentre = await command(admin.client, "master_save", { table: "cost_centres", data: { code: "CC-" + suffix, name: "Test budget", ministry_id: ministry.id } });
const category = (await snapshot(claimant.client)).categories[0];
const path = claimant.id + "/" + randomUUID() + "/receipt.png";
const bytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");
assert.ifError((await claimant.client.storage.from("receipts").upload(path, bytes, { contentType: "image/png" })).error);
check(!!(await outsider.client.storage.from("receipts").download(path)).error, "Unrelated receipt download denied");
const payload = {
  request_key: randomUUID(), ministry_id: ministry.id, cost_centre_id: costCentre.id, programme_event: "Integration test",
  claim_date: "2026-09-10", purpose: "Transport", payment_method: "PERSONAL_REIMBURSEMENT", declaration_accepted: true,
  expenses: [{ expense_date: "2026-09-10", expense_category_id: category.id, description: "Travel", amount: 25.50, sort_order: 1 }],
  attachments: [{ storage_path: path, original_filename: "receipt.png", file_category: "RECEIPT" }],
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
check(!(await snapshot(outsider.client)).claims.some(c => c.id === saved.id), "Other ministry cannot read claim");
await denied(outsider.client, "approve", { claim_id: saved.id, version: claim.version });
await denied(claimant.client, "approve", { claim_id: saved.id, version: claim.version });
await transition(leader.client, "return", saved.id, { reason: "Clarify purpose" });
claim = (await snapshot(claimant.client)).claims.find(c => c.id === saved.id);
await command(claimant.client, "submit_claim", { ...payload, id: saved.id, version: claim.version, purpose: "Corrected transport purpose" });
claim = (await snapshot(leader.client)).claims.find(c => c.id === saved.id);
const approvals = await Promise.all([1,2].map(() => leader.client.rpc("nlcc_command", { action: "approve", payload: { claim_id: saved.id, version: claim.version } })));
check(approvals.filter(r => !r.error).length === 1, "Concurrent approval advances only one step");
claim = (await snapshot(finance.client)).claims.find(c => c.id === saved.id);
check(claim.status === "PENDING_FINANCE_REVIEW", "Finance follows leader");
await denied(finance.client, "approve", { claim_id: saved.id, version: claim.version });
await transition(finance.client, "verify", saved.id, { reason: "Verified against receipt" });
await transition(finance.client, "approve", saved.id);
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
