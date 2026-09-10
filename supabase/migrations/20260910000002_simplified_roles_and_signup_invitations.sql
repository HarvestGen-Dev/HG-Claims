-- Migration: 20260910000002_simplified_roles_and_signup_invitations.sql
-- Description: Simplifies roles to MINISTRY_LEADER, FINANCE_OFFICER, SYSTEM_ADMIN.
-- Adds signup_invitations table for admin-generated invitation links and onboarding_completed_at on profiles.

-- 1. Add onboarding_completed_at to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS default_ministry_id UUID NULL REFERENCES public.ministries(id) ON DELETE SET NULL;

-- Backfill onboarding_completed_at for existing profiles that already have full_name
UPDATE public.profiles
SET onboarding_completed_at = COALESCE(updated_at, created_at, NOW())
WHERE (full_name IS NOT NULL AND full_name != '') AND onboarding_completed_at IS NULL;

-- 2. Create signup_invitations table
CREATE TABLE IF NOT EXISTS public.signup_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash TEXT UNIQUE NOT NULL,
  role_code TEXT NOT NULL CHECK (role_code IN ('MINISTRY_LEADER', 'FINANCE_OFFICER', 'SYSTEM_ADMIN')),
  ministry_id UUID NULL REFERENCES public.ministries(id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  description TEXT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  max_uses INTEGER NOT NULL DEFAULT 1 CHECK (max_uses >= 1),
  use_count INTEGER NOT NULL DEFAULT 0 CHECK (use_count >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ NULL
);

-- Indexes for efficient lookup
CREATE INDEX IF NOT EXISTS idx_signup_invitations_token_hash ON public.signup_invitations(token_hash);
CREATE INDEX IF NOT EXISTS idx_signup_invitations_active_expires ON public.signup_invitations(is_active, expires_at);

-- 3. RLS Policies for signup_invitations
ALTER TABLE public.signup_invitations ENABLE ROW LEVEL SECURITY;

-- Admins can view and manage invitations
DROP POLICY IF EXISTS "Admins can manage signup invitations" ON public.signup_invitations;
CREATE POLICY "Admins can manage signup invitations"
  ON public.signup_invitations
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.roles r ON ur.role_id = r.id
      WHERE ur.user_id = auth.uid() AND r.code = 'SYSTEM_ADMIN'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.roles r ON ur.role_id = r.id
      WHERE ur.user_id = auth.uid() AND r.code = 'SYSTEM_ADMIN'
    )
  );

-- 4. Simplified Workflow Engine Function
-- New claims generate exactly ONE workflow step: Finance Review (FINANCE_OFFICER)
CREATE OR REPLACE FUNCTION public.build_workflow(
  p_claim_id UUID,
  p_submitted_by_user_id UUID,
  p_ministry_id UUID,
  p_total_amount NUMERIC
) RETURNS VOID AS $$
DECLARE
  v_step_id UUID;
  v_finance_user_id UUID;
BEGIN
  -- Clear any pre-existing workflow steps
  DELETE FROM public.claim_workflow_steps WHERE claim_id = p_claim_id;

  -- Optional: Find an active finance officer who is NOT the submitter
  SELECT p.id INTO v_finance_user_id
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id
  JOIN public.roles r ON r.id = ur.role_id
  WHERE r.code = 'FINANCE_OFFICER'
    AND p.status = 'ACTIVE'
    AND p.id != p_submitted_by_user_id
  ORDER BY p.created_at ASC
  LIMIT 1;

  -- Step 1: Finance Review
  INSERT INTO public.claim_workflow_steps (
    id,
    claim_id,
    step_order,
    step_name,
    approver_role,
    assigned_user_id,
    status,
    started_at
  ) VALUES (
    gen_random_uuid(),
    p_claim_id,
    1,
    'Finance Review',
    'FINANCE_OFFICER',
    v_finance_user_id,
    'IN_PROGRESS',
    NOW()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Updated Claim Visibility & Authorization RLS helper
CREATE OR REPLACE FUNCTION public.can_read_claim(claim_row public.claims)
RETURNS BOOLEAN AS $$
BEGIN
  -- Submitter can always read their own submitted claim
  IF claim_row.submitted_by_user_id = auth.uid() OR claim_row.claimant_id = auth.uid() THEN
    RETURN TRUE;
  END IF;

  -- System Admins can read all claims
  IF EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.roles r ON ur.role_id = r.id
    WHERE ur.user_id = auth.uid() AND r.code = 'SYSTEM_ADMIN'
  ) THEN
    RETURN TRUE;
  END IF;

  -- Finance Officers can read all submitted claims
  IF EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.roles r ON ur.role_id = r.id
    WHERE ur.user_id = auth.uid() AND r.code = 'FINANCE_OFFICER'
  ) THEN
    RETURN TRUE;
  END IF;

  -- Ministry Leaders can read claims within their ministry
  IF EXISTS (
    SELECT 1 FROM public.ministries m
    WHERE m.id = claim_row.ministry_id AND m.leader_id = auth.uid()
  ) THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
