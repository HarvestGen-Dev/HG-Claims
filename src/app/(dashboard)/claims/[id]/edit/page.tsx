"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppLayout } from "@/components/layout/AppLayout";
import { ClaimForm } from "@/components/claims/ClaimForm";
import { db } from "@/lib/data/repository";
import { Claim } from "@/lib/types/database";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useAuth } from "@/lib/auth/context";

export default function EditClaimPage() {
  const { canEdit } = useAuth();
  const params = useParams();
  const id = params.id as string;
  const [claim, setClaim] = useState<Claim | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const found = db.getClaimById(id);
    setClaim(found);
    setLoading(false);
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
          <Link href="/claims">
            <Button size="sm" variant="outline">Back to Claims List</Button>
          </Link>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      {canEdit(claim) ? <ClaimForm initialClaim={claim} isEditMode={true} /> : <p role="alert">Only the submitter can edit a draft or returned claim.</p>}
    </AppLayout>
  );
}
