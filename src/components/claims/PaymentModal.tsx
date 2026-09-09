"use client";

import React, { useState } from "react";
import { CheckCircle2, Banknote, Calendar, CreditCard, Hash } from "lucide-react";
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
      setError("Please provide a valid bank/cheque transaction reference number (e.g. MBB-TRX-839291).");
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
              Claim {claim.claim_number} • Total: <strong className="text-emerald-700">{formatCurrency(claim.total_amount)}</strong>
            </DialogDescription>
          </div>
        </div>
      </DialogHeader>

      <div className="space-y-4 my-2">
        {/* Claimant Bank Details Card */}
        <div className="rounded-xl bg-slate-50 p-3 text-xs border border-slate-200 dark:bg-slate-800 dark:border-slate-700">
          <span className="font-bold text-slate-900 dark:text-slate-100">Claimant Bank Details:</span>
          <div className="grid grid-cols-2 gap-2 mt-1.5 text-slate-700 dark:text-slate-300">
            <div>Payee: <strong>{claim.claimant?.full_name}</strong></div>
            <div>Bank: <strong>{claim.claimant?.bank_name || "Maybank"}</strong></div>
            <div className="col-span-2">Account No: <strong className="font-mono">{claim.claimant?.bank_account_number || "114012345678"}</strong></div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Payment Date */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
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
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
              <CreditCard className="w-3.5 h-3.5 text-slate-400" />
              Payment Method *
            </label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:border-slate-700 dark:bg-slate-900"
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
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
              <Hash className="w-3.5 h-3.5 text-slate-400" />
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
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
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

        {error && <p className="text-xs text-red-600 font-medium">{error}</p>}
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
