import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// Explicit local-only target. Never reads application production env files.
const api = process.env.HG_V2_TEST_URL || "http://127.0.0.1:58321";
assert.match(api, /^http:\/\/(127\.0\.0\.1|localhost):58321$/);
const anon =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const serviceKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const service = createClient(api, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const suffix = randomUUID().slice(0, 8),
  password = randomUUID() + "!9aA";
const users = {};
let count = 0;
function check(test, message) {
  assert.ok(test, message);
  count++;
  console.log("PASS " + message);
}
async function cmd(user, action, payload = {}) {
  const { data, error } = await user.client.rpc("nlcc_command", {
    action,
    payload,
  });
  assert.ifError(error);
  return data;
}
async function denied(user, action, payload = {}) {
  const { error } = await user.client.rpc("nlcc_command", { action, payload });
  check(!!error, `denied ${action}`);
}
async function snap(user) {
  const { data, error } = await user.client.rpc("nlcc_snapshot");
  assert.ifError(error);
  return data;
}
async function detail(user, id) {
  const { data, error } = await user.client.rpc("nlcc_claim_detail", {
    p_claim_id: id,
  });
  assert.ifError(error);
  return data.claim;
}
async function transition(user, action, id, data = {}) {
  const c = await detail(user, id);
  return cmd(user, action, { claim_id: id, version: c.version, ...data });
}
function sql(query) {
  return execFileSync(
    "docker",
    [
      "exec",
      "-i",
      "supabase_db_hg-claims-v2-test",
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-At",
    ],
    { input: query, encoding: "utf8" },
  ).trim();
}
for (const [name, roles] of Object.entries({
  member: [],
  outsider: [],
  lead: ["TEAM_LEAD"],
  finance: ["FINANCE"],
  both: ["FINANCE", "TEAM_LEAD"],
})) {
  const email = `v2-${name}-${suffix}@test.invalid`;
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: `V2 ${name}` },
  });
  assert.ifError(error);
  for (const role of roles) {
    const { data: r, error: re } = await service
      .from("roles")
      .select("id")
      .eq("code", role)
      .single();
    assert.ifError(re);
    assert.ifError(
      (
        await service
          .from("user_roles")
          .insert({ user_id: data.user.id, role_id: r.id })
      ).error,
    );
  }
  const client = createClient(api, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  assert.ifError(
    (await client.auth.signInWithPassword({ email, password })).error,
  );
  users[name] = { id: data.user.id, email, client };
  await cmd(users[name], "complete_onboarding", { full_name: `V2 ${name}` });
  await cmd(users[name], "profile", {
    id: data.user.id,
    data: {
      full_name: `V2 ${name}`,
      bank_code: "MBBEMYKL",
      bank_account_holder_name: `V2 ${name}`,
      bank_account_number: "001234567890",
    },
  });
}
const { member, outsider, lead, finance, both } = users;
check(
  (await snap(member)).profiles.find((p) => p.id === member.id).roles.length ===
    0,
  "member has no privileged role and loads workspace",
);
const team = await cmd(finance, "master_save", {
  table: "ministries",
  data: { code: "V2-" + suffix, name: "Test Team" },
});
const otherTeam = await cmd(finance, "master_save", {
  table: "ministries",
  data: { code: "OT-" + suffix, name: "Other Team" },
});
await cmd(finance, "set_ministry_team_leads", {
  ministry_id: team.id,
  user_ids: [lead.id, both.id],
});
sql(
  `INSERT INTO public.ministry_budgets(ministry_id,year,amount) VALUES('${team.id}',2026,1),('${otherTeam.id}',2026,500);`,
);
check(
  !(await snap(member)).ministries.find((t) => t.id === team.id).budgets,
  "member budget snapshot hidden",
);
check(
  !(await member.client.from("ministry_budgets").select("*")).data?.length,
  "member direct budget rows hidden",
);
check(
  (await snap(lead)).ministries.find((t) => t.id === team.id).budgets.length ===
    1,
  "assigned lead sees budget",
);
check(
  !(await snap(lead)).ministries.find((t) => t.id === otherTeam.id).budgets,
  "lead cannot see other team budgets",
);
const cats = (await snap(member)).categories;
const cat = (code) => cats.find((c) => c.code === code).id;
const payload = {
  request_key: randomUUID(),
  payee_profile_id: member.id,
  claimant_name: "Preserved Payee",
  claimant_email: member.email,
  claimant_phone: "0123456789",
  bank_code: "MBBEMYKL",
  bank_account_holder_name: "Preserved Payee",
  bank_account_number: "001234567890",
  ministry_id: team.id,
  claim_date: "2026-11-10",
  purpose: "",
  expenses: [
    {
      temp_id: "e1",
      expense_date: "2026-11-10",
      expense_category_id: cat("V2_UTILITIES"),
      description: "",
      amount: 25.5,
      sort_order: 1,
    },
  ],
  attachments: [],
};
const draft = await cmd(member, "save_draft", {
  ...payload,
  request_key: randomUUID(),
  expenses: [],
  ministry_id: undefined,
});
check(
  (await detail(member, draft.id)).status === "DRAFT",
  "roleless member saves incomplete draft",
);
const submitted = await cmd(member, "submit_claim", payload);
check(
  (await detail(member, submitted.id)).status === "PENDING_FINANCE_REVIEW",
  "approval off routes directly to Finance without receipts or descriptions",
);
check(
  !(await snap(outsider)).claims.some((c) => c.id === submitted.id),
  "selecting Team grants no access",
);
await denied(outsider, "approve", { claim_id: submitted.id, version: 1 });
await denied(lead, "approve", {
  claim_id: submitted.id,
  version: (await detail(lead, submitted.id)).version,
});
await denied(member, "profile", {
  id: member.id,
  data: { roles: ["FINANCE"] },
});
await denied(finance, "correct", {
  claim_id: submitted.id,
  version: (await detail(finance, submitted.id)).version,
  amount: 1,
  reason: "x",
});
await denied(finance, "correct", {
  claim_id: submitted.id,
  version: (await detail(finance, submitted.id)).version,
  payee_profile_id: finance.id,
  reason: "x",
});
await transition(finance, "correct", submitted.id, {
  reason: "classification",
  expenses: [
    {
      id: (await detail(finance, submitted.id)).expenses[0].id,
      expense_category_id: cat("V2_OTHER"),
      description: "A",
    },
  ],
});
check(
  Number(
    sql(
      `SELECT count(*) FROM public.claim_classification_changes WHERE claim_id='${submitted.id}'`,
    ),
  ) >= 2,
  "classification field old/new values audited",
);
await transition(finance, "return", submitted.id, { reason: "Clarify" });
let c = await detail(member, submitted.id);
await cmd(member, "submit_claim", {
  ...payload,
  id: c.id,
  version: c.version,
  request_key: undefined,
});
await transition(finance, "approve", submitted.id);
c = await detail(member, submitted.id);
check(
  c.status === "APPROVED_FOR_PAYMENT" && !c.payment,
  "Finance approval is separate from completed payment",
);
check(
  (await detail(finance, c.id)).payee_verification_required,
  "unverified details warn Finance",
);
await transition(finance, "verify_claim_payment", c.id);
check(
  !(await detail(finance, c.id)).payee_verification_required,
  "verification clears relevant claim warning",
);
const approved2 = await cmd(member, "submit_claim", {
  ...payload,
  request_key: randomUUID(),
});
await transition(finance, "approve", approved2.id);
const batch = await cmd(finance, "finalize_reimbursement_batch", {
  claim_ids: [c.id, approved2.id],
  request_key: randomUUID(),
});
let b = (await snap(finance)).reimbursementBatches.find(
  (b) => b.id === batch.id,
);
check(
  b.instructions.length === 1 && b.total_amount === 51,
  "same bank payee claims aggregate in real database",
);
check(
  b.content_digest_sha256.length === 64,
  "server creates SHA-256 batch fingerprint",
);
check(
  b.instructions[0].beneficiary_account_number === "001234567890",
  "frozen encrypted account decrypts for export",
);
await denied(finance, "finalize_reimbursement_batch", {
  claim_ids: [c.id],
  request_key: randomUUID(),
});
await cmd(finance, "record_batch_export", {
  batch_id: b.id,
  file_hash_sha256: "a".repeat(64),
  filename: "fixture.xls",
});
check(
  (await detail(member, c.id)).status === "APPROVED_FOR_PAYMENT",
  "export never marks Processed",
);
await cmd(finance, "void_reimbursement_batch", {
  batch_id: b.id,
  void_reason: "Bank upload cancelled",
});
check(
  !(await detail(member, c.id)).active_batch_id,
  "void releases approved claims",
);
// Optional Team Lead stage, self-bypass and combined roles.
await cmd(finance, "master_save", {
  table: "ministries",
  id: team.id,
  data: { require_team_lead_approval: true },
});
const pendingLead = await cmd(member, "submit_claim", {
  ...payload,
  request_key: randomUUID(),
});
check(
  (await detail(lead, pendingLead.id)).status === "PENDING_MINISTRY_APPROVAL",
  "enabled team routes to Team Lead",
);
await transition(both, "approve", pendingLead.id);
check(
  (await detail(member, pendingLead.id)).status === "PENDING_FINANCE_REVIEW",
  "combined Finance/Lead user completes only Team Lead stage",
);
const self = await cmd(lead, "submit_claim", {
  ...payload,
  payee_profile_id: lead.id,
  request_key: randomUUID(),
});
check(
  (await detail(lead, self.id)).status === "PENDING_FINANCE_REVIEW",
  "Team Lead own submission skips team approval",
);
await denied(lead, "settings", { settings: [] });
await denied(finance, "master_save", {
  table: "ministries",
  id: otherTeam.id,
  data: { require_team_lead_approval: true },
});
await denied(member, "submit_claim", {
  ...payload,
  request_key: randomUUID(),
  expenses: [
    { ...payload.expenses[0], expense_category_id: cat("V2_MEMBER_CARE") },
  ],
});
await denied(member, "submit_claim", {
  ...payload,
  request_key: randomUUID(),
  expenses: [{ ...payload.expenses[0], expense_category_id: cat("V2_OTHER") }],
});
const contextTeam = await cmd(finance, "master_save", {
  table: "ministries",
  data: {
    code: "CTX-" + suffix,
    name: "Speakers & Guests",
    context_kind: "SPEAKER",
  },
});
await denied(member, "submit_claim", {
  ...payload,
  ministry_id: contextTeam.id,
  request_key: randomUUID(),
});
const contextClaim = await cmd(member, "submit_claim", {
  ...payload,
  ministry_id: contextTeam.id,
  context_kind: "SPEAKER",
  context_name: "Custom Speaker",
  request_key: randomUUID(),
});
check(
  (await detail(member, contextClaim.id)).context_name === "Custom Speaker",
  "custom context preserved",
);
// Reuse all eligible files; no overwrite of original rows or objects.
const bytes = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
  "base64",
);
const attachments = [];
for (let i = 0; i < 2; i++) {
  const path = `${member.id}/${randomUUID()}/receipt-${i}.png`;
  assert.ifError(
    (
      await member.client.storage
        .from("receipts")
        .upload(path, bytes, { contentType: "image/png" })
    ).error,
  );
  attachments.push({
    storage_path: path,
    original_filename: `receipt-${i}.png`,
    file_category: "RECEIPT",
  });
}
const original = await cmd(member, "submit_claim", {
  ...payload,
  request_key: randomUUID(),
  attachments,
});
await transition(lead, "approve", original.id);
await transition(finance, "approve", original.id);
const before = await detail(member, original.id);
const duplicate = await cmd(member, "duplicate_claim", {
  claim_id: original.id,
  request_key: randomUUID(),
});
let copied = await detail(member, duplicate.id);
check(
  copied.id !== before.id &&
    copied.status === "DRAFT" &&
    copied.total_amount === 0,
  "duplicate is independent empty Draft",
);
for (const field of [
  "claimant_id",
  "claimant_name",
  "claimant_email",
  "claimant_phone",
  "bank_name",
  "bank_code",
  "bank_account_holder_name",
  "bank_account_number",
])
  check(copied[field] === before[field], `duplicate preserves Part 1 ${field}`);
