import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isEndedSessionError, sessionExpiredLoginPath } from "@/lib/auth/session-expiry";
import { supabaseConfig } from "@/lib/supabase/config";

export async function middleware(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const supabaseWs = supabaseUrl.replace(/^http/, "ws");
  const policy = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""} https://vercel.live https://*.vercel.live`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https: https://vercel.live https://*.vercel.live",
    "font-src 'self' data: https://vercel.live https://*.vercel.live",
    `connect-src 'self' https://vercel.live https://*.vercel.live wss://*.vercel.live ${supabaseUrl} ${supabaseWs}`.trim(),
    "frame-src 'self' https://vercel.live https://*.vercel.live",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
  request.headers.set("x-nonce", nonce);
  request.headers.set("Content-Security-Policy", policy);
  let response = NextResponse.next({ request });
  let config;
  try { config = supabaseConfig(); } catch { return response; }
  const client = createServerClient(config.url, config.key, { cookies: {
    getAll: () => request.cookies.getAll(),
    setAll(values) {
      values.forEach(({ name, value }) => request.cookies.set(name, value));
      response = NextResponse.next({ request });
      values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
    },
  } });
  let user = null;
  let error: { name?: string; code?: string } | null = null;
  try {
    const result = await client.auth.getUser();
    user = result.data.user;
    error = result.error;
  } catch (err) {
    // Prevent unhandled exception in Edge middleware from crashing with 503
    console.error("Middleware auth check error:", err);
  }
  const { pathname, searchParams } = request.nextUrl;
  const publicPath = ["/", "/login", "/signup", "/onboarding", "/forgot-password", "/reset-password", "/auth/callback"].includes(pathname);
  const requiresSignIn = !publicPath && !pathname.startsWith("/api/");
  // The SDK also uses this error for visitors who have no session cookie.
  const removedSession = error?.name === "AuthSessionMissingError" &&
    response.cookies.getAll().some(cookie => cookie.maxAge === 0);
  const sessionEnded = isEndedSessionError(error?.code) || removedSession;
  const showExpiryNotice = sessionEnded && (pathname === "/" || (pathname === "/login" && searchParams.get("expired") !== "1"));

  if (!user && (requiresSignIn || showExpiryNotice)) {
    const login = new URL(sessionEnded ? sessionExpiredLoginPath : "/login", request.url);
    const redirect = NextResponse.redirect(login);
    response.cookies.getAll().forEach(cookie => redirect.cookies.set(cookie));
    response = redirect;
  }
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"] };
