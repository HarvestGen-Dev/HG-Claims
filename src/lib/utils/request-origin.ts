import type { NextRequest } from "next/server";

export function hasSameRequestOrigin(request: NextRequest, requireOrigin = false): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return !requireOrigin;

  // Next normalizes loopback IP addresses to localhost in nextUrl.
  const host = request.headers.get("host");
  if (request.nextUrl.hostname === "localhost" && host && /^(127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host)) {
    return origin === `${request.nextUrl.protocol}//${host}`;
  }
  return origin === request.nextUrl.origin;
}
