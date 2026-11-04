"use client";

import React from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { ClaimForm } from "@/components/claims/ClaimForm";
import { useAuth } from "@/lib/auth/context";

export default function NewClaimPage() {
  const { canCreateClaim } = useAuth();
  return (
    <AppLayout>
      {canCreateClaim() ? <ClaimForm /> : <p role="alert">Only Claimants and System Admins can create claims.</p>}
    </AppLayout>
  );
}
