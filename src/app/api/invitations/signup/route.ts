import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/mock-db/repository";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashToken } from "@/lib/utils/token";

const signupSchema = z.object({
  token: z.string().min(1),
  email: z.string().email().max(254),
  password: z.string().min(8, "Password must be at least 8 characters long"),
  fullName: z.string().optional(),
  name: z.string().optional(),
}).strict();

export async function POST(request: NextRequest) {
  try {
    const text = await request.text();
    const body = signupSchema.parse(JSON.parse(text));
    const fullName = (body.fullName || body.name || "").trim();

    // Try Supabase admin if available
    try {
      const admin = createAdminClient();
      const tokenHash = hashToken(body.token);
      const { data: invitation, error: invError } = await admin
        .from("signup_invitations")
        .select("*")
        .eq("token_hash", tokenHash)
        .eq("is_active", true)
        .single();

      if (invError || !invitation) {
        return NextResponse.json({ error: "Invalid or expired invitation token." }, { status: 400 });
      }

      if (new Date(invitation.expires_at).getTime() < Date.now()) {
        return NextResponse.json({ error: "Invitation token has expired." }, { status: 400 });
      }

      if (invitation.use_count >= invitation.max_uses) {
        return NextResponse.json({ error: "Invitation token has already been used." }, { status: 400 });
      }

      // Create Supabase Auth user
      const { data: authUser, error: createError } = await admin.auth.admin.createUser({
        email: body.email,
        password: body.password,
        email_confirm: true,
        user_metadata: fullName ? { full_name: fullName } : undefined,
      });

      if (createError || !authUser.user) {
        return NextResponse.json({ error: createError?.message || "Unable to create account." }, { status: 400 });
      }

      // Set user role and ministry
      const { data: roleRow } = await admin.from("roles").select("id").eq("code", invitation.role_code).single();
      if (roleRow) {
        await admin.from("user_roles").upsert({
          user_id: authUser.user.id,
          role_id: roleRow.id,
        });
      }

      // Update profile
      await admin.from("profiles").update({
        full_name: fullName || undefined,
        ministry_id: invitation.ministry_id || null,
        default_ministry_id: invitation.ministry_id || null,
        onboarding_completed_at: null, // User still needs onboarding for bank/phone if applicable
      }).eq("id", authUser.user.id);

      // Increment use count
      await admin.from("signup_invitations").update({
        use_count: invitation.use_count + 1,
        last_used_at: new Date().toISOString(),
        is_active: invitation.use_count + 1 < invitation.max_uses,
      }).eq("id", invitation.id);

      return NextResponse.json({ success: true, email: body.email });
    } catch {
      // Fallback to mock DB in dev/demo
    }

    // Mock DB Fallback
    const validation = db.validateSignupInvitation(body.token);
    if (!validation.valid || !validation.invitation) {
      return NextResponse.json({ error: validation.reason || "Invalid invitation token." }, { status: 400 });
    }

    // Check if email already exists
    const existing = db.getProfileByEmail(body.email);
    if (existing) {
      return NextResponse.json({ error: "An account with this email address already exists." }, { status: 400 });
    }

    // Create mock profile
    const newUserId = `u-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();
    const newProfile = {
      id: newUserId,
      email: body.email,
      full_name: fullName,
      phone: null,
      ministry_id: validation.invitation.ministry_id || null,
      default_ministry_id: validation.invitation.ministry_id || null,
      status: "ACTIVE" as const,
      onboarding_completed_at: null,
      roles: [validation.invitation.role_code],
      created_at: now,
      updated_at: now,
    };

    db.getProfiles().push(newProfile);
    db.consumeSignupInvitation(body.token, newUserId);

    return NextResponse.json({ success: true, user_id: newUserId, email: body.email });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Invalid signup request." }, { status: 400 });
  }
}
