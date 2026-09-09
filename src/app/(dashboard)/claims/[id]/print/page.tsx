"use client";

import React, { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { PrintClaimView } from "@/components/claims/PrintClaimView";
import { db } from "@/lib/mock-db/repository";
import { Claim } from "@/lib/types/database";

export default function PrintPage() {
  const params = useParams();
  const id = params.id as string;
  const [claim, setClaim] = useState<Claim | null>(null);

  useEffect(() => {
    if (id) {
      const found = db.getClaimById(id);
      setClaim(found);
    }
  }, [id]);

  if (!claim) return <div className="p-8 text-center text-sm">Loading printable claim...</div>;

  return <PrintClaimView claim={claim} />;
}
