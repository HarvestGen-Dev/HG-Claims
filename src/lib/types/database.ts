export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';

export type RoleCode =
  | 'MINISTRY_LEADER'
  | 'FINANCE_OFFICER'
  | 'SYSTEM_ADMIN';

export type LegacyRoleCode =
  | RoleCode
  | 'CLAIMANT'
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
  onboarding_completed_at?: string | null;
  /** @deprecated Removed from profile requirements */
  bank_name?: string | null;
  /** @deprecated Removed from profile requirements */
  bank_account_number?: string | null;
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

export interface Ministry {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  leader_id?: string | null;
  leader?: Profile | null;
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
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ClaimExpense {
  id: string;
  claim_id: string;
  expense_date: string;
  expense_category_id: string;
  expense_category?: ExpenseCategory | null;
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
  payment_method: 'BANK_TRANSFER' | 'CHEQUE' | 'CASH' | 'ONLINE_BANKING' | 'DUITNOW' | 'OTHER';
  notes?: string | null;
  processed_by: string;
  processor?: Profile | null;
  created_at: string;
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
  bank_account_number?: string | null;
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
