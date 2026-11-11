"use client";

import React, { useState } from "react";
import { XCircle } from "lucide-react";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface RejectModalProps {
  open: boolean;
  claimNumber?: string | null;
  onConfirm: (reason: string) => Promise<void> | void;
  onCancel: () => void;
  loading?: boolean;
}

export function RejectModal({
  open,
  claimNumber,
  onConfirm,
  onCancel,
  loading = false,
}: RejectModalProps) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  const handleConfirm = async () => {
    if (!reason.trim() || reason.trim().length < 3) {
      setError(
        "Please provide a mandatory explanation for rejecting this claim.",
      );
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
          <div className="h-10 w-10 rounded-xl bg-red-100 text-red-700 flex items-center justify-center shrink-0">
            <XCircle className="w-5 h-5" />
          </div>
          <div>
            <DialogTitle>Reject Expense Claim</DialogTitle>
            <DialogDescription>
              Claim {claimNumber || ""} will be permanently marked as Rejected.
            </DialogDescription>
          </div>
        </div>
      </DialogHeader>

      <div className="space-y-4 my-2">
        <div className="rounded-lg bg-red-50 p-3 text-xs text-red-900 border border-red-200">
          Rejecting a claim stops the approval workflow and renders it
          read-only. Provide a clear reason so the claimant understands the
          church policy decision.
        </div>

        <div className="space-y-1.5">
          <label htmlFor="reject-claim-reason" className="text-sm font-medium">
            Reason for Rejection *
          </label>
          <Textarea
            id="reject-claim-reason"
            aria-invalid={!!error}
            aria-describedby={error ? "reject-claim-error" : undefined}
            rows={4}
            placeholder="Explain why this claim cannot be approved."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="text-sm"
            required
          />
          {error && (
            <p
              id="reject-claim-error"
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
          className="min-h-11 bg-red-600 hover:bg-red-700 text-white"
        >
          {loading ? "Rejecting..." : "Confirm Rejection"}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
