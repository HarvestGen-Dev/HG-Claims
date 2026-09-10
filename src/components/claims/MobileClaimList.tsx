import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Claim } from "@/lib/types/database";
import { formatCurrency, formatDate } from "@/lib/utils/formatters";
import { ClaimStatusBadge } from "./ClaimStatusBadge";

export function MobileClaimList({ claims }: { claims: Claim[] }) {
  return (
    <div className="sm:hidden divide-y divide-zinc-200 dark:divide-zinc-800">
      {claims.map((claim) => (
        <Link
          key={claim.id}
          href={`/claims/${claim.id}`}
          className="block p-4 hover:bg-zinc-50 dark:hover:bg-zinc-900 focus-visible:bg-zinc-50 transition-colors"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                {claim.claimant_name || claim.claimant?.full_name || "Unknown Claimant"}
              </p>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 line-clamp-1 mt-0.5">
                {claim.purpose}
              </p>
            </div>
            <span className="text-sm font-mono font-bold text-zinc-900 dark:text-zinc-100 tabular-nums whitespace-nowrap">
              {formatCurrency(claim.total_amount)}
            </span>
          </div>
          <p className="text-[11px] text-zinc-500 font-mono mt-1.5">
            {claim.claim_number || "Draft"} &middot; {formatDate(claim.claim_date)} &middot; {claim.ministry?.name}
          </p>
          <div className="flex items-center justify-between gap-3 mt-3">
            <ClaimStatusBadge status={claim.status} />
            <ChevronRight className="h-4 w-4 text-zinc-400" />
          </div>
        </Link>
      ))}
    </div>
  );
}
