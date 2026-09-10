import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Claim } from "@/lib/types/database";
import { formatCurrency, formatDate } from "@/lib/utils/formatters";
import { ClaimStatusBadge } from "./ClaimStatusBadge";

export function MobileClaimList({ claims }: { claims: Claim[] }) {
  return <div className="sm:hidden divide-y">
    {claims.map(claim => <Link key={claim.id} href={`/claims/${claim.id}`} className="block p-4 hover:bg-zinc-50 focus-visible:bg-zinc-50">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium min-w-0 break-words">{claim.programme_event}</p>
        <span className="text-sm font-semibold tabular-nums whitespace-nowrap">{formatCurrency(claim.total_amount)}</span>
      </div>
      <p className="text-xs text-zinc-500 mt-1">{claim.claim_number || "Draft"} &middot; {formatDate(claim.claim_date)}</p>
      <div className="flex items-center justify-between gap-3 mt-3"><ClaimStatusBadge status={claim.status} /><ChevronRight className="h-4 w-4 text-zinc-400" /></div>
    </Link>)}
  </div>;
}
