"use client";

import React, { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { PrintClaimView } from "@/components/claims/PrintClaimView";
import { claimsClient } from "@/lib/domains";
import { Claim } from "@/lib/types/database";
import Link from "next/link";

export default function PrintPage() {
  const params = useParams();
  const id = params.id as string;
  const [claim, setClaim] = useState<Claim | null>(null);

  useEffect(() => {
    if (id) {
      const found = claimsClient.getClaimById(id);
      setClaim(found);
    }
  }, [id]);

  if (!claim) return <div className="p-8 text-center text-sm" role="alert">Claim not found or access denied. <Link href="/claims" className="underline">Back to claims</Link></div>;

  return <PrintClaimView claim={claim} />;
}
