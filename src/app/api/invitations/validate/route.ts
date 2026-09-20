import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashToken } from "@/lib/utils/token";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") || request.nextUrl.searchParams.get("invite");
  if (!token || token.length > 256) return NextResponse.json({ valid: false, error: "Invitation token is missing or invalid." }, { status: 400, headers });
  try {
    const { data: invitation, error } = await createAdminClient().from("signup_invitations")
      .select("role_code,ministry_id,description,expires_at,use_count,max_uses,is_active,ministry:ministries(name)")
      .eq("token_hash", hashToken(token)).maybeSingle();
    if (error) throw error;
    if (!invitation || !invitation.is_active || new Date(invitation.expires_at).getTime() <= Date.now() || invitation.use_count >= invitation.max_uses) {
      return NextResponse.json({ valid: false, error: "Invitation link is invalid, expired, or fully used." }, { status: 400, headers });
    }
    const ministry = invitation.ministry as unknown as { name?: string } | null;
    return NextResponse.json({ valid: true, role_code: invitation.role_code, ministry_id: invitation.ministry_id,
      ministry_name: ministry?.name || null, description: invitation.description }, { headers });
  } catch {
    return NextResponse.json({ valid: false, error: "Unable to validate the invitation. Please try again." }, { status: 503, headers });
  }
}
