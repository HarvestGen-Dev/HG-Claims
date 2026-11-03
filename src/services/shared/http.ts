import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const NO_STORE_HEADERS = { "Cache-Control": "private, no-store" };

export interface DomainCommandResult {
  data?: Record<string, unknown> | null;
  error?: string;
  status: number;
}

export type DomainExecutor = (
  action: string,
  payload: Record<string, unknown>
) => Promise<DomainCommandResult>;

export async function executeRpcCommand(
  action: string,
  payload: Record<string, unknown>
): Promise<DomainCommandResult> {
  const client = await createClient();
  const { data, error } = await client.rpc("nlcc_command", { action, payload });
  if (error) {
    const expected = ["P0001", "42501", "PT409"].includes(error.code);
    if (!expected) console.error("Domain command failed", { action, code: error.code });
    return {
      error: expected
        ? error.message
        : "The change could not be saved. Check the fields and try again.",
      status: error.code === "42501" ? 403 : error.code === "PT409" ? 409 : 400,
    };
  }
  return {
    data: (data as Record<string, unknown>) ?? {},
    status: 200,
  };
}

export type DomainSnapshotScope =
  | "iam"
  | "master-data"
  | "claims"
  | "finance"
  | "notifications";

export async function fetchAuthorizedSnapshot(
  domain?: DomainSnapshotScope
): Promise<{
  data?: Record<string, unknown>;
  error?: string;
  status: number;
}> {
  try {
    const client = await createClient();
    const {
      data: { user },
      error: authError,
    } = await client.auth.getUser();
    if (authError || !user) {
      return { error: "Sign in to continue.", status: 401 };
    }
    let { data, error } = domain
      ? await client.rpc("nlcc_domain_snapshot", { p_domain: domain })
      : await client.rpc("nlcc_snapshot");
    // Older deployments may not yet have the scoped RPC. Other failures must
    // surface instead of silently loading the much larger full snapshot.
    if (error && domain && ["42883", "PGRST202"].includes(error.code)) {
      ({ data, error } = await client.rpc("nlcc_snapshot"));
    }
    if (error) {
      if (error.code !== "42501") console.error("Workspace snapshot failed", { domain, code: error.code });
      return {
        error:
          error.code === "42501"
            ? "Your account is inactive or has not been provisioned."
            : "Unable to load the workspace.",
        status: error.code === "42501" ? 403 : 503,
      };
    }
    return { data: (data as Record<string, unknown>) ?? {}, status: 200 };
  } catch (cause) {
    console.error("Workspace snapshot unavailable", { domain, cause: cause instanceof Error ? cause.name : "unknown" });
    return {
      error: "The backend is not configured or is unavailable.",
      status: 503,
    };
  }
}

export async function handleDomainCommandRequest(
  request: NextRequest,
  executor: DomainExecutor
): Promise<NextResponse> {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) {
    return NextResponse.json(
      { error: "Invalid request origin." },
      { status: 403, headers: NO_STORE_HEADERS }
    );
  }
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return NextResponse.json(
      { error: "JSON is required." },
      { status: 415, headers: NO_STORE_HEADERS }
    );
  }
  try {
    const client = await createClient();
    const {
      data: { user },
      error: authError,
    } = await client.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: "Sign in to continue." },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }
    const text = await request.text();
    if (text.length > 1048576) {
      return NextResponse.json(
        { error: "Request is too large." },
        { status: 413, headers: NO_STORE_HEADERS }
      );
    }
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON." },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }
    if (
      !body ||
      typeof body !== "object" ||
      typeof (body as { action?: unknown }).action !== "string" ||
      !(body as { payload?: unknown }).payload ||
      typeof (body as { payload?: unknown }).payload !== "object" ||
      Array.isArray((body as { payload?: unknown }).payload)
    ) {
      return NextResponse.json(
        { error: "Invalid request." },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const { action, payload } = body as {
      action: string;
      payload: Record<string, unknown>;
    };
    const result = await executor(action, payload);
    if (result.error) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status, headers: NO_STORE_HEADERS }
      );
    }
    return NextResponse.json(result.data ?? {}, {
      status: result.status,
      headers: NO_STORE_HEADERS,
    });
  } catch (cause) {
    console.error("Domain request failed", { path: request.nextUrl.pathname, cause: cause instanceof Error ? cause.name : "unknown" });
    return NextResponse.json(
      { error: "The request could not be completed." },
      { status: 503, headers: NO_STORE_HEADERS }
    );
  }
}
