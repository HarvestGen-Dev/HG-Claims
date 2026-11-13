export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';

export type PrivilegedRoleCode = 'TEAM_LEAD' | 'FINANCE';

// Legacy codes remain readable for historical records, never offered for assignment.
export type RoleCode =
  | 'FINANCE'
  | 'CLAIMANT'
  | 'TEAM_LEAD'
  | 'FINANCE_OFFICER'
  | 'AUDITOR'
  | 'SYSTEM_ADMIN';

export type LegacyRoleCode =
  | RoleCode
  | 'MINISTRY_LEADER'
  | 'FINAL_APPROVER';

export type ClaimStatus =
  | 'DRAFT'
  | 'PENDING_FINANCE_REVIEW'
  | 'RETURNED_FOR_CLARIFICATION'
  | 'REJECTED'
  | 'APPROVED_FOR_PAYMENT'
  | 'PAID'
  | 'CANCELLED'
  | 'SUBMITTED'
  | 'PENDING_MINISTRY_APPROVAL'
  | 'PENDING_FINAL_APPROVAL'
  | 'APPROVED';

export type WorkflowStepStatus =
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'SKIPPED'
  | 'REJECTED'
  | 'RETURNED';

export type ApprovalActionType =
  | 'SUBMIT'
  | 'APPROVE'
  | 'RETURN_FOR_CLARIFICATION'
  | 'REJECT'
  | 'ADMIN_OVERRIDE'
  | 'RESUBMIT'
  | 'VERIFY'
  | 'PAY'
  | 'CANCEL';

export type PaymentMethodType =
  | 'PERSONAL_REIMBURSEMENT'
  | 'CHURCH_CARD'
  | 'DIRECT_VENDOR_PAYMENT'
  | 'OTHER';

export type CommentVisibility =
  | 'PUBLIC_WORKFLOW'
  | 'FINANCE_INTERNAL'
  | 'ADMIN_ONLY';

export interface SignupInvitation {
  id: string;
  token_hash: string;
  role_code: RoleCode;
  ministry_id?: string | null;
  ministry?: Ministry | null;
  created_by: string;
  creator?: Profile | null;
  description?: string | null;
  expires_at: string;
  max_uses: number;
  use_count: number;
  is_active: boolean;
  is_multi_user?: boolean;
  created_at: string;
  last_used_at?: string | null;
  raw_token?: string;
  signup_url?: string;
}

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  phone?: string | null;
  ministry_id?: string | null;
  default_ministry_id?: string | null;
  status: UserStatus;
  is_multi_user?: boolean;
  is_payee_only?: boolean;
  created_by_user_id?: string | null;
  onboarding_completed_at?: string | null;
  bank_name?: string | null;
  bank_code?: string | null;
  bank_account_holder_name?: string | null;
  bank_account_number?: string | null;
  beneficiary_new_ic?: string | null;
  beneficiary_old_ic?: string | null;
  beneficiary_business_reg?: string | null;
  beneficiary_others?: string | null;
  beneficiary_address?: string | null;
  payment_method?: PayeePaymentMethod;
  jompay_biller_name?: string | null;
  jompay_biller_code?: string | null;
  jompay_reference_1?: string | null;
  jompay_reference_2?: string | null;
  payment_revision?: number;
  verified_payment_revision?: number | null;
  payment_verified_at?: string | null;
  payment_verified_by?: string | null;
  bank_updated_at?: string | null;
  avatar_url?: string | null;
  created_at: string;
  updated_at: string;
  roles?: (RoleCode | LegacyRoleCode)[];
}

export interface Role {
  id: string;
  code: RoleCode;
  name: string;
  description?: string | null;
  created_at: string;
}

export interface UserRole {
  id: string;
  user_id: string;
  role_id: string;
  created_at: string;
}

