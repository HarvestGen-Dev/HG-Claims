"use client";

import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export default function WorkflowConfigurationPage() {
  return <AppLayout>
    <div className="max-w-2xl space-y-4">
      <h1 className="text-xl font-bold">Approval Workflow</h1>
      <p className="text-sm text-slate-600">Every submitted claim follows the same approval process, regardless of amount.</p>
      <Card>
        <CardHeader><CardTitle>Submit → Finance Review → Payment</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>A Ministry Leader or System Admin submits the claim and its receipts.</p>
          <p>Another Finance Officer or System Admin verifies the receipts, then approves the claim or returns it for clarification.</p>
          <p>Once approved, Finance or an administrator records the payment.</p>
          <p className="text-slate-500">The submitter and claimant cannot review or pay their own claim. There are no ministry approval stages or amount-based approval thresholds.</p>
        </CardContent>
      </Card>
    </div>
  </AppLayout>;
}
