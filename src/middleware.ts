import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
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
  const { data: { user } } = await client.auth.getUser();
  const publicPath = ["/", "/login", "/signup", "/ onboarding", "/onboarding", "/forgot-password", "/reset-password", "/auth/callback", "/api/health"].includes(request.nextUrl.pathname);
  if (!user && !publicPath && !request.nextUrl.pathname.startsWith("/api/")) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = "";
    const redirect = NextResponse.redirect(login);
    response.cookies.getAll().forEach(cookie => redirect.cookies.set(cookie));
    return redirect;
  }
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"] };
