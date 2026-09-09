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
    cost_centre_id: string;
    programme_event: string;
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
  const [costCentreId, setCostCentreId] = useState(claim?.cost_centre_id || "");
  const [programme, setProgramme] = useState(claim?.programme_event || "");
  const [internalRef, setInternalRef] = useState(claim?.internal_reference || "");
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
      cost_centre_id: costCentreId,
      programme_event: programme,
      internal_reference: internalRef || undefined,
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
              Update accounting metadata for {claim.claim_number}. This action will be audited.
            </DialogDescription>
          </div>
        </div>
      </DialogHeader>

      <div className="space-y-4 my-2">
        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            Cost Centre / Budget Line *
          </label>
          <select
            value={costCentreId}
            onChange={(e) => setCostCentreId(e.target.value)}
            className="flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:border-slate-700 dark:bg-slate-900"
            required
          >
            {costCentres.map((cc) => (
              <option key={cc.id} value={cc.id}>
                {cc.code} - {cc.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            Programme / Event *
          </label>
          <Input
            type="text"
            value={programme}
            onChange={(e) => setProgramme(e.target.value)}
            required
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            Internal Accounting Reference
          </label>
          <Input
            type="text"
            value={internalRef}
            onChange={(e) => setInternalRef(e.target.value)}
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            Reason for Correction (Audited) *
          </label>
          <Textarea
            rows={3}
            placeholder="e.g. Reclassified from General budget to Youth Camp project budget per finance review..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
          />
        </div>

        {error && <p className="text-xs text-red-600 font-medium">{error}</p>}
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
