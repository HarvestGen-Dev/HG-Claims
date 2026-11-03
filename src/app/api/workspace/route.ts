import { NextRequest, NextResponse } from "next/server";
import {
  NO_STORE_HEADERS,
  handleDomainCommandRequest,
} from "@/services/shared/http";
import { gatewayService } from "@/services/gateway.service";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse>;
export async function GET(request: NextRequest): Promise<NextResponse>;
export async function GET(request?: NextRequest): Promise<NextResponse> {
  const mode =
    request?.nextUrl?.searchParams?.get("mode") === "bootstrap"
      ? "bootstrap"
      : undefined;
  const result = await gatewayService.getWorkspaceSnapshot(mode);
  if (result.error) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status, headers: NO_STORE_HEADERS }
    );
  }
  return NextResponse.json(result.data, { headers: NO_STORE_HEADERS });
}

export async function POST(request: NextRequest) {
  return handleDomainCommandRequest(request, (action, payload) =>
    gatewayService.dispatch(action, payload)
  );
}
