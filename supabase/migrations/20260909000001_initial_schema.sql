-- ============================================================================
-- NewLife Expense Claim Management System (NLCC) - Initial Schema
-- ============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Sequences
CREATE SEQUENCE IF NOT EXISTS claim_number_seq START WITH 1 INCREMENT BY 1;

-- 1. Profiles Table (Extends Supabase Auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    phone TEXT,
    ministry_id UUID,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'SUSPENDED')),
    bank_name TEXT,
    bank_account_number TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Roles Table
CREATE TABLE IF NOT EXISTS public.roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. User Roles (Many-to-Many RBAC)
CREATE TABLE IF NOT EXISTS public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, role_id)
);

-- 4. Ministries Table
CREATE TABLE IF NOT EXISTS public.ministries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    leader_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add foreign key constraint to profiles.ministry_id after ministries exists
ALTER TABLE public.profiles
    DROP CONSTRAINT IF EXISTS fk_profiles_ministry,
    ADD CONSTRAINT fk_profiles_ministry FOREIGN KEY (ministry_id) REFERENCES public.ministries(id) ON DELETE SET NULL;

-- 5. Expense Categories Table
CREATE TABLE IF NOT EXISTS public.expense_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    display_order INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Cost Centres Table
CREATE TABLE IF NOT EXISTS public.cost_centres (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    ministry_id UUID REFERENCES public.ministries(id) ON DELETE SET NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Claims Table
CREATE TABLE IF NOT EXISTS public.claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_number TEXT UNIQUE,
    claimant_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    ministry_id UUID NOT NULL REFERENCES public.ministries(id) ON DELETE RESTRICT,
    programme_event TEXT NOT NULL,
    cost_centre_id UUID NOT NULL REFERENCES public.cost_centres(id) ON DELETE RESTRICT,
    claim_date DATE NOT NULL DEFAULT CURRENT_DATE,
    purpose TEXT NOT NULL,
    payment_method TEXT NOT NULL DEFAULT 'PERSONAL_REIMBURSEMENT' 
        CHECK (payment_method IN ('PERSONAL_REIMBURSEMENT', 'CHURCH_CARD', 'DIRECT_VENDOR_PAYMENT', 'OTHER')),
    internal_reference TEXT,
    total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (total_amount >= 0),
    currency TEXT NOT NULL DEFAULT 'MYR',
    status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN (
        'DRAFT',
        'SUBMITTED',
        'PENDING_MINISTRY_APPROVAL',
        'PENDING_FINANCE_REVIEW',
        'PENDING_FINAL_APPROVAL',
        'RETURNED_FOR_CLARIFICATION',
        'REJECTED',
        'APPROVED',
        'APPROVED_FOR_PAYMENT',
        'PAID',
        'CANCELLED'
    )),
    declaration_accepted BOOLEAN NOT NULL DEFAULT FALSE,
    declaration_timestamp TIMESTAMPTZ,
    submitted_at TIMESTAMPTZ,
    current_step_sequence INT DEFAULT 1,
    rejection_reason TEXT,
    clarification_reason TEXT,
    returned_by UUID REFERENCES public.profiles(id),
    returned_at TIMESTAMPTZ,
    resubmitted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Claim Expenses Table (Multiple Lines)
CREATE TABLE IF NOT EXISTS public.claim_expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
    expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
    expense_category_id UUID NOT NULL REFERENCES public.expense_categories(id) ON DELETE RESTRICT,
    vendor TEXT,
    description TEXT NOT NULL,
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    notes TEXT,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. Claim Attachments Table (Receipts & Supporting Documents)
CREATE TABLE IF NOT EXISTS public.claim_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
    expense_id UUID REFERENCES public.claim_expenses(id) ON DELETE SET NULL,
    storage_path TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    file_size BIGINT NOT NULL,
    file_category TEXT NOT NULL DEFAULT 'RECEIPT' CHECK (file_category IN ('RECEIPT', 'INVOICE', 'SUPPORTING_DOC', 'OTHER')),
    uploaded_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. Approval Rules Table (Configurable Dynamic Engine)
CREATE TABLE IF NOT EXISTS public.approval_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    ministry_id UUID REFERENCES public.ministries(id) ON DELETE CASCADE,
    expense_category_id UUID REFERENCES public.expense_categories(id) ON DELETE SET NULL,
    min_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    max_amount NUMERIC(12, 2),
    sequence INT NOT NULL DEFAULT 1,
    approver_role TEXT NOT NULL CHECK (approver_role IN ('MINISTRY_LEADER', 'FINANCE_OFFICER', 'FINAL_APPROVER', 'SPECIFIC_USER')),
    approver_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    priority INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. Claim Workflows Table (Instance per Claim)
