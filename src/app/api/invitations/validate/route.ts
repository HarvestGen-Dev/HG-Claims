import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/mock-db/repository";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashToken } from "@/lib/utils/token";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") || request.nextUrl.searchParams.get("invite");
  if (!token) {
    return NextResponse.json({ valid: false, error: "Invitation token is missing." }, { status: 400 });
  }

  // Try Supabase if configured
  try {
    const admin = createAdminClient();
    const tokenHash = hashToken(token);
    const { data: invitation, error } = await admin
      .from("signup_invitations")
      .select("*, ministry:ministries(id, name, code)")
      .eq("token_hash", tokenHash)
      .eq("is_active", true)
      .single();

    if (!error && invitation) {
      if (new Date(invitation.expires_at).getTime() < Date.now()) {
        return NextResponse.json({ valid: false, error: "Invitation link has expired." }, { status: 400 });
      }
      if (invitation.use_count >= invitation.max_uses) {
        return NextResponse.json({ valid: false, error: "Invitation link usage limit has been reached." }, { status: 400 });
      }

      return NextResponse.json({
        valid: true,
        role_code: invitation.role_code,
        ministry_id: invitation.ministry_id,
        ministry_name: invitation.ministry?.name || null,
        description: invitation.description,
      });
    }
  } catch {
    // Fallback to mock db
  }

  // Fallback to mock repository
  const result = db.validateSignupInvitation(token);
  if (!result.valid || !result.invitation) {
    return NextResponse.json({ valid: false, error: result.reason || "Invalid invitation token." }, { status: 400 });
  }

  return NextResponse.json({
    valid: true,
    role_code: result.invitation.role_code,
    ministry_id: result.invitation.ministry_id,
    ministry_name: result.invitation.ministry?.name || null,
    description: result.invitation.description,
  });
}
