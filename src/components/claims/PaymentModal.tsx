"use client";

import { Select } from "@/components/ui/select";
import React, { useState } from "react";
import { Banknote, Calendar, CreditCard, Hash, User, Copy, Check, Landmark } from "lucide-react";
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
  const [copied, setCopied] = useState(false);

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

  const handleCopyAccount = () => {
    if (claim.bank_account_number) {
      navigator.clipboard.writeText(claim.bank_account_number);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
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
              Claim {claim.claim_number} &middot; Total: <strong className="text-emerald-700">{formatCurrency(claim.total_amount)}</strong>
            </DialogDescription>
          </div>
        </div>
      </DialogHeader>

      <div className="space-y-4 my-2">
        {/* Payee Snapshot Details Card */}
        <div className="rounded-xl bg-zinc-50 p-3 text-xs border border-zinc-200 dark:bg-zinc-800/60 dark:border-zinc-700 space-y-2">
          <span className="font-semibold text-zinc-900 dark:text-zinc-100 block mb-0.5">Payment Beneficiary:</span>
          <div className="grid grid-cols-2 gap-2 text-zinc-700 dark:text-zinc-300">
            <div>Claimant / Payee: <strong>{claimantName}</strong></div>
            <div>Submitted By: <strong>{submitterName}</strong></div>
            {claim.claimant_email && <div>Email: <span className="font-mono">{claim.claimant_email}</span></div>}
            {claim.claimant_phone && <div>Phone: <span className="font-mono">{claim.claimant_phone}</span></div>}
          </div>

          {(claim.bank_name || claim.bank_account_number) && (
            <div className="pt-2 mt-1 border-t border-zinc-200 dark:border-zinc-700 flex items-center justify-between bg-emerald-50/70 dark:bg-emerald-950/30 p-2.5 rounded-lg">
              <div className="space-y-0.5">
                <span className="text-[10px] uppercase font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1">
                  <Landmark className="w-3 h-3" /> Reimbursement Bank Account
                </span>
                <p className="font-semibold text-zinc-900 dark:text-zinc-100">{claim.bank_name || "Bank unspecified"}</p>
                <p className="font-mono text-emerald-900 dark:text-emerald-300 font-bold tracking-wider text-xs">
                  {claim.bank_account_number || "-"}
                </p>
              </div>
              {claim.bank_account_number && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1 border-emerald-300 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-700 dark:text-emerald-300"
                  onClick={handleCopyAccount}
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? "Copied" : "Copy"}</span>
                </Button>
              )}
            </div>
          )}
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
            <label htmlFor="claims-select-1" className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1">
              <CreditCard className="w-3.5 h-3.5 text-zinc-400" />
              Payment Method *
            </label>
            <Select id="claims-select-1"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="w-full"
            >
              <option value="BANK_TRANSFER">Bank Online Transfer (IBG / DuitNow)</option>
              <option value="CHEQUE">Cheque</option>
              <option value="CASH">Cash Voucher</option>
              <option value="ONLINE_BANKING">Direct Bill Payment</option>
              <option value="OTHER">Other</option>
            </Select>
          </div>

          {/* Payment Reference */}
          <div className="sm:col-span-2 space-y-1">
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
          <div className="sm:col-span-2 space-y-1">
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
          loading={loading}
          disabled={loading || !paymentRef.trim()}
          className="bg-zinc-900 hover:bg-zinc-800 text-white"
        >
          {loading ? "Processing..." : "Confirm & Mark as Paid"}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
