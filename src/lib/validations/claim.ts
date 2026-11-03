import { z } from "zod";
import { moneyToCents } from "@/lib/utils/calculations";

export const expenseItemSchema = z.object({
  id: z.string().optional(),
  temp_id: z.string().optional(),
  expense_date: z.string().min(1, "Receipt date is required"),
  expense_category_id: z.string().optional().nullable(),
  vendor: z.string().optional().nullable(),
  description: z.string().min(3, "Description must be at least 3 characters"),
  cost_centre_id: z.string().optional().nullable(),
  amount: z.coerce.number().positive("Amount must be greater than RM 0.00")
    .refine(value => moneyToCents(value) !== null, "Enter an amount with at most two decimal places"),
  notes: z.string().optional().nullable(),
  sort_order: z.number().default(0),
  attachment: z.any().optional().nullable(),
  attachment_ids: z.array(z.string()).optional(),
});

export const receiptItemSchema = expenseItemSchema;

export const claimFormSchema = z.object({
  id: z.string().optional(),
  claimant_name: z.string().min(2, "Claimant full name is required"),
  claimant_email: z.string().email("Invalid email address").optional().or(z.literal("")).nullable(),
  claimant_phone: z.string().optional().nullable(),
  bank_name: z.string().optional().nullable(),
  bank_account_number: z.string().optional().nullable(),
  ministry_id: z.string().min(1, "Please select a ministry"),
  claim_date: z.string().min(1, "Submission date is required"),
  purpose: z.string().min(5, "Ministry purpose / justification is required"),
  internal_reference: z.string().optional().nullable(),
  declaration_accepted: z.boolean().refine(val => val === true, {
    message: "You must confirm and accept the declaration to submit your claim",
  }),
  expenses: z.array(expenseItemSchema).min(1, "At least one receipt is required"),
});

export const claimDraftSchema = z.object({
  id: z.string().optional(),
  claimant_name: z.string().optional(),
  claimant_email: z.string().optional().nullable(),
  claimant_phone: z.string().optional().nullable(),
  bank_name: z.string().optional().nullable(),
  bank_account_number: z.string().optional().nullable(),
  ministry_id: z.string().optional(),
  claim_date: z.string().optional(),
  purpose: z.string().optional(),
  internal_reference: z.string().optional().nullable(),
  declaration_accepted: z.boolean().optional(),
  expenses: z.array(expenseItemSchema).optional(),
});

export type ClaimFormValues = z.infer<typeof claimFormSchema>;
export type ExpenseItemValues = z.infer<typeof expenseItemSchema>;
export type ReceiptItemValues = z.infer<typeof receiptItemSchema>;
