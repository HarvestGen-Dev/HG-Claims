import { NextRequest, NextResponse } from "next/server";
import {
  NO_STORE_HEADERS,
  handleDomainCommandRequest,
} from "@/services/shared/http";
import { claimsService } from "@/services/claims/claims.service";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse>;
export async function GET(request: NextRequest): Promise<NextResponse>;
export async function GET(request?: NextRequest): Promise<NextResponse> {
  const searchParams = request?.nextUrl?.searchParams;
  if (searchParams) {
    const claimId = searchParams.get("id");
    if (claimId) {
      const detailResult = await claimsService.getClaimDetail(claimId);
      if (detailResult.error) {
        return NextResponse.json(
          { error: detailResult.error },
          { status: detailResult.status, headers: NO_STORE_HEADERS }
        );
      }
      return NextResponse.json(detailResult.data, { headers: NO_STORE_HEADERS });
    }

    const hasListQueryParams =
      searchParams.has("page") ||
      searchParams.has("page_size") ||
      searchParams.has("search") ||
      searchParams.has("status") ||
      searchParams.has("ministry_id") ||
      searchParams.has("start_date") ||
      searchParams.has("end_date") ||
      searchParams.has("sort_field") ||
      searchParams.has("sort_dir");

    if (hasListQueryParams) {
      const sortDirParam = searchParams.get("sort_dir");
      const queryResult = await claimsService.queryClaims({
        page: searchParams.get("page")
          ? Number(searchParams.get("page"))
          : undefined,
        page_size: searchParams.get("page_size")
          ? Number(searchParams.get("page_size"))
          : undefined,
        search: searchParams.get("search") || undefined,
        status: searchParams.get("status") || undefined,
        ministry_id: searchParams.get("ministry_id") || undefined,
        start_date: searchParams.get("start_date") || undefined,
        end_date: searchParams.get("end_date") || undefined,
        sort_field: searchParams.get("sort_field") || undefined,
        sort_dir:
          sortDirParam === "asc" || sortDirParam === "desc"
            ? sortDirParam
            : undefined,
      });
      if (queryResult.error) {
        return NextResponse.json(
          { error: queryResult.error },
          { status: queryResult.status, headers: NO_STORE_HEADERS }
        );
      }
      return NextResponse.json(queryResult.data, { headers: NO_STORE_HEADERS });
    }
  }

  const result = await claimsService.getDomainState();
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
    claimsService.execute(action, payload)
  );
}
