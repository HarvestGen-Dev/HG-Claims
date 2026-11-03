"use client";

import React, { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { AppLayout } from "@/components/layout/AppLayout";
import { ClaimDetailView } from "@/components/claims/ClaimDetailView";
import { claimsClient, workspaceStore } from "@/lib/domains";
import { Claim } from "@/lib/types/database";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function FinanceClaimDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [claim, setClaim] = useState<Claim | null>(() =>
    id ? claimsClient.getClaimById(id) : null
  );
  const [loading, setLoading] = useState(() =>
    id ? !claimsClient.getClaimById(id) : true
  );

  useEffect(() => {
    if (!id) return;
    let active = true;
    const syncLocal = () => {
      const found = claimsClient.getClaimById(id);
      if (active && found) {
        setClaim(found);
        setLoading(false);
      }
    };
    syncLocal();
    void claimsClient.fetchClaimDetail(id).then((fetched) => {
      if (!active) return;
      if (fetched) setClaim(fetched);
      setLoading(false);
    });
    const unsub = workspaceStore.subscribeDomains(
      ["claims", "master-data", "iam"],
      syncLocal
    );
    return () => {
      active = false;
      unsub();
    };
  }, [id]);

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-24">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent" />
        </div>
      </AppLayout>
    );
  }

  if (!claim) {
    return (
      <AppLayout>
        <div className="max-w-md mx-auto py-24 text-center space-y-4">
          <AlertCircle className="w-12 h-12 text-slate-400 mx-auto" />
          <h2 className="text-lg font-bold text-slate-800">Claim Not Found</h2>
          <Link href="/finance/claims">
            <Button size="sm" variant="outline">Back to Finance Claims</Button>
          </Link>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <ClaimDetailView claim={claim} />
    </AppLayout>
  );
}
