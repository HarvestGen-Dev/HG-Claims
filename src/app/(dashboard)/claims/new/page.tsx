"use client";

import React from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { ClaimForm } from "@/components/claims/ClaimForm";

export default function NewClaimPage() {
  return (
    <AppLayout>
      <ClaimForm />
    </AppLayout>
  );
}