check(
  !copied.ministry_id &&
    !copied.purpose &&
    !copied.internal_reference &&
    !copied.context_name &&
    copied.expenses.length === 0,
  "duplicate clears all Part 2 fields",
);
check(
  copied.attachments.length === 2 &&
    copied.attachments.every((a) => !a.expense_id),
  "duplicate preserves multiple independent attachment rows",
);
check(
  !copied.approved_snapshot &&
    !copied.active_batch_id &&
    !copied.payment &&
    copied.approval_actions.length === 0,
  "duplicate clears reviews and payments",
);
assert.ifError(
  (
    await member.client.storage
      .from("receipts")
      .download(copied.attachments[0].storage_path)
  ).error,
);
await cmd(member, "save_draft", {
  ...payload,
  id: copied.id,
  version: copied.version,
  request_key: undefined,
  expenses: [],
  attachments: [copied.attachments[0]],
});
check(
  (await detail(member, original.id)).attachments.length === 2,
  "detaching duplicate file preserves original attachments",
);
await cmd(member, "delete_claim", { id: copied.id });
check(
  (await detail(member, original.id)).attachments.length === 2,
  "deleting duplicate preserves original",
);
// JomPAY separate non-aggregating frozen instructions and revision verification.
const payee = await cmd(finance, "create_payee_profile", {
  full_name: "TNB",
  payment_method: "JOMPAY",
  jompay_biller_name: "TNB",
  jompay_biller_code: "000123",
  jompay_reference_1: "0000456",
  jompay_reference_2: "0007",
});
let prof = (await snap(finance)).profiles.find((p) => p.id === payee.id);
check(
  prof.is_payee_only && prof.payment_method === "JOMPAY",
  "JomPAY is a directory payee, not an app user",
);
check(
  Number(sql(`SELECT count(*) FROM auth.users WHERE id='${payee.id}'`)) === 0,
  "JomPAY payee creates no Auth user",
);
await denied(finance, "verify_payee", {
  id: payee.id,
  payment_revision: prof.payment_revision,
});
await denied(member, "create_payee_profile", {
  id: payee.id,
  full_name: "TNB",
  payment_method: "JOMPAY",
  jompay_biller_name: "TNB",
  jompay_biller_code: "000123",
  jompay_reference_1: "0000456",
});
const bills = [];
for (let i = 0; i < 2; i++) {
  const b = await cmd(member, "submit_claim", {
    ...payload,
    payee_profile_id: payee.id,
    request_key: randomUUID(),
  });
  await transition(lead, "approve", b.id);
  await transition(finance, "approve", b.id);
  check(
    !(await detail(finance, b.id)).payee_verification_required,
    "JomPAY claim has no verification requirement",
  );
  bills.push(b.id);
}
await denied(finance, "finalize_reimbursement_batch", {
  claim_ids: bills,
  request_key: randomUUID(),
});
const jb = await cmd(finance, "finalize_jompay_batch", {
  claim_ids: bills,
  request_key: randomUUID(),
});
b = (await snap(finance)).reimbursementBatches.find((b) => b.id === jb.id);
check(
  b.instructions.length === 2 && b.payment_method === "JOMPAY",
  "JomPAY never aggregates same-payee bills",
);
check(
  b.instructions[0].jompay_snapshot.biller_code === "000123" &&
    b.instructions[0].jompay_snapshot.reference_1 === "0000456",
  "JomPAY leading zeros frozen as text",
);
check(
  b.template_version === "JOMPAY_BULK_B1_XLSX_V1",
  "new JomPAY batch selects supplied B1 XLSX template",
);
// Simulate a batch frozen before this follow-up migration; preserve its fingerprint.
sql(
  `UPDATE public.reimbursement_batches SET template_version='JOMPAY_TEMPLATE_PENDING' WHERE id='${jb.id}';`,
);
await denied(finance, "record_batch_bank_upload", {
  batch_id: jb.id,
  bank_upload_reference: "Too early",
});
await denied(member, "record_batch_export", {
  batch_id: jb.id,
  file_hash_sha256: "b".repeat(64),
  filename: "local.xlsx",
  template_version: "JOMPAY_BULK_B1_XLSX_V1",
});
await denied(finance, "record_batch_export", {
  batch_id: jb.id,
  file_hash_sha256: "b".repeat(64),
  filename: "local.xlsx",
  template_version: "UNKNOWN",
});
await denied(finance, "record_batch_export", {
  batch_id: jb.id,
  file_hash_sha256: "b".repeat(64),
  filename: "local.xls",
  template_version: "JOMPAY_BULK_B1_XLSX_V1",
});
await cmd(finance, "record_batch_export", {
  batch_id: jb.id,
  file_hash_sha256: "b".repeat(64),
  filename: "local.xlsx",
  template_version: "JOMPAY_BULK_B1_XLSX_V1",
});
check(
  (await detail(member, bills[0])).status === "APPROVED_FOR_PAYMENT",
  "JomPAY export leaves claim Approved",
);
const legacyJompay = (await snap(finance)).reimbursementBatches.find(
  (x) => x.id === jb.id,
);
check(
  legacyJompay.template_version === "JOMPAY_TEMPLATE_PENDING" &&
    legacyJompay.content_digest_sha256 === b.content_digest_sha256,
  "historical JomPAY export preserves original version and snapshot fingerprint",
);
await denied(finance, "record_batch_export", {
  batch_id: jb.id,
  file_hash_sha256: "c".repeat(64),
  filename: "local.xlsx",
  template_version: "JOMPAY_BULK_B1_XLSX_V1",
});
await denied(finance, "record_batch_bank_upload", { batch_id: jb.id });
await cmd(finance, "record_batch_bank_upload", {
  batch_id: jb.id,
  bank_upload_reference: "LOCAL-JOMPAY-UPLOAD",
});
check(
  (await detail(member, bills[0])).status === "APPROVED_FOR_PAYMENT",
  "JomPAY bank upload leaves claim Approved",
);
check(
  (await snap(finance)).reimbursementBatches.find((x) => x.id === jb.id)
    .status === "SUBMITTED_TO_BANK",
  "JomPAY upload tracked separately from payment completion",
);
await denied(finance, "setting", {
  key: "jompay_export_config",
  value: { fail_email_2: "invalid" },
});
await cmd(finance, "create_payee_profile", {
  id: payee.id,
  full_name: "TNB",
  payment_method: "JOMPAY",
  jompay_biller_name: "TNB",
  jompay_biller_code: "000999",
  jompay_reference_1: "0000888",
});
check(
  (await snap(finance)).profiles.find((p) => p.id === payee.id)
    .verified_payment_revision == null,
  "JomPAY revisions remain auditable without a verification stage",
);
check(
  (await snap(finance)).reimbursementBatches.find((x) => x.id === jb.id)
    .instructions[0].jompay_snapshot.biller_code === "000123",
  "payee changes do not mutate frozen JomPAY batch",
);
await cmd(finance, "reconcile_batch_instruction", {
  instruction_id: b.instructions[0].id,
  outcome: "FAILED",
  failure_reason: "Rejected bill",
});
check(
  !(await detail(member, bills[0])).active_batch_id,
  "failed JomPAY instruction releases bill",
);
await cmd(finance, "void_reimbursement_batch", {
  batch_id: jb.id,
  void_reason: "No upload",
});
check(
  !(await detail(member, bills[1])).active_batch_id,
  "void JomPAY releases remaining bill",
);
// Finance self-approval and explicit payment confirmation.
const own = await cmd(finance, "submit_claim", {
  ...payload,
  payee_profile_id: finance.id,
  ministry_id: otherTeam.id,
  request_key: randomUUID(),
});
await transition(finance, "approve", own.id);
check(
  (await detail(finance, own.id)).approved_by === finance.id,
  "Finance self approval records identity",
);
await transition(finance, "pay", own.id, {
  amount: 25.5,
  payment_date: "2026-11-10",
  payment_method: "BANK_TRANSFER",
  payment_reference: "Confirmed local test",
});
check(
  (await detail(finance, own.id)).status === "PAID",
  "only confirmation creates completed payment status",
);
const paidCopy = await cmd(finance, "duplicate_claim", {
  claim_id: own.id,
  request_key: randomUUID(),
});
check(
  (await detail(finance, paidCopy.id)).status === "DRAFT",
  "Processed claim duplicates to Draft",
);
// Recurrence with exact boundaries, shorter February, retry and missed-run catchup.
const schedule = await cmd(finance, "save_recurring_payment", {
  utility: "TNB",
  payee_id: payee.id,
  ministry_id: otherTeam.id,
  amount_mode: "VARIABLE",
  due_day: 31,
  start_date: "2027-02-01",
  end_date: "2027-03-31",
});
sql(`SELECT private.run_recurring_payments('2027-02-13');`);
check(
  Number(
    sql(
      `SELECT count(*) FROM public.recurring_billing_periods WHERE schedule_id='${schedule.id}'`,
    ),
  ) === 0,
  "no draft before 14-day window",
);
sql(
  `SELECT private.run_recurring_payments('2027-02-14');SELECT private.run_recurring_payments('2027-02-14');`,
);
check(
  Number(
    sql(
      `SELECT count(*) FROM public.recurring_billing_periods WHERE schedule_id='${schedule.id}'`,
    ),
  ) === 1,
  "14-day generation and retries are idempotent",
);
const recurringId = sql(
  `SELECT claim_id FROM public.recurring_billing_periods WHERE schedule_id='${schedule.id}'`,
);
check(
  (await detail(finance, recurringId)).total_amount === 0,
  "variable recurring draft has no amount",
);
sql(
  `SELECT private.run_recurring_payments('2027-02-21');SELECT private.run_recurring_payments('2027-02-22');`,
);
check(
  Number(
    sql(
      `SELECT count(*) FROM public.notifications WHERE claim_id='${recurringId}' AND type='RECURRING_AMOUNT_REMINDER'`,
    ),
  ) ===
    Number(
      sql(
        `SELECT count(*) FROM public.profiles pr JOIN public.user_roles ur ON ur.user_id=pr.id JOIN public.roles r ON r.id=ur.role_id WHERE pr.status='ACTIVE' AND r.code='FINANCE'`,
      ),
    ),
  "7-day reminder delivered once per Finance user",
);
sql(`SELECT private.run_recurring_payments('2027-05-01');`);
check(
  Number(
    sql(
      `SELECT count(*) FROM public.recurring_billing_periods WHERE schedule_id='${schedule.id}'`,
    ),
  ) === 2,
  "missed March caught up and end date respected",
);
// Fixed bills prefill their configured amount; prior-period amount remains available.
const unifi = await cmd(finance, "create_payee_profile", {
  full_name: "Unifi",
  payment_method: "JOMPAY",
  jompay_biller_name: "Unifi",
  jompay_biller_code: "000987",
  jompay_reference_1: "000" + Date.now(),
});
const fixed = await cmd(finance, "save_recurring_payment", {
  utility: "Unifi",
  payee_id: unifi.id,
  ministry_id: otherTeam.id,
  amount_mode: "FIXED",
  fixed_amount: 129.9,
  due_day: 1,
  start_date: "2027-06-01",
  end_date: "2027-07-01",
});
sql(`SELECT private.run_recurring_payments('2027-05-18');`);
const fixedId = sql(
  `SELECT claim_id FROM public.recurring_billing_periods WHERE schedule_id='${fixed.id}'`,
);
check(
  (await detail(finance, fixedId)).total_amount === 129.9,
  "fixed recurring amount prefilled across month boundary",
);
let recurring = await detail(finance, recurringId);
await cmd(both, "save_draft", {
  ...payload,
  id: recurring.id,
  version: recurring.version,
  payee_profile_id: payee.id,
  ministry_id: otherTeam.id,
  request_key: undefined,
  expenses: [{ ...payload.expenses[0], amount: 150 }],
});
const nextPeriod = sql(
  `SELECT claim_id FROM public.recurring_billing_periods WHERE schedule_id='${schedule.id}' ORDER BY due_date DESC LIMIT 1`,
);
check(
  (await detail(finance, nextPeriod)).recurring_previous_amount === 150,
  "next variable bill shows last month amount",
);
check(
  (await detail(both, recurring.id)).total_amount === 150,
  "another Finance user can review scheduled Draft",
);
// Bank detail revisions, verification races and scheduler invocation permissions.
const supplier = await cmd(member, "create_payee_profile", {
  full_name: "Bank supplier " + suffix,
  phone: "+60123456789",
  bank_code: "MBBEMYKL",
  bank_account_holder_name: "Supplier",
  bank_account_number: "000123456789",
});
let supplierProfile = (await snap(finance)).profiles.find(
  (p) => p.id === supplier.id,
);
await cmd(finance, "verify_payee", {
  id: supplier.id,
  payment_revision: supplierProfile.payment_revision,
});
await cmd(member, "create_payee_profile", {
  id: supplier.id,
  full_name: "Bank supplier " + suffix,
  bank_code: "MBBEMYKL",
  bank_account_holder_name: "Supplier",
  bank_account_number: "000987654321",
});
check(
  (await snap(finance)).profiles.find((p) => p.id === supplier.id)
    .verified_payment_revision == null,
  "changed bank account returns to Unverified",
);
await denied(finance, "verify_payee", {
  id: supplier.id,
  payment_revision: supplierProfile.payment_revision,
});
await denied(member, "run_recurring_payments");
check(
  !(await detail(lead, bills[0])).jompay_details &&
    !(await detail(lead, bills[0])).claimant.jompay_reference_1,
  "Team Lead receives no nested JomPAY references",
);
const duplicateKey = randomUUID();
const duplicateResults = await Promise.all(
  [1, 2].map(() =>
    cmd(member, "duplicate_claim", {
      claim_id: original.id,
      request_key: duplicateKey,
    }),
  ),
);
check(
  duplicateResults[0].id === duplicateResults[1].id,
  "concurrent duplicate retries create one Draft",
);
const submittedCopy = await cmd(member, "duplicate_claim", {
  claim_id: pendingLead.id,
  request_key: randomUUID(),
});
check(
  (await detail(member, submittedCopy.id)).status === "DRAFT",
  "Submitted claim duplicates to independent Draft",
);
const anonClient = createClient(api, anon, { auth: { persistSession: false } });
check(
  !!(await anonClient.rpc("nlcc_snapshot")).error,
  "anonymous workspace denied",
);
sql(
  `UPDATE auth.sessions SET created_at=now()-interval '2 hours' WHERE user_id='${outsider.id}'`,
);
check(
  !!(await outsider.client.rpc("nlcc_snapshot")).error,
  "expired session cannot load workspace",
);
await denied(outsider, "save_draft", {
  ...payload,
  payee_profile_id: outsider.id,
  request_key: randomUUID(),
});

