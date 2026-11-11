"use client";

import React, { useState } from "react";
import { RotateCcw } from "lucide-react";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface ReturnClarificationModalProps {
  open: boolean;
  claimNumber?: string | null;
  onConfirm: (reason: string) => Promise<void> | void;
  onCancel: () => void;
  loading?: boolean;
}

export function ReturnClarificationModal({
  open,
  claimNumber,
  onConfirm,
  onCancel,
  loading = false,
}: ReturnClarificationModalProps) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  const handleConfirm = async () => {
    if (!reason.trim() || reason.trim().length < 3) {
      setError("Please provide a clear reason for returning this claim.");
      return;
    }
    setError("");
    await onConfirm(reason.trim());
    setReason("");
  };

  return (
    <Dialog open={open} onOpenChange={(val) => !val && onCancel()}>
      <DialogHeader>
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
            <RotateCcw className="w-5 h-5" />
          </div>
          <div>
            <DialogTitle>Return Claim for Clarification</DialogTitle>
            <DialogDescription>
              Claim {claimNumber || ""} will be returned to the claimant for
              edits.
            </DialogDescription>
          </div>
        </div>
      </DialogHeader>

      <div className="space-y-4 my-2">
        <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900 border border-amber-200">
          The claimant will be notified immediately and invited to update
          missing receipts, fix expense breakdowns, or clarify details before
          resubmitting.
        </div>

        <div className="space-y-1.5">
          <label htmlFor="return-claim-reason" className="text-sm font-medium">
            Clarification Instructions / Missing Information *
          </label>
          <Textarea
            id="return-claim-reason"
            aria-invalid={!!error}
            aria-describedby={error ? "return-claim-error" : undefined}
            rows={4}
            placeholder="Explain what needs to be corrected before resubmission."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="text-sm"
            required
          />
          {error && (
            <p
              id="return-claim-error"
              role="alert"
              className="text-sm text-red-600"
            >
              {error}
            </p>
          )}
        </div>
      </div>

      <DialogFooter>
        <Button
          variant="outline"
          className="min-h-11"
          onClick={onCancel}
          disabled={loading}
        >
          Cancel
        </Button>
        <Button
          onClick={handleConfirm}
          loading={loading}
          disabled={loading || !reason.trim()}
          className="min-h-11 bg-amber-600 hover:bg-amber-700 text-white"
        >
          {loading ? "Returning..." : "Return to Claimant"}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
