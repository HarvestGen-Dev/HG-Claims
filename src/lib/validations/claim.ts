import { z } from "zod";

export const expenseItemSchema = z.object({
  id: z.string().optional(),
  expense_date: z.string().min(1, "Expense date is required"),
  expense_category_id: z.string().min(1, "Please select an expense category"),
  vendor: z.string().optional().nullable(),
  description: z.string().min(3, "Description must be at least 3 characters"),
  amount: z.coerce.number().positive("Amount must be greater than RM 0.00"),
  notes: z.string().optional().nullable(),
  sort_order: z.number().default(0),
  attachment_ids: z.array(z.string()).optional(),
});

export const claimFormSchema = z.object({
  id: z.string().optional(),
  ministry_id: z.string().min(1, "Please select a ministry"),
  programme_event: z.string().min(2, "Programme or Event name is required"),
  cost_centre_id: z.string().min(1, "Please select a budget cost centre"),
  claim_date: z.string().min(1, "Claim date is required"),
  purpose: z.string().min(5, "Ministry purpose / reason is required"),
  payment_method: z.enum([
    "PERSONAL_REIMBURSEMENT",
    "CHURCH_CARD",
    "DIRECT_VENDOR_PAYMENT",
    "OTHER",
  ]),
  internal_reference: z.string().optional().nullable(),
  declaration_accepted: z.boolean().refine(val => val === true, {
    message: "You must confirm and accept the declaration to submit your claim",
  }),
  expenses: z.array(expenseItemSchema).min(1, "At least one expense entry is required"),
});

export const claimDraftSchema = claimFormSchema.partial().extend({
  ministry_id: z.string().optional(),
  programme_event: z.string().optional(),
  cost_centre_id: z.string().optional(),
  expenses: z.array(expenseItemSchema).optional(),
  declaration_accepted: z.boolean().optional(),
});

export type ClaimFormValues = z.infer<typeof claimFormSchema>;
export type ExpenseItemValues = z.infer<typeof expenseItemSchema>;
