"use client";

import React, { useState } from "react";
import { Banknote, Calendar, CreditCard, Hash, User } from "lucide-react";
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/utils/formatters";
import { Claim } from "@/lib/types/database";

interface PaymentModalProps {
  open: boolean;
  claim: Claim | null;
  onConfirm: (paymentData: {
    amount: number;
    payment_date: string;
    payment_reference: string;
    payment_method: any;
    notes?: string;
  }) => Promise<void> | void;
  onCancel: () => void;
  loading?: boolean;
}

export function PaymentModal({
  open,
  claim,
  onConfirm,
  onCancel,
  loading = false,
}: PaymentModalProps) {
  const today = new Date().toISOString().split("T")[0];
  const [paymentDate, setPaymentDate] = useState(today);
  const [paymentRef, setPaymentRef] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("BANK_TRANSFER");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  if (!claim) return null;

  const handleConfirm = async () => {
    if (!paymentRef.trim() || paymentRef.trim().length < 3) {
      setError("Please provide a valid transaction reference number (e.g. MBB-TRX-839291 or CHQ#10023).");
      return;
    }
    if (!paymentDate) {
      setError("Please select the payment settlement date.");
      return;
    }
    setError("");
    await onConfirm({
      amount: claim.total_amount,
      payment_date: paymentDate,
      payment_reference: paymentRef.trim(),
      payment_method: paymentMethod,
      notes: notes.trim() || undefined,
    });
  };

  const claimantName = claim.claimant_name || claim.claimant?.full_name || "Payee";
  const submitterName = claim.submitted_by?.full_name || claim.claimant?.full_name || "Ministry Head";

  return (
    <Dialog open={open} onOpenChange={(val) => !val && onCancel()}>
      <DialogHeader>
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
            <Banknote className="w-5 h-5" />
          </div>
          <div>
            <DialogTitle>Record Payment & Mark as Paid</DialogTitle>
            <DialogDescription>
              Claim {claim.claim_number} &middot; Total: <strong className="text-emerald-700">{formatCurrency(claim.total_amount)}</strong>
            </DialogDescription>
          </div>
        </div>
      </DialogHeader>

      <div className="space-y-4 my-2">
        {/* Payee Snapshot Details Card */}
        <div className="rounded-xl bg-zinc-50 p-3 text-xs border border-zinc-200 dark:bg-zinc-800/60 dark:border-zinc-700">
          <span className="font-semibold text-zinc-900 dark:text-zinc-100 block mb-1">Payment Beneficiary:</span>
          <div className="grid grid-cols-2 gap-2 text-zinc-700 dark:text-zinc-300">
            <div>Claimant / Payee: <strong>{claimantName}</strong></div>
            <div>Submitted By: <strong>{submitterName}</strong></div>
            {claim.claimant_email && <div>Email: <span className="font-mono">{claim.claimant_email}</span></div>}
            {claim.claimant_phone && <div>Phone: <span className="font-mono">{claim.claimant_phone}</span></div>}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Payment Date */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-zinc-400" />
              Payment Date *
            </label>
            <Input
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              required
            />
          </div>

          {/* Payment Method */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1">
              <CreditCard className="w-3.5 h-3.5 text-zinc-400" />
              Payment Method *
            </label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="flex h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-900"
            >
              <option value="BANK_TRANSFER">Bank Online Transfer (IBG / DuitNow)</option>
              <option value="CHEQUE">Cheque</option>
              <option value="CASH">Cash Voucher</option>
              <option value="ONLINE_BANKING">Direct Bill Payment</option>
              <option value="OTHER">Other</option>
            </select>
          </div>

          {/* Payment Reference */}
          <div className="col-span-2 space-y-1">
            <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1">
              <Hash className="w-3.5 h-3.5 text-zinc-400" />
              Payment Transaction Reference *
            </label>
            <Input
              type="text"
              placeholder="e.g. MBB-TRX-839291, CHQ#004910"
              value={paymentRef}
              onChange={(e) => setPaymentRef(e.target.value)}
              required
            />
          </div>

          {/* Internal Notes */}
          <div className="col-span-2 space-y-1">
            <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              Finance Notes (Optional)
            </label>
            <Input
              type="text"
              placeholder="e.g. Batch #42 Maybank2u disbursement"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        {error && <p className="text-xs text-rose-600 font-medium">{error}</p>}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
        <Button
          onClick={handleConfirm}
          disabled={loading || !paymentRef.trim()}
          className="bg-emerald-700 hover:bg-emerald-800 text-white"
        >
          {loading ? "Processing..." : "Confirm & Mark as Paid"}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