// A corrected amount/payee must return to the owner and pass Finance again.
await transition(finance, "return", approved2.id, {
  reason: "Correct the payment details",
});
let correctionDraft = await detail(member, approved2.id);
check(
  correctionDraft.status === "RETURNED_FOR_CLARIFICATION" &&
    !correctionDraft.approved_snapshot,
  "approved unbatched claim returns for correction and invalidates approval snapshot",
);
await cmd(member, "submit_claim", {
  ...payload,
  id: correctionDraft.id,
  version: correctionDraft.version,
  request_key: undefined,
  bank_account_number: "000112233445",
  expenses: [{ ...payload.expenses[0], amount: 33 }],
});
await transition(lead, "approve", correctionDraft.id);
await transition(finance, "approve", correctionDraft.id);
check(
  (await detail(member, correctionDraft.id)).total_amount === 33,
  "owner corrections re-enter the normal approval workflow",
);
// A duplicate retains Part 1 even when the managed payee has changed since the original.
const jompayCopy = await cmd(member, "duplicate_claim", {
  claim_id: bills[0],
  request_key: randomUUID(),
});
let jompayCopyClaim = await detail(finance, jompayCopy.id);
await cmd(member, "save_draft", {
  ...payload,
  id: jompayCopy.id,
  version: jompayCopyClaim.version,
  request_key: undefined,
  payee_profile_id: payee.id,
});
jompayCopyClaim = await detail(finance, jompayCopy.id);
check(
  jompayCopyClaim.jompay_details.reference_1 === "0000456",
  "duplicate payee snapshot survives saving after directory changes",
);
await cmd(member, "save_draft", {
  ...payload,
  id: jompayCopy.id,
  version: jompayCopyClaim.version,
  request_key: undefined,
  payee_profile_id: payee.id,
  refresh_payee_details: true,
});
check(
  (await detail(finance, jompayCopy.id)).jompay_details.reference_1 ===
    "0000888",
  "supplier details refresh only on explicit request",
);
const financeDomain = await finance.client.rpc("nlcc_domain_snapshot", {
  p_domain: "finance",
});
assert.ifError(financeDomain.error);
check(
  financeDomain.data.claims.some((c) => c.id === correctionDraft.id),
  "Finance refresh includes fresh authorized claim state",
);