CREATE TABLE IF NOT EXISTS public.claim_workflows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
    is_current BOOLEAN NOT NULL DEFAULT TRUE,
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 12. Claim Workflow Steps Table (Snapshot of steps for a claim)
CREATE TABLE IF NOT EXISTS public.claim_workflow_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID NOT NULL REFERENCES public.claim_workflows(id) ON DELETE CASCADE,
    claim_id UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
    sequence INT NOT NULL,
    step_name TEXT NOT NULL,
    approver_role TEXT NOT NULL,
    assigned_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED', 'REJECTED', 'RETURNED')),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    completed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    action_taken TEXT,
    comments TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(workflow_id, sequence)
);

-- 13. Approval Actions Table (Immutable Audit of Approval Decisions)
CREATE TABLE IF NOT EXISTS public.approval_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
    workflow_step_id UUID REFERENCES public.claim_workflow_steps(id) ON DELETE SET NULL,
    actor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    actor_role TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('SUBMIT', 'APPROVE', 'RETURN_FOR_CLARIFICATION', 'REJECT', 'ADMIN_OVERRIDE', 'RESUBMIT', 'VERIFY', 'PAY', 'CANCEL')),
    comment TEXT,
    previous_status TEXT NOT NULL,
    new_status TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 14. Claim Comments Table
CREATE TABLE IF NOT EXISTS public.claim_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    author_role TEXT NOT NULL,
    content TEXT NOT NULL,
    visibility TEXT NOT NULL DEFAULT 'PUBLIC_WORKFLOW' CHECK (visibility IN ('PUBLIC_WORKFLOW', 'FINANCE_INTERNAL', 'ADMIN_ONLY')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 15. Finance Reviews Table
CREATE TABLE IF NOT EXISTS public.finance_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
    reviewer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    receipts_verified BOOLEAN NOT NULL DEFAULT FALSE,
    category_verified BOOLEAN NOT NULL DEFAULT FALSE,
    cost_centre_verified BOOLEAN NOT NULL DEFAULT FALSE,
    status TEXT NOT NULL DEFAULT 'VERIFIED',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 16. Payments Table
CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id UUID NOT NULL UNIQUE REFERENCES public.claims(id) ON DELETE CASCADE,
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    payment_date DATE NOT NULL,
    payment_reference TEXT NOT NULL,
    payment_method TEXT NOT NULL DEFAULT 'BANK_TRANSFER' CHECK (payment_method IN ('BANK_TRANSFER', 'CHEQUE', 'CASH', 'ONLINE_BANKING', 'DUITNOW', 'OTHER')),
    notes TEXT,
    processed_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 17. Notifications Table
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    claim_id UUID REFERENCES public.claims(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    link TEXT,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 18. System Settings Table
CREATE TABLE IF NOT EXISTS public.system_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT NOT NULL UNIQUE,
    value JSONB NOT NULL,
    description TEXT,
    updated_by UUID REFERENCES public.profiles(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 19. Audit Logs Table (Append-Only)
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    actor_name TEXT,
    actor_email TEXT,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    before_data JSONB,
    after_data JSONB,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for High Performance
CREATE INDEX IF NOT EXISTS idx_claims_claimant_id ON public.claims(claimant_id);
CREATE INDEX IF NOT EXISTS idx_claims_ministry_id ON public.claims(ministry_id);
CREATE INDEX IF NOT EXISTS idx_claims_status ON public.claims(status);
CREATE INDEX IF NOT EXISTS idx_claims_claim_number ON public.claims(claim_number);
CREATE INDEX IF NOT EXISTS idx_claims_submitted_at ON public.claims(submitted_at);

CREATE INDEX IF NOT EXISTS idx_claim_expenses_claim_id ON public.claim_expenses(claim_id);
CREATE INDEX IF NOT EXISTS idx_claim_attachments_claim_id ON public.claim_attachments(claim_id);
CREATE INDEX IF NOT EXISTS idx_workflow_steps_claim_id ON public.claim_workflow_steps(claim_id);
CREATE INDEX IF NOT EXISTS idx_workflow_steps_status ON public.claim_workflow_steps(status);
CREATE INDEX IF NOT EXISTS idx_approval_actions_claim_id ON public.approval_actions(claim_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON public.audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON public.audit_logs(actor_id);
