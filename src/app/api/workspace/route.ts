import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

export async function GET() {
  try {
    const client = await createClient();
    const { data: { user }, error: authError } = await client.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Sign in to continue." }, { status: 401, headers });
    const { data, error } = await client.rpc("nlcc_snapshot");
    if (error) return NextResponse.json({ error: error.code === "42501" ? "Your account is inactive or has not been provisioned." : "Unable to load the workspace." }, { status: error.code === "42501" ? 403 : 503, headers });
    return NextResponse.json(data, { headers });
  } catch {
    return NextResponse.json({ error: "The backend is not configured or is unavailable." }, { status: 503, headers });
  }
}

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Invalid request origin." }, { status: 403, headers });
  if (!request.headers.get("content-type")?.includes("application/json")) return NextResponse.json({ error: "JSON is required." }, { status: 415, headers });
  try {
    const client = await createClient();
    const { data: { user }, error: authError } = await client.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Sign in to continue." }, { status: 401, headers });
    const text = await request.text();
    if (text.length > 1048576) return NextResponse.json({ error: "Request is too large." }, { status: 413, headers });
    const body = JSON.parse(text);
    if (typeof body.action !== "string" || !body.payload || typeof body.payload !== "object") return NextResponse.json({ error: "Invalid request." }, { status: 400, headers });
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
