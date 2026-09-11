import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateSecureToken, hashToken } from "@/lib/utils/token";
import { db } from "@/lib/mock-db/repository";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

export async function GET() {
  try {
    const client = await createClient();
    const { data: { user }, error: authError } = await client.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Sign in to continue." }, { status: 401, headers });
    
    const { data, error } = await client.rpc("nlcc_snapshot");
    if (error) return NextResponse.json({ error: error.code === "42501" ? "Your account is inactive or has not been provisioned." : "Unable to load the workspace." }, { status: error.code === "42501" ? 403 : 503, headers });

    // Fetch signup invitations if user has SYSTEM_ADMIN role
    let signupInvitations: any[] = [];
    const currentProfile = data?.profiles?.find((p: any) => p.id === user.id);
    const isAdmin = Boolean(currentProfile?.roles?.includes("SYSTEM_ADMIN"));

    if (isAdmin) {
      try {
        const { data: invData, error: invErr } = await client
          .from("signup_invitations")
          .select("*, ministry:ministries(id, name, code)")
          .order("created_at", { ascending: false });

        if (!invErr && Array.isArray(invData)) {
          signupInvitations = invData;
        } else {
          try {
            const admin = createAdminClient();
            const { data: adminInvData } = await admin
              .from("signup_invitations")
              .select("*, ministry:ministries(id, name, code)")
              .order("created_at", { ascending: false });
            if (Array.isArray(adminInvData)) {
              signupInvitations = adminInvData;
            }
          } catch {
            signupInvitations = db.getSignupInvitations();
          }
        }
      } catch {
        try {
          signupInvitations = db.getSignupInvitations();
        } catch {}
      }
    }

    return NextResponse.json({
      ...data,
      signupInvitations,
    }, { headers });
  } catch {
    return NextResponse.json({ error: "The backend is not configured or is unavailable." }, { status: 503, headers });
  }
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ error: "Invalid request origin." }, { status: 403, headers });
  if (!request.headers.get("content-type")?.includes("application/json")) return NextResponse.json({ error: "JSON is required." }, { status: 415, headers });
  try {
    const client = await createClient();
    const { data: { user }, error: authError } = await client.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Sign in to continue." }, { status: 401, headers });
    const text = await request.text();
    if (text.length > 1048576) return NextResponse.json({ error: "Request is too large." }, { status: 413, headers });
    const body = JSON.parse(text);
    if (typeof body.action !== "string" || !body.payload || typeof body.payload !== "object") return NextResponse.json({ error: "Invalid request." }, { status: 400, headers });

    // Helper to check admin role
    const checkIsAdmin = async (): Promise<boolean> => {
      try {
        const { data: roleRows } = await client
          .from("user_roles")
          .select("roles!inner(code)")
          .eq("user_id", user.id);
        if (roleRows && roleRows.some((r: any) => r.roles?.code === "SYSTEM_ADMIN")) {
          return true;
        }
      } catch {}
      try {
        const { data: snap } = await client.rpc("nlcc_snapshot");
        const profile = snap?.profiles?.find((p: any) => p.id === user.id);
        if (profile?.roles?.includes("SYSTEM_ADMIN")) return true;
      } catch {}
      return false;
    };

    // 1. Action: create_invitation
    if (body.action === "create_invitation") {
      const isAdmin = await checkIsAdmin();
      if (!isAdmin) {
        return NextResponse.json({ error: "Administrator access required." }, { status: 403, headers });
      }

      const { role_code, ministry_id, max_uses, expires_in_days, description } = body.payload;
      if (!["MINISTRY_LEADER", "FINANCE_OFFICER", "SYSTEM_ADMIN"].includes(role_code)) {
        return NextResponse.json({ error: "Invalid role specified for invitation." }, { status: 400, headers });
      }

      if (role_code === "MINISTRY_LEADER" && !ministry_id) {
        return NextResponse.json({ error: "A ministry assignment is required when inviting a Ministry Leader." }, { status: 400, headers });
      }

      const rawToken = generateSecureToken(32);
      const tokenHash = hashToken(rawToken);
      const expiresDays = Number(expires_in_days) > 0 ? Number(expires_in_days) : 7;
      const expiresAt = new Date(Date.now() + expiresDays * 24 * 60 * 60 * 1000).toISOString();
      const maxUsesCount = Number(max_uses) > 0 ? Number(max_uses) : 1;
      const desc = description ? String(description).trim() : null;
      const assignedMinistryId = role_code === "MINISTRY_LEADER" ? ministry_id : null;

      let insertedId = `inv-${Date.now()}`;

      try {
        const admin = createAdminClient();
        const { data: inserted, error: insertError } = await admin
          .from("signup_invitations")
          .insert({
            token_hash: tokenHash,
            role_code,
            ministry_id: assignedMinistryId,
            created_by: user.id,
            description: desc,
            expires_at: expiresAt,
            max_uses: maxUsesCount,
            use_count: 0,
            is_active: true,
          })
          .select("id")
          .single();

        if (insertError) {
          console.error("Supabase insert invitation error:", insertError);
          throw insertError;
        }
        if (inserted?.id) {
          insertedId = inserted.id;
        }
      } catch {
        // Fallback to mock DB if live table fails
        try {
          const mockResult = db.createSignupInvitation({
            role_code,
            ministry_id: assignedMinistryId,
            max_uses: maxUsesCount,
            expires_in_days: expiresDays,
            description: desc || undefined,
            created_by: user.id,
          });
          insertedId = mockResult.invitation.id;
        } catch (mErr: any) {
          return NextResponse.json({ error: mErr?.message || "Unable to generate invitation." }, { status: 400, headers });
        }
      }

      // Also ensure mock DB is synced
      try {
        db.createSignupInvitation({
          role_code,
          ministry_id: assignedMinistryId,
          max_uses: maxUsesCount,
          expires_in_days: expiresDays,
          description: desc || undefined,
          created_by: user.id,
        });
      } catch {}

      const signupUrl = `/signup?invite=${rawToken}`;
      return NextResponse.json({
        id: insertedId,
        raw_token: rawToken,
        signup_url: signupUrl,
        success: true,
      }, { headers });
    }

    // 2. Action: revoke_invitation
    if (body.action === "revoke_invitation") {
      const isAdmin = await checkIsAdmin();
      if (!isAdmin) {
        return NextResponse.json({ error: "Administrator access required." }, { status: 403, headers });
      }

      const invId = body.payload.id;
      if (!invId) {
        return NextResponse.json({ error: "Invitation ID is required." }, { status: 400, headers });
      }

      try {
        const admin = createAdminClient();
        await admin
          .from("signup_invitations")
          .update({ is_active: false })
          .eq("id", invId);
      } catch {}

      try {
        db.revokeSignupInvitation(invId, user.id);
      } catch {}

      return NextResponse.json({ id: invId, success: true }, { headers });
    }

    // 3. Action: complete_onboarding
    if (body.action === "complete_onboarding") {
      const fullName = body.payload.full_name ? String(body.payload.full_name).trim() : "";
      if (!fullName) {
        return NextResponse.json({ error: "Full name is required." }, { status: 400, headers });
      }
      const phone = body.payload.phone ? String(body.payload.phone).trim() : null;

      try {
        const admin = createAdminClient();
        const { error: updateError } = await admin
          .from("profiles")
          .update({
            full_name: fullName,
            phone,
            onboarding_completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", user.id);

        if (updateError) {
          await client
            .from("profiles")
            .update({
              full_name: fullName,
              phone,
              onboarding_completed_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", user.id);
        }
      } catch {}

      try {
        db.completeOnboarding(user.id, {
          full_name: fullName,
          phone: phone || undefined,
        });
      } catch {}

      return NextResponse.json({ id: user.id, success: true }, { headers });
    }

    // All standard actions (claims, approvals, profile, settings, master data, etc.)
    const { data, error } = await client.rpc("nlcc_command", { action: body.action, payload: body.payload });
    if (error) {
      const expected = ["P0001","42501","PT409"].includes(error.code);
      return NextResponse.json({ error: expected ? error.message : "The change could not be saved. Check the fields and try again." }, { status: error.code === "42501" ? 403 : error.code === "PT409" ? 409 : 400, headers });
    }
    return NextResponse.json(data, { headers });
  } catch {
    return NextResponse.json({ error: "The request could not be completed." }, { status: 503, headers });
  }
}

