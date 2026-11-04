import { NextRequest, NextResponse } from "next/server";
import { hasSameRequestOrigin } from "@/lib/utils/request-origin";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const roleEnum = z.enum(["CLAIMANT", "FINANCE_OFFICER", "SYSTEM_ADMIN"]);

const schema = z
  .object({
    email: z.string().email().max(254),
    full_name: z.string().trim().max(150).optional(),
    phone: z.string().trim().max(50).optional(),
    role_code: roleEnum.optional(),
    roles: z.array(roleEnum).min(1).optional(),
    ministry_id: z.string().uuid().nullable().optional(),
    is_multi_user: z.boolean().optional(),
  })
  .strict();

export async function POST(request: NextRequest) {
  if (!hasSameRequestOrigin(request, true)) {
    return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  }
  try {
    const client = await createClient();
    const {
      data: { user },
    } = await client.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    let { data, error } = await client.rpc("nlcc_domain_snapshot", { p_domain: "iam" });
    if (error && (error.code === "PGRST202" || error.message?.includes("nlcc_domain_snapshot"))) {
      ({ data, error } = await client.rpc("nlcc_snapshot"));
    }

    const profile = data?.profiles?.find((p: { id: string }) => p.id === user.id);
    if (error || !profile?.roles?.includes("SYSTEM_ADMIN")) {
      return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
    }

    const body = schema.parse(await request.json());
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
    if (!appUrl) {
      return NextResponse.json({ error: "Application URL is not configured." }, { status: 503 });
    }

    const fallbackName =
      body.full_name && body.full_name.trim().length > 0
        ? body.full_name.trim()
        : body.email.split("@")[0];

    const admin = createAdminClient();
    const result = await admin.auth.admin.inviteUserByEmail(body.email, {
      data: { full_name: fallbackName },
      redirectTo: `${appUrl}/onboarding?invite=1`,
    });

    if (result.error || !result.data?.user) {
      return NextResponse.json(
        {
          error:
            result.error?.message ||
            "The invitation could not be sent. Check whether the account already exists and that email delivery is configured.",
        },
        { status: 400 }
      );
    }

    const invitedUserId = result.data.user.id;
    const assignedRoles =
      body.roles && body.roles.length > 0
        ? body.roles
        : [body.role_code || "CLAIMANT"];

    // Provision profile and roles through the audited domain command
    const { error: profileError } = await client.rpc("nlcc_command", {
      action: "profile",
      payload: {
        id: invitedUserId,
        data: {
          full_name: fallbackName,
          phone: body.phone || null,
          is_multi_user: Boolean(body.is_multi_user),
          status: "ACTIVE",
          roles: assignedRoles,
        },
      },
    });

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 400 });
    }

    await admin
      .from("profiles")
      .update({ onboarding_completed_at: null })
      .eq("id", invitedUserId);

    return NextResponse.json(
      { success: true, user_id: invitedUserId },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json(
      { error: "Check the name, email address, and role details, then try again." },
      { status: 400 }
    );
  }
}
