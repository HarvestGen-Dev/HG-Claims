import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
const schema = z.object({ email: z.string().email().max(254), full_name: z.string().trim().min(1).max(150) }).strict();
export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  try {
    const client = await createClient();
    const { data: { user } } = await client.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const { data, error } = await client.rpc("nlcc_snapshot");
    const profile = data?.profiles?.find((p: { id: string }) => p.id === user.id);
    if (error || !profile?.roles?.includes("SYSTEM_ADMIN")) return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
    const body = schema.parse(await request.json());
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!appUrl) return NextResponse.json({ error: "Application URL is not configured." }, { status: 503 });
    const result = await createAdminClient().auth.admin.inviteUserByEmail(body.email, {
      data: { full_name: body.full_name }, redirectTo: appUrl + "/auth/callback?next=/reset-password",
    });
    if (result.error) return NextResponse.json({ error: "The invitation could not be sent. Check whether the account exists and that email delivery is configured." }, { status: 400 });
    return NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "Check the name and email address, then try again." }, { status: 400 }); }
}