// Whole-batch completion must never settle a previously failed transfer.
const mixedClaims = [];
for (const account of ["001234567890", "000987654322"]) {
  const r = await cmd(finance, "submit_claim", {
    ...payload,
    payee_profile_id: finance.id,
    ministry_id: otherTeam.id,
    bank_account_number: account,
    request_key: randomUUID(),
  });
  await transition(finance, "approve", r.id);
  mixedClaims.push(r.id);
}
const mixedBatch = await cmd(finance, "finalize_reimbursement_batch", {
  claim_ids: mixedClaims,
  request_key: randomUUID(),
  mark_exported: true,
});
let mixed = (await snap(finance)).reimbursementBatches.find(
  (b) => b.id === mixedBatch.id,
);
check(
  mixed.status === "FINALIZED" && !mixed.exported_file_hash_sha256,
  "batch creation remains distinct from actual export",
);
check(
  mixed.instructions.length === 2,
  "distinct frozen bank destinations remain separate",
);
await cmd(finance, "reconcile_batch_instruction", {
  instruction_id: mixed.instructions[0].id,
  outcome: "FAILED",
  failure_reason: "Bank rejected destination",
});
await cmd(finance, "disburse_reimbursement_batch", {
  batch_id: mixed.id,
  bank_reference: "Local confirmed successful transfers",
  payment_date: "2026-11-10",
});
mixed = (await snap(finance)).reimbursementBatches.find(
  (b) => b.id === mixed.id,
);
check(
  mixed.status === "PARTIALLY_SETTLED" &&
    mixed.instructions.filter((i) => i.status === "PAID").length === 1 &&
    mixed.instructions.filter((i) => i.status === "FAILED").length === 1,
  "whole-batch confirmation preserves failed transfer outcome",
);
const failedLink = mixed.instructions.find((i) => i.status === "FAILED")
  .claims[0];
