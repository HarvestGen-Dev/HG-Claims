import { z } from "zod";

export const recordPaymentSchema = z.object({
  claim_id: z.string().min(1, "Claim ID is required"),
  amount: z.coerce.number().positive("Payment amount must be positive"),
  payment_date: z.string().min(1, "Payment date is required"),
  payment_reference: z.string().min(3, "Payment transaction reference is required (e.g. MBB-TRX-839291)"),
  payment_method: z.enum([
    "BANK_TRANSFER",
    "CHEQUE",
    "CASH",
    "ONLINE_BANKING",
    "DUITNOW",
    "OTHER",
  ]),
  notes: z.string().optional().nullable(),
});

export const adminCorrectionSchema = z.object({
  claim_id: z.string().min(1, "Claim ID is required"),
  cost_centre_id: z.string().optional().nullable(),
  internal_reference: z.string().optional().nullable(),
  reason: z.string().min(5, "Reason for administrative correction is required for audit trail"),
});

export const approvalActionSchema = z.object({
  claim_id: z.string().min(1, "Claim ID is required"),
  action: z.enum(["APPROVE", "RETURN_FOR_CLARIFICATION", "REJECT"]),
  comment: z.string().optional(),
}).refine((data) => {
  if (data.action === "RETURN_FOR_CLARIFICATION" || data.action === "REJECT") {
    return !!data.comment && data.comment.trim().length >= 3;
  }
  return true;
}, {
  message: "A comment explaining the reason is required when returning or rejecting a claim",
  path: ["comment"],
});

export type RecordPaymentValues = z.infer<typeof recordPaymentSchema>;
export type AdminCorrectionValues = z.infer<typeof adminCorrectionSchema>;
export type ApprovalActionValues = z.infer<typeof approvalActionSchema>;
