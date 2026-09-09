import { z } from "zod";

export const approvalRuleSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(3, "Rule name is required"),
  description: z.string().optional().nullable(),
  ministry_id: z.string().optional().nullable(),
  expense_category_id: z.string().optional().nullable(),
  min_amount: z.coerce.number().min(0, "Minimum amount must be >= 0"),
  max_amount: z.coerce.number().optional().nullable(),
  sequence: z.coerce.number().int().positive("Sequence must be a positive integer"),
  approver_role: z.enum(["MINISTRY_LEADER", "FINANCE_OFFICER", "FINAL_APPROVER", "SPECIFIC_USER"]),
  approver_user_id: z.string().optional().nullable(),
  is_active: z.boolean().default(true),
  priority: z.coerce.number().int().default(0),
});

export type ApprovalRuleValues = z.infer<typeof approvalRuleSchema>;