check(
  (await detail(finance, failedLink.claim_id)).status ===
    "APPROVED_FOR_PAYMENT",
  "failed claim stays Approved after other transfers complete",
);
await cmd(finance, "set_ministry_budget", {
  ministry_id: team.id,
  year: 2027,
  amount: 500,
});
check(
  (await snap(lead)).ministries
    .find((t) => t.id === team.id)
    .budgets.some((b) => b.year === 2027 && b.amount === 500),
  "existing Finance budget update remains supported",
);
const oldRole = await service
  .from("roles")
  .select("id")
  .eq("code", "CLAIMANT")
  .single();
assert.ifError(oldRole.error);
check(
  !!(
    await service
      .from("user_roles")
      .insert({ user_id: member.id, role_id: oldRole.data.id })
  ).error,
  "database rejects assigning legacy Claimant role",
);

check(
  !(await detail(member, bills[0])).jompay_details &&
    !(await detail(member, bills[0])).approved_snapshot,
  "submitting a managed supplier claim does not disclose private payment references",
);
// Reserve an independent two-bill batch for actual HTTP/UI workbook acceptance tests.
const browserJompayClaims = [];
for (let i = 0; i < 2; i++) {
  const bill = await cmd(member, "submit_claim", {
    ...payload,
    payee_profile_id: payee.id,
    request_key: randomUUID(),
  });
  await transition(lead, "approve", bill.id);
  await transition(finance, "approve", bill.id);
  browserJompayClaims.push(bill.id);
}
const browserJompayBatch = await cmd(finance, "finalize_jompay_batch", {
  claim_ids: browserJompayClaims,
  request_key: randomUUID(),
});
// Payment management: directory-only payees, concurrency, audit privacy and recurring validation.
const hist = await cmd(finance, "payment_detail_history", { id: supplier.id });
check(
  hist.changes.some(
    (h) =>
      h.changed_fields.includes("account") &&
      h.new_value.account === "****4321",
  ),
  "supplier history shows a masked, field-level account change",
);
check(
  !JSON.stringify(hist).includes("enc:") &&
    !JSON.stringify(hist).includes("000987654321"),
  "supplier history exposes no encrypted blobs or full account numbers",
);
await denied(member, "payment_detail_history", { id: supplier.id });
const refreshedSupplier = (await snap(finance)).profiles.find(
  (p) => p.id === supplier.id,
);
check(
  refreshedSupplier.phone === "+60123456789",
  "editing payment details preserves omitted supplier contact details",
);
await denied(finance, "create_payee_profile", {
  id: supplier.id,
  expected_payment_revision: supplierProfile.payment_revision,
  full_name: refreshedSupplier.full_name,
  payment_method: "BANK_TRANSFER",
  bank_code: "MBBEMYKL",
  bank_account_holder_name: "Supplier",
  bank_account_number: "000987654321",
});
const financeRole = await service
  .from("roles")
  .select("id")
  .eq("code", "FINANCE")
  .single();