export interface MinistryBudget {
  id: string;
  ministry_id: string;
  year: number;
  amount: number;
  notes?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Ministry {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  leader_id?: string | null;
  leader?: Profile | null;
  team_lead_ids?: string[];
  require_team_lead_approval?: boolean;
  context_kind?: DirectoryKind | null;
  budgets?: MinistryBudget[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ExpenseCategory {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CostCentre {
  id: string;
  code: string;
  name: string;
  ministry_id?: string | null;
  ministry?: Ministry | null;
  description?: string | null;
  display_order?: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ClaimExpense {
  id: string;
  temp_id?: string;
  claim_id: string;
  expense_date: string;
  expense_category_id?: string | null;
  expense_category?: ExpenseCategory | null;
  beneficiary_type?: 'INTERNAL' | 'EXTERNAL' | null;
  invoice_number?: string | null;
  vendor?: string | null;
  description: string;
  cost_centre_id: string;
  cost_centre?: CostCentre | null;
  amount: number;
  /** @deprecated Removed from new expense forms */
  notes?: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  attachments?: ClaimAttachment[];
  attachment?: ClaimAttachment | null;
}

export interface ClaimAttachment {
  id: string;
  temp_id?: string;
  expense_temp_id?: string;
  claim_id: string;
  expense_id?: string | null;
  storage_path: string;
  original_filename: string;
  mime_type: string;
  file_size: number;
  file_category: 'RECEIPT' | 'INVOICE' | 'SUPPORTING_DOC' | 'OTHER';
  uploaded_by: string;
  uploader?: Profile | null;
  created_at: string;
  signed_url?: string;
}

export interface ClaimWorkflowStep {
  id: string;
  workflow_id: string;
  claim_id: string;
  sequence: number;
  step_name: string;
  approver_role: string;
  assigned_user_id?: string | null;
  assigned_user?: Profile | null;
  status: WorkflowStepStatus;
  started_at?: string | null;
  completed_at?: string | null;
  completed_by?: string | null;
  completed_by_user?: Profile | null;
  action_taken?: string | null;
  comments?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClaimWorkflow {
  id: string;
  claim_id: string;
  is_current: boolean;
  version: number;
  created_at: string;
  steps: ClaimWorkflowStep[];
}

export interface ApprovalAction {
  id: string;
  claim_id: string;
  workflow_step_id?: string | null;
  actor_id: string;
  actor?: Profile | null;
  actor_role: string;
  action: ApprovalActionType;
  comment?: string | null;
  previous_status: string;
  new_status: string;
  metadata?: Record<string, any>;
  created_at: string;
}

export interface ClaimComment {
  id: string;
  claim_id: string;
  author_id: string;
  author?: Profile | null;
  author_role: string;
  content: string;
  visibility: CommentVisibility;
  created_at: string;
  updated_at: string;
}

export interface FinanceReview {
  id: string;
  claim_id: string;
  reviewer_id: string;
  reviewer?: Profile | null;
  receipts_verified: boolean;
  category_verified: boolean;
  cost_centre_verified: boolean;
  status: string;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Payment {
  id: string;
  claim_id: string;
  amount: number;
  payment_date: string;
  payment_reference: string;
  payment_method: 'JOMPAY' | 'BANK_TRANSFER' | 'CHEQUE' | 'CASH' | 'ONLINE_BANKING' | 'DUITNOW' | 'OTHER';
  notes?: string | null;
  processed_by: string;
  processor?: Profile | null;
  created_at: string;
}

export type ReimbursementStatus =
  | 'ELIGIBLE'
  | 'RESERVED_IN_BATCH'
  | 'EXPORTED_PENDING_CONFIRMATION'
  | 'SUBMITTED_TO_BANK'
  | 'PAID'
  | 'FAILED'
  | 'RELEASED';

export type ReimbursementBatchStatus =
  | 'FINALIZED'
  | 'EXPORTED'
  | 'SUBMITTED_TO_BANK'
  | 'PARTIALLY_SETTLED'
  | 'SETTLED'
  | 'REJECTED'
  | 'VOIDED';

export type ReimbursementInstructionStatus =
  | 'RESERVED'
  | 'EXPORTED'
  | 'SUBMITTED_TO_BANK'
  | 'PAID'
  | 'FAILED'
  | 'VOIDED';

export interface ClaimApprovedSnapshot {
  payment_method?: PayeePaymentMethod;
  jompay?: JompayDetails | null;
  payment_revision?: number;
  approved_amount_cents: number;
  approved_amount: number;
  currency: string;
  beneficiary_user_id: string;
  bank_account_holder_name: string;
  bank_name: string;
  bank_code: string;
  bank_account_number: string;
  beneficiary_new_ic?: string | null;
  beneficiary_old_ic?: string | null;
  beneficiary_business_reg?: string | null;
  beneficiary_others?: string | null;
  beneficiary_address?: string | null;
  approved_at: string;
  approved_by: string;
}

export interface ReimbursementInstructionClaim {
  id: string;
  batch_id: string;
  instruction_id: string;
  claim_id: string;
  claim?: Claim | null;
  allocated_amount_cents: number;
  allocated_amount: number;
  is_active: boolean;
  created_at: string;
}

export interface ReimbursementBatchInstruction {
  id: string;
  batch_id: string;
  line_order: number;
  payment_description: string;
  payment_reference?: string | null;
  payment_mode: 'LIP' | 'LGP' | 'JOMPAY';
  jompay_snapshot?: JompayDetails | null;
  beneficiary_user_id: string;
  beneficiary_name: string;
  beneficiary_account_number: string;
  beneficiary_bank_name: string;
  beneficiary_bank_code: string;
  beneficiary_new_ic?: string | null;
  beneficiary_old_ic?: string | null;
  beneficiary_business_reg?: string | null;
  beneficiary_others?: string | null;
  beneficiary_address?: string | null;
  amount_cents: number;
  amount: number;
  claim_count: number;
  status: ReimbursementInstructionStatus;
  bank_reference?: string | null;
  bank_acknowledged_at?: string | null;
  failure_reason?: string | null;
  reconciled_by?: string | null;
  reconciled_at?: string | null;
  created_at: string;
  updated_at: string;
  claims?: ReimbursementInstructionClaim[];
}

export interface ReimbursementBatch {
  id: string;
  batch_number: string;
  status: ReimbursementBatchStatus;
  payment_method?: PayeePaymentMethod;
  template_version: string;
  claim_count: number;
  transfer_count: number;
  total_amount_cents: number;
  total_amount: number;
  content_digest_sha256: string;
  exported_file_hash_sha256?: string | null;
  exported_filename?: string | null;
  exported_at?: string | null;
  exported_by?: string | null;
  bank_uploaded_at?: string | null;
  bank_upload_reference?: string | null;
  bank_uploaded_by?: string | null;
  settled_at?: string | null;
  voided_at?: string | null;
  voided_by?: string | null;
  void_reason?: string | null;
  notes?: string | null;
  created_by: string;
  creator?: Profile | null;
  created_at: string;
  updated_at: string;
  instructions?: ReimbursementBatchInstruction[];
}

export interface Claim {
  version?: number;
  id: string;
  claim_number?: string | null;
  submitted_by_user_id: string;
  submitted_by?: Profile | null;
  claimant_name: string;
  claimant_email?: string | null;
  claimant_phone?: string | null;
  bank_name?: string | null;
  bank_code?: string | null;
  bank_account_holder_name?: string | null;
  bank_account_number?: string | null;
  beneficiary_new_ic?: string | null;
  beneficiary_old_ic?: string | null;
  beneficiary_business_reg?: string | null;
  beneficiary_others?: string | null;
  beneficiary_address?: string | null;
  reimbursement_status?: ReimbursementStatus | null;
  active_batch_id?: string | null;
  active_instruction_id?: string | null;
  disbursement_voucher?: string | null;
  batch_number?: string | null;
  disbursement_line_order?: number | null;
  approved_snapshot?: ClaimApprovedSnapshot | null;
  approved_at?: string | null;
  approved_by?: string | null;
  /** @deprecated Historical field - use submitted_by_user_id and claimant_name */
  claimant_id?: string | null;
  /** @deprecated Historical field - use claimant_name snapshot */
  claimant?: Profile | null;
  ministry_id: string;
  ministry?: Ministry | null;
  /** @deprecated Removed from claim requirements */
  programme_event?: string | null;
  /** @deprecated Moved to receipt level (claim_expenses.cost_centre_id) */
  cost_centre_id?: string | null;
  /** @deprecated Moved to receipt level */
  cost_centre?: CostCentre | null;
  claim_date: string;
  purpose: string;
  /** @deprecated Removed from submission */
  payment_method?: PaymentMethodType | null;
  internal_reference?: string | null;
  total_amount: number;
  currency: string;
  status: ClaimStatus;
  declaration_accepted: boolean;
  declaration_timestamp?: string | null;
  submitted_at?: string | null;
  current_step_sequence?: number | null;
  rejection_reason?: string | null;
  clarification_reason?: string | null;
  returned_by?: string | null;
  returned_by_user?: Profile | null;
  returned_at?: string | null;
  resubmitted_at?: string | null;
  created_at: string;
  updated_at: string;

  payee_payment_method?: PayeePaymentMethod;
  payee_payment_revision?: number;
  payee_verification_required?: boolean;
  jompay_details?: JompayDetails | null;
  context_kind?: DirectoryKind | null;
  context_value_id?: string | null;
  context_name?: string | null;
  recurring_schedule_id?: string | null;
  recurring_due_date?: string | null;
  recurring_previous_amount?: number | null;
  classification_changes?: { id: string; editor_id: string; created_at: string; field: string; old_value: unknown; new_value: unknown }[];
  // Relations
  expenses?: ClaimExpense[];
  attachments?: ClaimAttachment[];
  workflow?: ClaimWorkflow | null;
  workflow_steps?: ClaimWorkflowStep[];
  approval_actions?: ApprovalAction[];
  comments?: ClaimComment[];
  finance_review?: FinanceReview | null;
  payment?: Payment | null;
}

export interface ApprovalRule {
  id: string;
  name: string;
  description?: string | null;
  ministry_id?: string | null;
  ministry?: Ministry | null;
  expense_category_id?: string | null;
  expense_category?: ExpenseCategory | null;
  min_amount: number;
  max_amount?: number | null;
  sequence: number;
  approver_role: 'MINISTRY_LEADER' | 'FINANCE_OFFICER' | 'FINAL_APPROVER' | 'SPECIFIC_USER';
  approver_user_id?: string | null;
  approver_user?: Profile | null;
  is_active: boolean;
  priority: number;
  created_at: string;
  updated_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  claim_id?: string | null;
  type: string;
  title: string;
  message: string;
  link?: string | null;
  is_read: boolean;
  created_at: string;
}

export interface SystemSetting {
  id: string;
  key: string;
  value: Record<string, any>;
  description?: string | null;
  updated_by?: string | null;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  actor_id?: string | null;
  actor_name?: string | null;
  actor_email?: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  before_data?: Record<string, any> | null;
  after_data?: Record<string, any> | null;
  ip_address?: string | null;
  user_agent?: string | null;
  created_at: string;
}

export type PayeePaymentMethod = 'BANK_TRANSFER' | 'JOMPAY';
export type DirectoryKind = 'EVENT' | 'MISSION' | 'MEETING' | 'SPEAKER';
export interface ManagedClaimValue {
  id: string;
  kind: DirectoryKind;
  name: string;
  is_active: boolean;
}
export interface JompayDetails {
  biller_name: string;
  biller_code: string;
  reference_1: string;
  reference_2?: string;
  fail_email_1?: string;
  fail_email_2?: string;
}
export interface RecurringPayment {
  id: string;
  utility: 'Unifi' | 'Indah Water' | 'TNB' | 'Air Selangor' | string;
  payee_id: string;
  ministry_id: string;
  expense_category_id: string;
  amount_mode: 'FIXED' | 'VARIABLE';
  fixed_amount?: number | null;
  due_day: number;
  start_date: string;
  end_date?: string | null;
  is_active: boolean;
  owner_id: string;
}
