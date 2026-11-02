import { NextRequest, NextResponse } from "next/server";
import {
  NO_STORE_HEADERS,
  handleDomainCommandRequest,
} from "@/services/shared/http";
import { iamService } from "@/services/iam/iam.service";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await iamService.getDomainState();
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
    iamService.execute(action, payload)
  );
}