check(
  !!(
    await service
      .from("user_roles")
      .insert({ user_id: payee.id, role_id: financeRole.data.id })
  ).error,
  "saved payees cannot receive a user role",
);
for (const badAmount of [null, "", "0", "1.234"])
  await denied(finance, "save_recurring_payment", {
    utility: "Unifi",
    payee_id: unifi.id,
    ministry_id: otherTeam.id,
    amount_mode: "FIXED",
    fixed_amount: badAmount,
    due_day: 1,
    start_date: "2099-01-01",
  });
await denied(finance, "save_recurring_payment", {
  utility: "Rent",
  payee_id: unifi.id,
  ministry_id: otherTeam.id,
  amount_mode: "FIXED",
  fixed_amount: "1",
  due_day: 1,
  start_date: "2099-01-01",
});
await denied(finance, "save_recurring_payment", {
  utility: "TNB",
  payee_id: payee.id,
  ministry_id: otherTeam.id,
  amount_mode: "VARIABLE",
  fixed_amount: "5",
  due_day: 1,
  start_date: "2099-01-01",
});
await denied(finance, "save_recurring_payment", {
  utility: "TNB",
  payee_id: payee.id,
  ministry_id: otherTeam.id,
  amount_mode: "VARIABLE",
  due_day: 32,
  start_date: "2099-01-01",
});
const lifePayee = await cmd(finance, "create_payee_profile", {
  full_name: "Utility account " + suffix,
  payment_method: "JOMPAY",
  jompay_biller_name: "TNB",
  jompay_biller_code: "000123",
  jompay_reference_1: "0009",
});
const lifeSchedule = await cmd(finance, "save_recurring_payment", {
  utility: "TNB",
  payee_id: lifePayee.id,
  ministry_id: otherTeam.id,
  amount_mode: "VARIABLE",
  due_day: 1,
  start_date: "2099-01-01",
});
check(
  !!lifeSchedule.id,
  "recurring bill binds an active JomPAY payee by stable ID, independent of display name",
);
await denied(finance, "profile", {
  id: lifePayee.id,
  data: { status: "INACTIVE" },
});
await denied(finance, "create_payee_profile", {
  id: lifePayee.id,
  full_name: "Utility account " + suffix,
  payment_method: "BANK_TRANSFER",
  bank_code: "MBBEMYKL",
  bank_account_holder_name: "Supplier",
  bank_account_number: "000123456789",
});
await denied(finance, "save_recurring_payment", {
  utility: "TNB",
  payee_id: lifePayee.id,
  ministry_id: otherTeam.id,
  amount_mode: "VARIABLE",
  due_day: 2,
  start_date: "2099-01-01",
});
await cmd(finance, "deactivate_recurring_payment", { id: lifeSchedule.id });
await cmd(finance, "profile", {
  id: lifePayee.id,
  data: { status: "INACTIVE" },
});
check(
  (await snap(finance)).profiles.find((p) => p.id === lifePayee.id).status ===
    "INACTIVE",
  "payee can be deactivated after its recurring schedule is stopped",
);
await cmd(finance, "save_recurring_payment", {
  id: fixed.id,
  utility: "Unifi",
  payee_id: unifi.id,
  ministry_id: otherTeam.id,
  amount_mode: "FIXED",
  fixed_amount: 139.9,
  due_day: 1,
  start_date: "2027-06-01",
  end_date: "2027-07-01",
});
check(
  (await detail(finance, fixedId)).total_amount === 129.9,
  "recurring edits do not rewrite previously generated bill amounts",
);
// Save local fixture credentials solely for browser QA, outside repository.
writeFileSync(
  "/private/tmp/hg-v2-browser-fixtures.json",
  JSON.stringify({
    api,
    anon,
    users: Object.fromEntries(
      Object.entries(users).map(([n, u]) => [
        n,
        { id: u.id, email: u.email, password },
      ]),
    ),
    team: team.id,
    claim: original.id,
    recurring: recurringId,
    jompayBatch: browserJompayBatch.id,
  }),
);
console.log(`PASS ${count} v2 backend assertions. Local fixtures: ${suffix}`);
