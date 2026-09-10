"use client";

import React, { useState } from "react";
import { Edit3, AlertCircle } from "lucide-react";
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Claim, CostCentre } from "@/lib/types/database";

interface AdminCorrectionModalProps {
  open: boolean;
  claim: Claim | null;
  costCentres: CostCentre[];
  onConfirm: (data: {
    cost_centre_id?: string;
    purpose?: string;
    internal_reference?: string;
    reason: string;
  }) => Promise<void> | void;
  onCancel: () => void;
  loading?: boolean;
}

export function AdminCorrectionModal({
  open,
  claim,
  costCentres,
  onConfirm,
  onCancel,
  loading = false,
}: AdminCorrectionModalProps) {
  const [internalRef, setInternalRef] = useState(claim?.internal_reference || "");
  const [purpose, setPurpose] = useState(claim?.purpose || "");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  if (!claim) return null;

  const handleConfirm = async () => {
    if (!reason.trim() || reason.trim().length < 5) {
      setError("Please provide a clear justification for this administrative update (required for audit trail).");
      return;
    }
    setError("");
    await onConfirm({
      purpose: purpose.trim() || undefined,
      internal_reference: internalRef.trim() || undefined,
      reason: reason.trim(),
    });
  };

  return (
    <Dialog open={open} onOpenChange={(val) => !val && onCancel()}>
      <DialogHeader>
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
            <Edit3 className="w-5 h-5" />
          </div>
          <div>
            <DialogTitle>Administrative Field Correction</DialogTitle>
            <DialogDescription>
              Update accounting reference for {claim.claim_number}. This action will be audited.
            </DialogDescription>
          </div>
        </div>
      </DialogHeader>

      <div className="space-y-4 my-2 text-xs">
        <div className="space-y-1">
          <label className="font-semibold text-zinc-700 dark:text-zinc-300">
            Internal Accounting Reference Code
          </label>
          <Input
            type="text"
            placeholder="e.g. YC-2026-SETUP"
            value={internalRef}
            onChange={(e) => setInternalRef(e.target.value)}
          />
        </div>

        <div className="space-y-1">
          <label className="font-semibold text-zinc-700 dark:text-zinc-300">
            Ministry Purpose / Justification
          </label>
          <Textarea
            rows={2}
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
          />
        </div>

        <div className="space-y-1">
          <label className="font-semibold text-zinc-700 dark:text-zinc-300">
            Reason for Correction (Audited) *
          </label>
          <Textarea
            rows={3}
            placeholder="e.g. Updated internal tracking code per finance reconciliation..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
          />
        </div>

        {error && <p className="text-xs text-rose-600 font-medium">{error}</p>}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
        <Button
          onClick={handleConfirm}
          disabled={loading || !reason.trim()}
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          {loading ? "Saving..." : "Save Correction"}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
