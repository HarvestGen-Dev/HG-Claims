import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const client = await createClient();
  const code = request.nextUrl.searchParams.get("code");
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  const next = request.nextUrl.searchParams.get("next");

  const getDestination = () => {
    if (type === "invite" || next === "/onboarding") return "/onboarding?invite=1";
    if (type === "recovery" || next === "/reset-password") return "/reset-password";
    return next && next.startsWith("/") ? next : "/dashboard";
  };

  if (code) {
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(getDestination(), request.url));
  } else if (tokenHash && (type === "invite" || type === "recovery")) {
    const { error } = await client.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) return NextResponse.redirect(new URL(getDestination(), request.url));
  } else if (!code && !tokenHash) {
    // Implicit flow (#access_token=... in URL hash): redirect to /onboarding so the client can exchange the hash fragment
    return NextResponse.redirect(new URL(getDestination(), request.url));
  }

  return NextResponse.redirect(new URL("/login?error=expired-link", request.url));
}
