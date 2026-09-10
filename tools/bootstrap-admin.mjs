import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const [projectRef, email] = process.argv.slice(2);
assert.match(projectRef || "", /^[a-z]{20}$/, "Supply the confirmed Supabase project reference.");
assert.match(email || "", /^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Supply the administrator email.");

// Keep privileged credentials in memory; never print them or pass them in command arguments.
const keys = JSON.parse(execFileSync("supabase", ["projects", "api-keys", "--project-ref", projectRef, "-o", "json"], {
  encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
}));
const key = keys.find(k => k.name === "service_role")?.api_key;
assert.ok(key, "The CLI account cannot retrieve this project's server key.");
const client = createClient(`https://${projectRef}.supabase.co`, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data: role, error: roleError } = await client.from("roles").select("id").eq("code", "SYSTEM_ADMIN").single();
assert.ifError(roleError);
const { data: admins, error: adminError } = await client.from("user_roles").select("user_id").eq("role_id", role.id);
assert.ifError(adminError);
let user;
for (let page = 1; ; page++) {
  const { data, error } = await client.auth.admin.listUsers({ page, perPage: 100 });
  assert.ifError(error);
  user = data.users.find(u => u.email?.toLowerCase() === email.toLowerCase());
  if (user || data.users.length < 100) break;
}
assert.ok(!admins.length || admins.some(a => a.user_id === user?.id), "An administrator already exists. Use the application's user management instead.");
if (!user) {
  // Activation must verify mailbox ownership; do not set a shared password or auto-confirm email.
  const { data, error } = await client.auth.admin.createUser({ email, email_confirm: false });
  assert.ifError(error);
  user = data.user;
}
const { error } = await client.from("user_roles").upsert({ user_id: user.id, role_id: role.id }, { onConflict: "user_id,role_id" });
assert.ifError(error);
const { data: grant, error: verifyError } = await client.from("user_roles").select("user_id").eq("user_id", user.id).eq("role_id", role.id).single();
assert.ifError(verifyError);
assert.equal(grant.user_id, user.id);
console.log(`Administrator provisioned: ${email}. Email verified: ${Boolean(user.email_confirmed_at)}. No email sent or password assigned.`);
