import { NextRequest, NextResponse } from "next/server";
import { hasSameRequestOrigin } from "@/lib/utils/request-origin";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashToken } from "@/lib/utils/token";

const signupSchema = z.object({
  token: z.string().min(1).max(256), email: z.string().email().max(254),
  password: z.string().min(8, "Password must be at least 8 characters long").max(128),
  fullName: z.string().trim().max(150).optional(), name: z.string().trim().max(150).optional(),
  is_multi_user: z.boolean().optional(), // Accepted from older signup pages. The invitation decides.
}).strict();
const headers = { "Cache-Control": "private, no-store" };
export async function POST(request: NextRequest) {
  if (!hasSameRequestOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403, headers });
  try {
    const text = await request.text();
    if (text.length > 16384) return NextResponse.json({ error: "Request is too large." }, { status: 413, headers });
    let json;
    try { json = JSON.parse(text); } catch { return NextResponse.json({ error: "Invalid signup request." }, { status: 400, headers }); }
    const parsed = signupSchema.safeParse(json);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400, headers });
    const body = parsed.data;
    const fullName = (body.fullName || body.name || "").trim();
    const admin = createAdminClient();
    const tokenHash = hashToken(body.token);
    const { data: invitation, error: invitationError } = await admin.from("signup_invitations")
      .select("id,expires_at,use_count,max_uses,is_active").eq("token_hash", tokenHash).maybeSingle();
    if (invitationError) throw invitationError;
    if (!invitation || !invitation.is_active || new Date(invitation.expires_at).getTime() <= Date.now() || invitation.use_count >= invitation.max_uses) {
      return NextResponse.json({ error: "Invitation is invalid, expired, or fully used." }, { status: 400, headers });
    }
    const { data, error } = await admin.auth.admin.createUser({
      email: body.email, password: body.password, email_confirm: true,
      user_metadata: fullName ? { full_name: fullName } : undefined,
    });
    if (error || !data.user) return NextResponse.json({ error: error?.message || "Unable to create account." }, { status: 400, headers });
    const provision = await admin.rpc("nlcc_redeem_invitation", { token_hash: tokenHash, user_id: data.user.id });
    if (provision.error) {
      // Do not leave an unprovisioned account after a concurrent use/revocation or database failure.
      const cleanup = await admin.auth.admin.deleteUser(data.user.id);
      if (cleanup.error) console.error("Invitation account cleanup failed", { userId: data.user.id, code: cleanup.error.code });
      if (provision.error.message === "This invitation is invalid, expired, or fully used") {
        return NextResponse.json({ error: "This invitation is invalid, expired, or already used." }, { status: 400, headers });
      }
      return NextResponse.json({ error: "Account setup could not be completed. Check the invitation and try again." }, { status: 400, headers });
    }
    return NextResponse.json({ success: true, email: body.email }, { headers });
  } catch {
    return NextResponse.json({ error: "Account setup is unavailable. Please try again." }, { status: 503, headers });
  }
}
