-- Migration: 20261108174500_team_leads_budgets_encryption.sql
-- Description:
-- 1. Enables pgcrypto extension and configures AES bank account encryption at rest.
-- 2. Adds TEAM_LEAD role to roles table and signup_invitations constraints.
-- 3. Creates public.ministry_team_leads junction table (0 or more team leads per ministry).
-- 4. Creates public.ministry_budgets table for annual ministry budgets with spend tracking.
-- 5. Updates private.command with set_ministry_budget, set_ministry_team_leads, bank account encryption,
--    and removes vendor_name requirement on claim submission.
-- 6. Updates private.redact_workspace_snapshot to decrypt bank details only for admin, finance, team leads, and owners.
-- 7. Updates private.paginate_claims, private.snapshot, and private.domain_snapshot to project disbursement voucher
--    and batch number references, and ministry team leads and budgets.

BEGIN;

-- 1. Enable pgcrypto in extensions schema
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- 2. Register TEAM_LEAD role in public.roles
INSERT INTO public.roles (code, name, description)
VALUES ('TEAM_LEAD', 'Team Lead', 'Can submit claims and view their ministry budget')
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name, description = EXCLUDED.description;

-- Update signup_invitations constraint to support TEAM_LEAD
ALTER TABLE public.signup_invitations DROP CONSTRAINT IF EXISTS signup_invitations_role_code_check;
ALTER TABLE public.signup_invitations ADD CONSTRAINT signup_invitations_role_code_check
  CHECK (role_code IN ('CLAIMANT', 'TEAM_LEAD', 'FINANCE_OFFICER', 'SYSTEM_ADMIN'));

-- 3. Junction table for Ministry Team Leads (0 or more per ministry)
CREATE TABLE IF NOT EXISTS public.ministry_team_leads (
  ministry_id UUID NOT NULL REFERENCES public.ministries(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (ministry_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_ministry_team_leads_user ON public.ministry_team_leads(user_id);
CREATE INDEX IF NOT EXISTS idx_ministry_team_leads_ministry ON public.ministry_team_leads(ministry_id);
ALTER TABLE public.ministry_team_leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read ministry team leads" ON public.ministry_team_leads;
CREATE POLICY "Authenticated users can read ministry team leads"
  ON public.ministry_team_leads FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins and finance can manage ministry team leads" ON public.ministry_team_leads;
CREATE POLICY "Admins and finance can manage ministry team leads"
  ON public.ministry_team_leads FOR ALL
  TO authenticated
  USING (private.has_role('SYSTEM_ADMIN') OR private.has_role('FINANCE_OFFICER'))
  WITH CHECK (private.has_role('SYSTEM_ADMIN') OR private.has_role('FINANCE_OFFICER'));

-- 4. Annual Ministry Budgets table
CREATE TABLE IF NOT EXISTS public.ministry_budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ministry_id UUID NOT NULL REFERENCES public.ministries(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  notes TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_ministry_budgets_ministry_year UNIQUE (ministry_id, year),
  CONSTRAINT chk_ministry_budgets_year CHECK (year >= 2020 AND year <= 2100),
  CONSTRAINT chk_ministry_budgets_amount CHECK (amount >= 0)
);

CREATE INDEX IF NOT EXISTS idx_ministry_budgets_ministry ON public.ministry_budgets(ministry_id);
ALTER TABLE public.ministry_budgets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read ministry budgets" ON public.ministry_budgets;
CREATE POLICY "Authenticated users can read ministry budgets"
  ON public.ministry_budgets FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins and finance can manage ministry budgets" ON public.ministry_budgets;
CREATE POLICY "Admins and finance can manage ministry budgets"
  ON public.ministry_budgets FOR ALL
  TO authenticated
  USING (private.has_role('SYSTEM_ADMIN') OR private.has_role('FINANCE_OFFICER'))
  WITH CHECK (private.has_role('SYSTEM_ADMIN') OR private.has_role('FINANCE_OFFICER'));

-- Grants
GRANT ALL ON public.ministry_team_leads TO service_role;
GRANT ALL ON public.ministry_budgets TO service_role;
GRANT SELECT ON public.ministry_team_leads TO authenticated;
GRANT SELECT ON public.ministry_budgets TO authenticated;

-- 5. Symmetric bank account encryption functions
CREATE OR REPLACE FUNCTION private.get_encryption_key() RETURNS text
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
  SELECT 'hg-claims-vault-key-2026-v1-secret-phrase-harvest-generation'::text;
$$;
REVOKE ALL ON FUNCTION private.get_encryption_key() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.encrypt_bank_account(p_account text) RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_clean text;
BEGIN
  IF p_account IS NULL THEN RETURN NULL; END IF;
  v_clean := regexp_replace(trim(p_account), '[\s\-]', '', 'g');
  IF v_clean = '' THEN RETURN NULL; END IF;
  IF v_clean LIKE 'enc:aes:%' THEN RETURN v_clean; END IF;
  RETURN 'enc:aes:' || encode(extensions.pgp_sym_encrypt(v_clean, private.get_encryption_key()), 'hex');
END;
$$;
REVOKE ALL ON FUNCTION private.encrypt_bank_account(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.decrypt_bank_account(p_account text) RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF p_account IS NULL OR trim(p_account) = '' THEN RETURN NULL; END IF;
  IF p_account LIKE 'enc:aes:%' THEN
    BEGIN
      RETURN extensions.pgp_sym_decrypt(decode(substring(p_account from 9), 'hex'), private.get_encryption_key());
    EXCEPTION WHEN OTHERS THEN
      RETURN p_account;
    END;
  END IF;
  RETURN p_account;
END;
$$;
REVOKE ALL ON FUNCTION private.decrypt_bank_account(text) FROM PUBLIC, anon, authenticated;

-- 6. Migrate existing plaintext bank account numbers
UPDATE public.profiles
SET bank_account_number = private.encrypt_bank_account(bank_account_number)
WHERE bank_account_number IS NOT NULL AND bank_account_number NOT LIKE 'enc:aes:%';

UPDATE public.claims
SET bank_account_number = private.encrypt_bank_account(bank_account_number)
WHERE bank_account_number IS NOT NULL AND bank_account_number NOT LIKE 'enc:aes:%';

UPDATE public.reimbursement_batch_instructions
SET beneficiary_account_number = private.encrypt_bank_account(beneficiary_account_number)
WHERE beneficiary_account_number IS NOT NULL AND beneficiary_account_number NOT LIKE 'enc:aes:%';

UPDATE public.claims
SET approved_snapshot = jsonb_set(
  approved_snapshot,
  '{bank_account_number}',
  to_jsonb(private.encrypt_bank_account(approved_snapshot->>'bank_account_number'))
)
WHERE approved_snapshot ? 'bank_account_number'
  AND approved_snapshot->>'bank_account_number' IS NOT NULL
  AND approved_snapshot->>'bank_account_number' NOT LIKE 'enc:aes:%';

-- 7. Update private.can_read_claim to allow Ministry Team Leads to read claims for their ministry
CREATE OR REPLACE FUNCTION private.can_read_claim(claim_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.active_user() AND EXISTS (
    SELECT 1 FROM public.claims c WHERE c.id = claim_id AND (
      c.submitted_by_user_id = auth.uid() OR c.claimant_id = auth.uid() OR (c.status <> 'DRAFT' AND (
        private.has_role('SYSTEM_ADMIN') OR private.has_role('FINANCE_OFFICER') OR
        EXISTS (
          SELECT 1 FROM public.ministry_team_leads mtl
          WHERE mtl.user_id = auth.uid() AND mtl.ministry_id = c.ministry_id
        ) OR
        EXISTS (
          SELECT 1 FROM public.claim_workflow_steps s WHERE s.claim_id = c.id AND
          (s.assigned_user_id = auth.uid() OR (s.assigned_user_id IS NULL AND private.has_role(s.approver_role)))
        )
      ))
    )
  );
$$;

-- 8. Update private.redact_workspace_snapshot
-- Decrypts bank account number only for SYSTEM_ADMIN, FINANCE_OFFICER, TEAM_LEAD of ministry, and profile owner/creator
CREATE OR REPLACE FUNCTION private.redact_workspace_snapshot(p_snapshot jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  result jsonb := p_snapshot;
  caller uuid := auth.uid();
  privileged boolean := private.has_role('FINANCE_OFFICER') OR private.has_role('SYSTEM_ADMIN');
  is_team_lead boolean := private.has_role('TEAM_LEAD');
  profiles jsonb;
  claims jsonb;
  reimbursement_batches jsonb;
BEGIN
  IF NOT private.active_user() THEN
    RAISE EXCEPTION 'Active account required' USING ERRCODE = '42501';
  END IF;

  IF result ? 'profiles' THEN
    SELECT COALESCE(jsonb_agg(
      CASE
        WHEN privileged OR p->>'id' = caller::text OR p->>'created_by_user_id' = caller::text THEN
          CASE
            WHEN p->>'bank_account_number' IS NOT NULL THEN
              jsonb_set(p, '{bank_account_number}', to_jsonb(private.decrypt_bank_account(p->>'bank_account_number')))
            ELSE p
          END
        WHEN is_team_lead AND p->>'ministry_id' IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.ministry_team_leads mtl
          WHERE mtl.user_id = caller AND mtl.ministry_id = (p->>'ministry_id')::uuid
        ) THEN
          CASE
            WHEN p->>'bank_account_number' IS NOT NULL THEN
              jsonb_set(p, '{bank_account_number}', to_jsonb(private.decrypt_bank_account(p->>'bank_account_number')))
            ELSE p
          END
        ELSE
          p - 'bank_name' - 'bank_code' - 'bank_account_holder_name'
            - 'bank_account_number' - 'beneficiary_new_ic' - 'beneficiary_old_ic'
            - 'beneficiary_business_reg' - 'beneficiary_others' - 'beneficiary_address'
            - 'phone' - 'email'
      END
    ), '[]'::jsonb) INTO profiles
    FROM jsonb_array_elements(result->'profiles') p;
    result := jsonb_set(result, '{profiles}', profiles);
  END IF;

  IF result ? 'claims' THEN
    SELECT COALESCE(jsonb_agg(
      CASE
        WHEN privileged OR c->>'claimant_id' = caller::text OR c->>'submitted_by_user_id' = caller::text THEN
          CASE
            WHEN c->>'bank_account_number' IS NOT NULL THEN
              jsonb_set(c, '{bank_account_number}', to_jsonb(private.decrypt_bank_account(c->>'bank_account_number')))
            ELSE c
          END
        WHEN is_team_lead AND c->>'ministry_id' IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.ministry_team_leads mtl
          WHERE mtl.user_id = caller AND mtl.ministry_id = (c->>'ministry_id')::uuid
        ) THEN
          CASE
            WHEN c->>'bank_account_number' IS NOT NULL THEN
              jsonb_set(c, '{bank_account_number}', to_jsonb(private.decrypt_bank_account(c->>'bank_account_number')))
            ELSE c
          END
        ELSE
          c - 'bank_name' - 'bank_code' - 'bank_account_holder_name'
            - 'bank_account_number' - 'beneficiary_new_ic' - 'beneficiary_old_ic'
            - 'beneficiary_business_reg' - 'beneficiary_others' - 'beneficiary_address' - 'approved_snapshot'
      END
    ), '[]'::jsonb) INTO claims
    FROM jsonb_array_elements(result->'claims') c;
    result := jsonb_set(result, '{claims}', claims);
  END IF;

  IF result ? 'reimbursementBatches' AND privileged THEN
    SELECT COALESCE(jsonb_agg(
      jsonb_set(
        rb,
        '{instructions}',
        COALESCE((
          SELECT jsonb_agg(
            CASE
              WHEN inst->>'beneficiary_account_number' IS NOT NULL THEN
                jsonb_set(
                  inst,
                  '{beneficiary_account_number}',
                  to_jsonb(private.decrypt_bank_account(inst->>'beneficiary_account_number'))
                )
              ELSE inst
            END
          )
          FROM jsonb_array_elements(rb->'instructions') inst
        ), '[]'::jsonb)
      )
    ), '[]'::jsonb) INTO reimbursement_batches
    FROM jsonb_array_elements(result->'reimbursementBatches') rb;
    result := jsonb_set(result, '{reimbursementBatches}', reimbursement_batches);
  END IF;

  RETURN result;
END $$;

REVOKE ALL ON FUNCTION private.redact_workspace_snapshot(jsonb) FROM PUBLIC, anon, authenticated;

-- 9. Update private.command to handle:
--    - set_ministry_budget
--    - set_ministry_team_leads
--    - encrypt bank accounts on save
--    - remove vendor_name check on expense items
--    - permit CLAIMANT, TEAM_LEAD, FINANCE_OFFICER, SYSTEM_ADMIN to create claims
CREATE OR REPLACE FUNCTION private.command(action text, payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  uid uuid; admin boolean; finance boolean; config jsonb;
  c public.claims%ROWTYPE; s public.claim_workflow_steps%ROWTYPE;
  next_step public.claim_workflow_steps%ROWTYPE;
  cid uuid; total numeric; action_code text; previous_status text; submitter uuid;
  row_id uuid; entity jsonb; table_name text; item jsonb;
  v_bank_code text; v_bank_name text; v_holder_name text; v_acct text;
  v_batch_id uuid; v_batch public.reimbursement_batches%ROWTYPE;
  v_inst public.reimbursement_batch_instructions%ROWTYPE;
  v_claim_ids uuid[]; v_claim_count integer; v_transfer_count integer;
  v_total_cents bigint; v_batch_num text; v_digest text; v_line_order integer;
  v_pay_desc text; v_inst_id uuid; v_group record;
  v_unsettled_count integer; v_paid_count integer; v_failed_count integer;
  v_claimant_id uuid; v_payee_prof public.profiles%ROWTYPE;
  v_raw_acct text;
BEGIN
  IF NOT private.active_user() THEN RAISE EXCEPTION 'Active account required' USING ERRCODE='42501'; END IF;
  uid=auth.uid(); admin=private.has_role('SYSTEM_ADMIN'); finance=private.has_role('FINANCE_OFFICER');
  SELECT value INTO config FROM public.system_settings WHERE key='claim_form_config';

  IF action IN ('save_draft','submit_claim') THEN
    IF payload->>'request_key' IS NOT NULL THEN
      BEGIN
        PERFORM (payload->>'request_key')::uuid;
      EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'Invalid request key format';
      END;
    END IF;

    IF NOT (admin OR finance OR private.has_role('CLAIMANT') OR private.has_role('TEAM_LEAD')) THEN
      RAISE EXCEPTION 'Claimant, Team Lead, Finance Officer, or System Admin access is required to submit claims' USING ERRCODE='42501';
    END IF;

    IF payload->>'id' IS NOT NULL THEN
      cid=(payload->>'id')::uuid;
    ELSIF payload->>'request_key' IS NOT NULL THEN
      PERFORM pg_advisory_xact_lock(hashtextextended(uid::text || (payload->>'request_key'),0));
      SELECT id INTO cid FROM public.claims WHERE (submitted_by_user_id=uid OR claimant_id=uid)
        AND request_key=(payload->>'request_key')::uuid;
      IF cid IS NOT NULL AND EXISTS(SELECT 1 FROM public.claims WHERE id=cid AND status NOT IN ('DRAFT','RETURNED_FOR_CLARIFICATION')) THEN
        RETURN jsonb_build_object('id',cid);
      END IF;
    END IF;

    IF cid IS NOT NULL THEN
      SELECT * INTO c FROM public.claims WHERE id=cid FOR UPDATE;
      IF c.id IS NULL OR (c.submitted_by_user_id<>uid AND c.claimant_id<>uid) OR c.status NOT IN ('DRAFT','RETURNED_FOR_CLARIFICATION') THEN
        RAISE EXCEPTION 'This claim cannot be edited' USING ERRCODE='42501';
      END IF;
      IF payload->>'version' IS NULL OR c.version<>(payload->>'version')::integer THEN
        RAISE EXCEPTION 'This claim changed. Refresh it before saving' USING ERRCODE='PT409';
      END IF;
    END IF;

    IF NOT EXISTS(SELECT 1 FROM public.ministries WHERE id=(payload->>'ministry_id')::uuid AND is_active) THEN
      RAISE EXCEPTION 'Choose an active ministry';
    END IF;
    IF jsonb_typeof(payload->'expenses') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid receipt list'; END IF;
    IF jsonb_array_length(payload->'expenses')>100 THEN RAISE EXCEPTION 'Invalid receipt list'; END IF;

    -- Resolve linked Claimant / Payee Profile if selected from dropdown
    v_claimant_id := uid;
    IF NULLIF(trim(COALESCE(payload->>'payee_profile_id', '')), '') IS NOT NULL THEN
      SELECT * INTO v_payee_prof FROM public.profiles WHERE id = (payload->>'payee_profile_id')::uuid AND status = 'ACTIVE';
      IF v_payee_prof.id IS NOT NULL THEN
        v_claimant_id := v_payee_prof.id;
      END IF;
    ELSIF NULLIF(trim(COALESCE(payload->>'claimant_id', '')), '') IS NOT NULL THEN
      SELECT * INTO v_payee_prof FROM public.profiles WHERE id = (payload->>'claimant_id')::uuid AND status = 'ACTIVE';
      IF v_payee_prof.id IS NOT NULL AND (v_payee_prof.id = uid OR COALESCE(v_payee_prof.is_payee_only, FALSE) = TRUE) THEN
        v_claimant_id := v_payee_prof.id;
      END IF;
    END IF;
    IF v_payee_prof.id IS NULL THEN
      SELECT * INTO v_payee_prof FROM public.profiles WHERE id = v_claimant_id;
    END IF;

    v_bank_code := private.resolve_canonical_swift_code(COALESCE(
      NULLIF(trim(payload->>'bank_code'),''),
      NULLIF(trim(payload->>'bank_name'),''),
      v_payee_prof.bank_code,
      v_payee_prof.bank_name
    ));
    IF v_bank_code IS NOT NULL THEN
      SELECT bank_name INTO v_bank_name FROM public.bank_directory WHERE swift_code = v_bank_code;
    ELSE
      v_bank_name := COALESCE(NULLIF(trim(COALESCE(payload->>'bank_name','')),''), v_payee_prof.bank_name);
    END IF;
    v_holder_name := COALESCE(
      NULLIF(trim(COALESCE(payload->>'bank_account_holder_name','')),''),
      NULLIF(trim(COALESCE(v_payee_prof.bank_account_holder_name,'')),''),
      NULLIF(trim(COALESCE(payload->>'claimant_name','')),''),
      v_payee_prof.full_name
    );
    v_acct := COALESCE(
      NULLIF(regexp_replace(trim(COALESCE(payload->>'bank_account_number','')), '[\s\-]', '', 'g'), ''),
      NULLIF(regexp_replace(trim(COALESCE(private.decrypt_bank_account(v_payee_prof.bank_account_number),'')), '[\s\-]', '', 'g'), '')
    );

    IF action='submit_claim' THEN
      IF NOT COALESCE((payload->>'declaration_accepted')::boolean,false) OR
        length(trim(COALESCE(payload->>'claimant_name', v_payee_prof.full_name, '')))=0 OR length(trim(COALESCE(payload->>'purpose','')))=0 OR
        jsonb_array_length(payload->'expenses')=0 THEN
        RAISE EXCEPTION 'Complete the claimant name, purpose, receipts, and accept the declaration';
      END IF;
      IF v_acct IS NOT NULL AND v_acct !~ '^[A-Za-z0-9]{5,34}$' THEN
        RAISE EXCEPTION 'Enter a valid bank account number (5 to 34 characters)';
      END IF;
    END IF;

    previous_status=COALESCE(c.status,'DRAFT');
    IF cid IS NULL THEN
      INSERT INTO public.claims(
        submitted_by_user_id, claimant_id, claimant_name, claimant_email, claimant_phone,
        bank_name, bank_code, bank_account_holder_name, bank_account_number,
        beneficiary_new_ic, beneficiary_old_ic, beneficiary_business_reg, beneficiary_others, beneficiary_address,
        ministry_id, claim_date, purpose, internal_reference, request_key
      )
      VALUES(
        uid, v_claimant_id, COALESCE(NULLIF(trim(COALESCE(payload->>'claimant_name','')),''), v_payee_prof.full_name, ''),
        COALESCE(NULLIF(trim(COALESCE(payload->>'claimant_email','')),''), v_payee_prof.email),
        COALESCE(NULLIF(trim(COALESCE(payload->>'claimant_phone','')),''), v_payee_prof.phone),
        v_bank_name, v_bank_code, v_holder_name, private.encrypt_bank_account(v_acct),
        COALESCE(NULLIF(trim(COALESCE(payload->>'beneficiary_new_ic','')),''), v_payee_prof.beneficiary_new_ic),
        COALESCE(NULLIF(trim(COALESCE(payload->>'beneficiary_old_ic','')),''), v_payee_prof.beneficiary_old_ic),
        COALESCE(NULLIF(trim(COALESCE(payload->>'beneficiary_business_reg','')),''), v_payee_prof.beneficiary_business_reg),
        COALESCE(NULLIF(trim(COALESCE(payload->>'beneficiary_others','')),''), v_payee_prof.beneficiary_others),
        COALESCE(NULLIF(trim(COALESCE(payload->>'beneficiary_address','')),''), v_payee_prof.beneficiary_address),
        (payload->>'ministry_id')::uuid,
        (payload->>'claim_date')::date,
        trim(payload->>'purpose'),
        NULLIF(trim(COALESCE(payload->>'internal_reference','')),''),
        NULLIF(payload->>'request_key','')::uuid
      )
      RETURNING id INTO cid;
    ELSE
      UPDATE public.claims SET
        submitted_by_user_id=COALESCE(c.submitted_by_user_id, uid),
        claimant_id=v_claimant_id,
        claimant_name=COALESCE(NULLIF(trim(COALESCE(payload->>'claimant_name','')),''), v_payee_prof.full_name, c.claimant_name),
        claimant_email=COALESCE(NULLIF(trim(COALESCE(payload->>'claimant_email','')),''), v_payee_prof.email),
        claimant_phone=COALESCE(NULLIF(trim(COALESCE(payload->>'claimant_phone','')),''), v_payee_prof.phone),
        bank_name=v_bank_name,
        bank_code=v_bank_code,
        bank_account_holder_name=v_holder_name,
        bank_account_number=private.encrypt_bank_account(v_acct),
        beneficiary_new_ic=COALESCE(NULLIF(trim(COALESCE(payload->>'beneficiary_new_ic','')),''), v_payee_prof.beneficiary_new_ic),
        beneficiary_old_ic=COALESCE(NULLIF(trim(COALESCE(payload->>'beneficiary_old_ic','')),''), v_payee_prof.beneficiary_old_ic),
        beneficiary_business_reg=COALESCE(NULLIF(trim(COALESCE(payload->>'beneficiary_business_reg','')),''), v_payee_prof.beneficiary_business_reg),
        beneficiary_others=COALESCE(NULLIF(trim(COALESCE(payload->>'beneficiary_others','')),''), v_payee_prof.beneficiary_others),
        beneficiary_address=COALESCE(NULLIF(trim(COALESCE(payload->>'beneficiary_address','')),''), v_payee_prof.beneficiary_address),
        ministry_id=(payload->>'ministry_id')::uuid,
        claim_date=(payload->>'claim_date')::date,
        purpose=trim(payload->>'purpose'),
        internal_reference=NULLIF(trim(COALESCE(payload->>'internal_reference','')),'')
      WHERE id=cid;
    END IF;

    DELETE FROM public.claim_expenses WHERE claim_id=cid;
    total=0;
    FOR item IN SELECT * FROM jsonb_array_elements(payload->'expenses') LOOP
      IF length(trim(COALESCE(item->>'description','')))=0 OR (item->>'amount')::numeric<=0 THEN
        RAISE EXCEPTION 'Each expense needs a description and positive amount';
      END IF;

      IF item->>'expense_category_id' IS NOT NULL AND NOT EXISTS(
        SELECT 1 FROM public.expense_categories WHERE id=(item->>'expense_category_id')::uuid AND is_active
      ) THEN
        RAISE EXCEPTION 'Invalid expense category';
      END IF;

      IF item->>'cost_centre_id' IS NOT NULL AND NOT EXISTS(
        SELECT 1 FROM public.cost_centres
        WHERE id=(item->>'cost_centre_id')::uuid AND is_active
          AND (ministry_id IS NULL OR ministry_id = (payload->>'ministry_id')::uuid)
      ) THEN
        RAISE EXCEPTION 'Select a valid, active cost centre for this ministry';
      END IF;

      INSERT INTO public.claim_expenses(
        claim_id, expense_date, expense_category_id, cost_centre_id, vendor, description, amount, sort_order
      )
      VALUES(
        cid,
        (item->>'expense_date')::date,
        NULLIF(item->>'expense_category_id','')::uuid,
        NULLIF(item->>'cost_centre_id','')::uuid,
        NULLIF(trim(COALESCE(item->>'vendor','')),''),
        trim(item->>'description'),
        (item->>'amount')::numeric,
        COALESCE((item->>'sort_order')::integer,0)
      );
      total=total + (item->>'amount')::numeric;
    END LOOP;

    DELETE FROM public.claim_attachments WHERE claim_id=cid;
    IF payload ? 'attachments' AND jsonb_typeof(payload->'attachments')='array' THEN
      FOR item IN SELECT * FROM jsonb_array_elements(payload->'attachments') LOOP
        INSERT INTO public.claim_attachments(claim_id,file_name,file_size,mime_type,storage_path)
        VALUES(cid,item->>'file_name',(item->>'file_size')::bigint,item->>'mime_type',item->>'storage_path');
      END LOOP;
    END IF;

    IF action='submit_claim' AND COALESCE((config->>'require_receipt_for_all_expenses')::boolean,true) AND
      NOT EXISTS(SELECT 1 FROM public.claim_attachments WHERE claim_id=cid) THEN
      RAISE EXCEPTION 'Attach at least one receipt';
    END IF;

    IF action='submit_claim' THEN
      UPDATE public.claims SET
        status='PENDING_FINANCE_REVIEW',
        submitted_at=now(),
        declaration_accepted=true,
        declaration_timestamp=now(),
        version=version+1
      WHERE id=cid;
      PERFORM private.build_workflow(cid);
      action_code='SUBMIT';
    ELSE
      UPDATE public.claims SET status='DRAFT', version=version+1 WHERE id=cid;
      action_code='SAVE_DRAFT';
    END IF;

    INSERT INTO public.claim_events(claim_id,actor_id,event_type,from_status,to_status,payload)
    VALUES(cid,uid,action_code,previous_status,CASE WHEN action='submit_claim' THEN 'PENDING_FINANCE_REVIEW' ELSE 'DRAFT' END,payload);

    RETURN jsonb_build_object('id',cid);
  END IF;

  IF action IN ('approve_step','reject_claim','return_for_clarification') THEN
    SELECT * INTO s FROM public.claim_workflow_steps WHERE id=(payload->>'step_id')::uuid FOR UPDATE;
    IF s.id IS NULL OR s.status<>'IN_PROGRESS' THEN RAISE EXCEPTION 'Step not active' USING ERRCODE='42501'; END IF;
    SELECT * INTO c FROM public.claims WHERE id=s.claim_id FOR UPDATE;
    IF c.id IS NULL THEN RAISE EXCEPTION 'Claim missing'; END IF;
    submitter = COALESCE(c.submitted_by_user_id, c.claimant_id);

    -- Self-approval: only pure non-finance claimants are blocked from self-approval
    IF submitter = uid AND NOT (admin OR finance) THEN
      RAISE EXCEPTION 'You cannot approve your own claim' USING ERRCODE='42501';
    END IF;

    IF s.assigned_user_id IS NOT NULL THEN
      IF s.assigned_user_id<>uid AND NOT admin THEN RAISE EXCEPTION 'Not step owner' USING ERRCODE='42501'; END IF;
    ELSE
      IF NOT (admin OR private.has_role(s.approver_role)) THEN RAISE EXCEPTION 'Not step role' USING ERRCODE='42501'; END IF;
    END IF;

    previous_status=c.status;
    IF action='approve_step' THEN
      UPDATE public.claim_workflow_steps SET status='COMPLETED',completed_by=uid,completed_at=now() WHERE id=s.id;
      SELECT * INTO next_step FROM public.claim_workflow_steps
      WHERE workflow_id=s.workflow_id AND sequence>s.sequence AND status='PENDING'
      ORDER BY sequence LIMIT 1;
      IF next_step.id IS NOT NULL THEN
        UPDATE public.claim_workflow_steps SET status='IN_PROGRESS' WHERE id=next_step.id;
        UPDATE public.claims SET status=CASE WHEN next_step.approver_role='MINISTRY_LEADER' THEN 'PENDING_MINISTRY_APPROVAL' ELSE 'PENDING_FINAL_APPROVAL' END,
          current_step_sequence=next_step.sequence,version=version+1 WHERE id=c.id;
      ELSE
        v_bank_code := private.resolve_canonical_swift_code(COALESCE(c.bank_code, c.bank_name));
        IF v_bank_code IS NOT NULL THEN
          SELECT bank_name INTO v_bank_name FROM public.bank_directory WHERE swift_code = v_bank_code;
        ELSE
          v_bank_name := c.bank_name;
        END IF;
        c.bank_code := v_bank_code;
        c.bank_name := COALESCE(v_bank_name, c.bank_name);
        c.bank_account_holder_name := COALESCE(NULLIF(trim(c.bank_account_holder_name),''), c.claimant_name);
        c.approved_snapshot := jsonb_build_object(
          'approved_amount_cents', round(c.total_amount * 100)::bigint,
          'approved_amount', c.total_amount,
          'currency', COALESCE(c.currency, 'MYR'),
          'beneficiary_user_id', submitter,
          'bank_account_holder_name', c.bank_account_holder_name,
          'bank_name', c.bank_name,
          'bank_code', c.bank_code,
          'bank_account_number', c.bank_account_number,
          'beneficiary_new_ic', c.beneficiary_new_ic,
          'beneficiary_old_ic', c.beneficiary_old_ic,
          'beneficiary_business_reg', c.beneficiary_business_reg,
          'beneficiary_others', c.beneficiary_others,
          'beneficiary_address', c.beneficiary_address,
          'approved_at', now(),
          'approved_by', uid
        );
        UPDATE public.claims SET
          status='APPROVED_FOR_PAYMENT',
          approved_at=now(),
          approved_by=uid,
          current_step_sequence=NULL,
          bank_code=c.bank_code,
          bank_name=c.bank_name,
          bank_account_holder_name=c.bank_account_holder_name,
          approved_snapshot=c.approved_snapshot,
          version=version+1
        WHERE id=c.id;
      END IF;
      action_code='APPROVE';
    ELSIF action='reject_claim' THEN
      UPDATE public.claim_workflow_steps SET status='REJECTED',completed_by=uid,completed_at=now() WHERE id=s.id;
      UPDATE public.claims SET status='REJECTED',rejection_reason=payload->>'comment',version=version+1 WHERE id=c.id;
      action_code='REJECT';
    ELSE
      UPDATE public.claim_workflow_steps SET status='RETURNED',completed_by=uid,completed_at=now() WHERE id=s.id;
      UPDATE public.claims SET status='RETURNED_FOR_CLARIFICATION',returned_at=now(),returned_by=uid,version=version+1 WHERE id=c.id;
      action_code='RETURN_FOR_CLARIFICATION';
    END IF;

    INSERT INTO public.approval_actions(claim_id,workflow_step_id,actor_id,actor_role,action,comment,previous_status,new_status)
    VALUES(c.id,s.id,uid,s.approver_role,action_code,payload->>'comment',previous_status,(SELECT status FROM public.claims WHERE id=c.id));

    INSERT INTO public.claim_events(claim_id,actor_id,event_type,from_status,to_status,payload)
    VALUES(c.id,uid,action_code,previous_status,(SELECT status FROM public.claims WHERE id=c.id),payload);

    RETURN jsonb_build_object('claim_id',c.id);
  END IF;

  IF action = 'finalize_reimbursement_batch' THEN
    IF NOT (admin OR finance) THEN
      RAISE EXCEPTION 'Finance Officer or System Admin access required' USING ERRCODE = '42501';
    END IF;

    IF payload->>'request_key' IS NOT NULL THEN
      SELECT id INTO v_batch_id FROM public.reimbursement_batches WHERE request_key = (payload->>'request_key')::uuid;
      IF v_batch_id IS NOT NULL THEN
        RETURN jsonb_build_object('batch_id', v_batch_id);
      END IF;
      PERFORM pg_advisory_xact_lock(hashtextextended(uid::text || (payload->>'request_key'), 0));
      SELECT id INTO v_batch_id FROM public.reimbursement_batches WHERE request_key = (payload->>'request_key')::uuid;
      IF v_batch_id IS NOT NULL THEN
        RETURN jsonb_build_object('batch_id', v_batch_id);
      END IF;
    END IF;

    IF jsonb_typeof(payload->'claim_ids') IS DISTINCT FROM 'array' OR jsonb_array_length(payload->'claim_ids') = 0 THEN
      RAISE EXCEPTION 'Provide at least one approved claim to finalize a reimbursement batch';
    END IF;

    SELECT array_agg(u.id) INTO v_claim_ids
    FROM (
      SELECT DISTINCT (elem->>0)::uuid AS id
      FROM jsonb_array_elements(payload->'claim_ids') elem
      ORDER BY id
    ) u;

    v_claim_count := cardinality(v_claim_ids);
    IF v_claim_count = 0 THEN
      RAISE EXCEPTION 'No valid claim identifiers provided';
    END IF;

    PERFORM 1 FROM public.claims WHERE id = ANY(v_claim_ids) ORDER BY id FOR UPDATE;

    IF (SELECT count(*) FROM public.claims WHERE id = ANY(v_claim_ids)) <> v_claim_count THEN
      RAISE EXCEPTION 'One or more claims could not be found';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.claims
      WHERE id = ANY(v_claim_ids) AND (status <> 'APPROVED_FOR_PAYMENT' OR active_batch_id IS NOT NULL)
    ) THEN
      RAISE EXCEPTION 'All claims must be in APPROVED_FOR_PAYMENT status and not assigned to an active reimbursement batch';
    END IF;

    FOR c IN SELECT * FROM public.claims WHERE id = ANY(v_claim_ids) LOOP
      v_bank_code := COALESCE(
        c.approved_snapshot->>'bank_code',
        c.bank_code,
        private.resolve_canonical_swift_code(COALESCE(c.approved_snapshot->>'bank_name', c.bank_name))
      );
      IF v_bank_code IS NULL OR NOT EXISTS (SELECT 1 FROM public.bank_directory WHERE swift_code = v_bank_code) THEN
        RAISE EXCEPTION 'Claim % has invalid bank details for Alliance Bank export', COALESCE(c.claim_number, c.id::text);
      END IF;

      v_raw_acct := private.decrypt_bank_account(COALESCE(c.approved_snapshot->>'bank_account_number', c.bank_account_number));
      v_acct := regexp_replace(trim(COALESCE(v_raw_acct, '')), '[\s\-]', '', 'g');
      IF v_acct !~ '^[A-Za-z0-9]{5,34}$' THEN
        RAISE EXCEPTION 'Claim % has an invalid bank account number for Alliance Bank export', COALESCE(c.claim_number, c.id::text);
      END IF;

      v_holder_name := trim(COALESCE(NULLIF(trim(c.approved_snapshot->>'bank_account_holder_name'),''), NULLIF(trim(c.bank_account_holder_name),''), c.claimant_name, ''));
      IF length(v_holder_name) = 0 THEN
        RAISE EXCEPTION 'Claim % is missing a beneficiary account holder name', COALESCE(c.claim_number, c.id::text);
      END IF;
    END LOOP;

    v_batch_num := 'HG-BATCH-' || to_char(current_date, 'YYYY') || '-' || lpad(nextval('public.reimbursement_batch_seq')::text, 4, '0');

    INSERT INTO public.reimbursement_batches (
      batch_number, template_version, payment_method, status,
      total_claims, total_transfers, total_amount_cents, total_amount,
      currency, instructions_digest_sha256, created_by, request_key
    ) VALUES (
      v_batch_num, 'ALLIANCE_SBP_BIFF8_V1', 'ALLIANCE_BULK_TRANSFER', 'PENDING_APPROVAL',
      v_claim_count, 0, 0, 0.00, 'MYR', repeat('0', 64), uid,
      NULLIF(payload->>'request_key', '')::uuid
    ) RETURNING id INTO v_batch_id;

    v_line_order := 0;
    v_total_cents := 0;

    FOR v_group IN
      SELECT
        COALESCE(cl.approved_snapshot->>'beneficiary_user_id', cl.submitted_by_user_id::text)::uuid AS beneficiary_user_id,
        max(trim(COALESCE(NULLIF(trim(cl.approved_snapshot->>'bank_account_holder_name'),''), NULLIF(trim(cl.bank_account_holder_name),''), cl.claimant_name))) AS beneficiary_name,
        regexp_replace(trim(private.decrypt_bank_account(COALESCE(cl.approved_snapshot->>'bank_account_number', cl.bank_account_number))), '[\s\-]', '', 'g') AS account_number,
        COALESCE(cl.approved_snapshot->>'bank_code', cl.bank_code, private.resolve_canonical_swift_code(COALESCE(cl.approved_snapshot->>'bank_name', cl.bank_name))) AS bank_code,
        COALESCE(cl.approved_snapshot->>'beneficiary_new_ic', cl.beneficiary_new_ic, '') AS new_ic,
        COALESCE(cl.approved_snapshot->>'beneficiary_old_ic', cl.beneficiary_old_ic, '') AS old_ic,
        COALESCE(cl.approved_snapshot->>'beneficiary_business_reg', cl.beneficiary_business_reg, '') AS biz_reg,
        COALESCE(cl.approved_snapshot->>'beneficiary_others', cl.beneficiary_others, '') AS others,
        COALESCE(cl.approved_snapshot->>'beneficiary_address', cl.beneficiary_address, '') AS address,
        sum(round(cl.total_amount * 100))::bigint AS group_cents,
        count(*)::integer AS group_claim_count,
        array_agg(cl.id ORDER BY cl.created_at, cl.id) AS grouped_claim_ids
      FROM public.claims cl
      WHERE cl.id = ANY(v_claim_ids)
      GROUP BY
        COALESCE(cl.approved_snapshot->>'beneficiary_user_id', cl.submitted_by_user_id::text)::uuid,
        upper(regexp_replace(trim(COALESCE(NULLIF(trim(cl.approved_snapshot->>'bank_account_holder_name'),''), NULLIF(trim(cl.bank_account_holder_name),''), cl.claimant_name)), '\s+', ' ', 'g')),
        regexp_replace(trim(private.decrypt_bank_account(COALESCE(cl.approved_snapshot->>'bank_account_number', cl.bank_account_number))), '[\s\-]', '', 'g'),
        COALESCE(cl.approved_snapshot->>'bank_code', cl.bank_code, private.resolve_canonical_swift_code(COALESCE(cl.approved_snapshot->>'bank_name', cl.bank_name))),
        COALESCE(cl.approved_snapshot->>'beneficiary_new_ic', cl.beneficiary_new_ic, ''),
        COALESCE(cl.approved_snapshot->>'beneficiary_old_ic', cl.beneficiary_old_ic, ''),
        COALESCE(cl.approved_snapshot->>'beneficiary_business_reg', cl.beneficiary_business_reg, ''),
        COALESCE(cl.approved_snapshot->>'beneficiary_others', cl.beneficiary_others, ''),
        COALESCE(cl.approved_snapshot->>'beneficiary_address', cl.beneficiary_address, '')
      ORDER BY min(cl.created_at), min(cl.id::text)
    LOOP
      v_line_order := v_line_order + 1;
      v_pay_desc := private.next_payment_description(EXTRACT(YEAR FROM CURRENT_DATE)::integer);
      SELECT bank_name INTO STRICT v_bank_name FROM public.bank_directory WHERE swift_code = v_group.bank_code;

      INSERT INTO public.reimbursement_batch_instructions (
        batch_id, line_order, payment_description, payment_reference,
        payment_mode, beneficiary_user_id, beneficiary_name, beneficiary_account_number,
        beneficiary_bank_name, beneficiary_bank_code,
        beneficiary_new_ic, beneficiary_old_ic, beneficiary_business_reg, beneficiary_others, beneficiary_address,
        amount_cents, amount, claim_count, status
      ) VALUES (
        v_batch_id, v_line_order, v_pay_desc, NULL,
        CASE WHEN v_group.bank_code = 'MFBBMYKL' THEN 'LIP' ELSE 'LGP' END,
        v_group.beneficiary_user_id, v_group.beneficiary_name, private.encrypt_bank_account(v_group.account_number),
        v_bank_name, v_group.bank_code,
        NULLIF(v_group.new_ic, ''), NULLIF(v_group.old_ic, ''), NULLIF(v_group.biz_reg, ''), NULLIF(v_group.others, ''), NULLIF(v_group.address, ''),
        v_group.group_cents, round(v_group.group_cents::numeric / 100, 2), v_group.group_claim_count, 'RESERVED'
      ) RETURNING id INTO v_inst_id;

      INSERT INTO public.reimbursement_instruction_claims (
        batch_id, instruction_id, claim_id, allocated_amount_cents, allocated_amount, is_active
      )
      SELECT
        v_batch_id, v_inst_id, cl.id, round(cl.total_amount * 100)::bigint, cl.total_amount, TRUE
      FROM public.claims cl
      WHERE cl.id = ANY(v_group.grouped_claim_ids);

      UPDATE public.claims
      SET
        active_batch_id = v_batch_id,
        active_instruction_id = v_inst_id,
        reimbursement_status = 'BATCHED',
        version = version + 1
      WHERE id = ANY(v_group.grouped_claim_ids);

      v_total_cents := v_total_cents + v_group.group_cents;
    END LOOP;

    v_transfer_count := v_line_order;
    v_digest := private.compute_batch_digest(v_batch_id);

    UPDATE public.reimbursement_batches
    SET
      total_transfers = v_transfer_count,
      total_amount_cents = v_total_cents,
      total_amount = round(v_total_cents::numeric / 100, 2),
      instructions_digest_sha256 = v_digest,
      status = 'APPROVED_FOR_EXPORT',
      updated_at = now()
    WHERE id = v_batch_id;

    UPDATE public.reimbursement_batch_instructions
    SET status = 'QUEUED', updated_at = now()
    WHERE batch_id = v_batch_id;

    IF (SELECT count(*) FROM public.claims WHERE active_batch_id = v_batch_id) <> v_claim_count THEN
      RAISE EXCEPTION 'Inconsistent claim count linked to reimbursement batch';
    END IF;

    IF (SELECT COALESCE(SUM(amount_cents), 0) FROM public.reimbursement_batch_instructions WHERE batch_id = v_batch_id) <> v_total_cents THEN
      RAISE EXCEPTION 'Batch instruction sum does not match header total';
    END IF;

    INSERT INTO public.audit_logs (
      user_id, action, entity_type, entity_id, after_data
    ) VALUES (
      uid, 'FINALIZE_REIMBURSEMENT_BATCH',
      'reimbursement_batches',
      v_batch_id,
      jsonb_build_object(
        'batch_number', v_batch_num,
        'claim_count', v_claim_count,
        'transfer_count', v_transfer_count,
        'total_amount_cents', v_total_cents,
        'digest_sha256', v_digest
      )
    );

    RETURN jsonb_build_object('batch_id', v_batch_id, 'batch_number', v_batch_num, 'transfer_count', v_transfer_count);
  END IF;

  IF action = 'set_ministry_budget' THEN
    IF NOT (admin OR finance) THEN
      RAISE EXCEPTION 'Finance Officer or System Admin access is required to set ministry budget' USING ERRCODE = '42501';
    END IF;
    IF payload->>'ministry_id' IS NULL OR payload->>'year' IS NULL OR payload->>'amount' IS NULL THEN
      RAISE EXCEPTION 'Ministry ID, year, and amount are required';
    END IF;

    INSERT INTO public.ministry_budgets (
      ministry_id, year, amount, notes, created_by, updated_at
    ) VALUES (
      (payload->>'ministry_id')::uuid,
      (payload->>'year')::integer,
      (payload->>'amount')::numeric,
      NULLIF(trim(COALESCE(payload->>'notes', '')), ''),
      uid,
      now()
    )
    ON CONFLICT (ministry_id, year) DO UPDATE SET
      amount = EXCLUDED.amount,
      notes = EXCLUDED.notes,
      updated_at = now()
    RETURNING id INTO row_id;

    RETURN jsonb_build_object('success', true, 'id', row_id);
  END IF;

  IF action = 'set_ministry_team_leads' THEN
    IF NOT (admin OR finance) THEN
      RAISE EXCEPTION 'Finance Officer or System Admin access is required to assign ministry team leads' USING ERRCODE = '42501';
    END IF;
    IF payload->>'ministry_id' IS NULL THEN
      RAISE EXCEPTION 'Ministry ID is required';
    END IF;

    row_id := (payload->>'ministry_id')::uuid;

    DELETE FROM public.ministry_team_leads WHERE ministry_id = row_id;

    IF jsonb_typeof(payload->'user_ids') = 'array' THEN
      INSERT INTO public.ministry_team_leads (ministry_id, user_id)
      SELECT row_id, u::uuid
      FROM jsonb_array_elements_text(payload->'user_ids') AS u
      WHERE NULLIF(trim(u), '') IS NOT NULL
      ON CONFLICT DO NOTHING;

      INSERT INTO public.user_roles (user_id, role_id)
      SELECT u::uuid, (SELECT id FROM public.roles WHERE code = 'TEAM_LEAD')
      FROM jsonb_array_elements_text(payload->'user_ids') AS u
      WHERE NULLIF(trim(u), '') IS NOT NULL
        AND EXISTS (SELECT 1 FROM public.roles WHERE code = 'TEAM_LEAD')
      ON CONFLICT DO NOTHING;
    END IF;

    RETURN jsonb_build_object('success', true, 'ministry_id', row_id);
  END IF;

  IF action = 'complete_onboarding' THEN
    v_acct := NULLIF(regexp_replace(trim(COALESCE(payload->>'bank_account_number','')), '[\s\-]', '', 'g'), '');
    v_bank_code := private.resolve_canonical_swift_code(COALESCE(NULLIF(trim(payload->>'bank_code'),''), payload->>'bank_name'));
    IF v_bank_code IS NOT NULL THEN
      SELECT bank_name INTO v_bank_name FROM public.bank_directory WHERE swift_code = v_bank_code;
    ELSE
      v_bank_name := NULLIF(trim(COALESCE(payload->>'bank_name','')),'');
    END IF;

    UPDATE public.profiles SET
      full_name = trim(COALESCE(payload->>'full_name', full_name)),
      phone = COALESCE(NULLIF(trim(COALESCE(payload->>'phone','')),''), phone),
      bank_name = COALESCE(v_bank_name, bank_name),
      bank_code = COALESCE(v_bank_code, bank_code),
      bank_account_holder_name = COALESCE(NULLIF(trim(COALESCE(payload->>'bank_account_holder_name','')),''), bank_account_holder_name),
      bank_account_number = COALESCE(private.encrypt_bank_account(v_acct), bank_account_number),
      beneficiary_new_ic = COALESCE(NULLIF(trim(COALESCE(payload->>'beneficiary_new_ic','')),''), beneficiary_new_ic),
      beneficiary_address = COALESCE(NULLIF(trim(COALESCE(payload->>'beneficiary_address','')),''), beneficiary_address),
      onboarding_completed_at = now(),
      bank_updated_at = CASE WHEN v_bank_code IS NOT NULL OR v_acct IS NOT NULL THEN now() ELSE bank_updated_at END,
      updated_at = now()
    WHERE id = uid;

    RETURN jsonb_build_object('user_id', uid);
  END IF;

  IF action = 'create_payee_profile' THEN
    IF length(trim(COALESCE(payload->>'full_name', ''))) = 0 OR length(trim(payload->>'full_name')) > 150 THEN
      RAISE EXCEPTION 'Claimant full name is required (maximum 150 characters)';
    END IF;
    v_bank_code := private.resolve_canonical_swift_code(COALESCE(NULLIF(trim(payload->>'bank_code'), ''), payload->>'bank_name'));
    IF v_bank_code IS NULL THEN
      RAISE EXCEPTION 'Select a valid bank from the 31-bank Alliance Bank directory';
    END IF;
    SELECT bank_name INTO STRICT v_bank_name FROM public.bank_directory WHERE swift_code = v_bank_code;
    v_acct := NULLIF(regexp_replace(trim(COALESCE(payload->>'bank_account_number', '')), '[\s\-]', '', 'g'), '');
    IF v_acct IS NULL OR v_acct !~ '^[A-Za-z0-9]{5,34}$' THEN
      RAISE EXCEPTION 'Enter a valid bank account / DuitNow ID number (5 to 34 alphanumeric characters)';
    END IF;
    v_holder_name := COALESCE(NULLIF(trim(COALESCE(payload->>'bank_account_holder_name', '')), ''), trim(payload->>'full_name'));

    IF NULLIF(trim(COALESCE(payload->>'id', '')), '') IS NOT NULL THEN
      row_id := (payload->>'id')::uuid;
      UPDATE public.profiles SET
        full_name = trim(payload->>'full_name'),
        email = COALESCE(NULLIF(trim(COALESCE(payload->>'email', '')), ''), email),
        phone = COALESCE(NULLIF(trim(COALESCE(payload->>'phone', '')), ''), phone),
        ministry_id = COALESCE(NULLIF(trim(COALESCE(payload->>'ministry_id', '')), '')::uuid, ministry_id),
        bank_name = v_bank_name,
        bank_code = v_bank_code,
        bank_account_holder_name = v_holder_name,
        bank_account_number = private.encrypt_bank_account(v_acct),
        beneficiary_new_ic = COALESCE(NULLIF(trim(COALESCE(payload->>'beneficiary_new_ic', '')), ''), beneficiary_new_ic),
        beneficiary_address = COALESCE(NULLIF(trim(COALESCE(payload->>'beneficiary_address', '')), ''), beneficiary_address),
        bank_updated_at = now(),
        updated_at = now()
      WHERE id = row_id AND (id = uid OR COALESCE(is_payee_only, FALSE) = TRUE OR created_by_user_id = uid OR admin OR finance);
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Unable to update this bank profile' USING ERRCODE = '42501';
      END IF;
    ELSE
      INSERT INTO public.profiles (
        email, full_name, phone, ministry_id, default_ministry_id,
        status, is_multi_user, is_payee_only, created_by_user_id,
        bank_name, bank_code, bank_account_holder_name, bank_account_number,
        beneficiary_new_ic, beneficiary_address, bank_updated_at, onboarding_completed_at
      ) VALUES (
        COALESCE(NULLIF(trim(COALESCE(payload->>'email', '')), ''), 'payee-' || substring(gen_random_uuid()::text, 1, 8) || '@harvestgen.org'),
        trim(payload->>'full_name'),
        NULLIF(trim(COALESCE(payload->>'phone', '')), ''),
        NULLIF(trim(COALESCE(payload->>'ministry_id', '')), '')::uuid,
        NULLIF(trim(COALESCE(payload->>'ministry_id', '')), '')::uuid,
        'ACTIVE', FALSE, TRUE, uid,
        v_bank_name, v_bank_code, v_holder_name, private.encrypt_bank_account(v_acct),
        NULLIF(trim(COALESCE(payload->>'beneficiary_new_ic', '')), ''),
        NULLIF(trim(COALESCE(payload->>'beneficiary_address', '')), ''),
        now(), now()
      ) RETURNING id INTO row_id;
    END IF;

    RETURN jsonb_build_object('id', row_id);
  END IF;

  IF action = 'profile' THEN
    entity := payload->'data';
    row_id := (payload->>'id')::uuid;
    IF row_id <> uid AND NOT admin THEN RAISE EXCEPTION 'Cannot edit other profile' USING ERRCODE='42501'; END IF;

    v_bank_code := private.resolve_canonical_swift_code(COALESCE(NULLIF(trim(entity->>'bank_code'),''), entity->>'bank_name'));
    IF v_bank_code IS NOT NULL THEN
      SELECT bank_name INTO v_bank_name FROM public.bank_directory WHERE swift_code = v_bank_code;
    ELSE
      v_bank_name := NULLIF(trim(COALESCE(entity->>'bank_name','')),'');
    END IF;

    UPDATE public.profiles SET
      full_name=CASE WHEN entity ? 'full_name' THEN trim(entity->>'full_name') ELSE full_name END,
      phone=CASE WHEN entity ? 'phone' THEN NULLIF(trim(entity->>'phone'),'') ELSE phone END,
      ministry_id=CASE WHEN entity ? 'ministry_id' THEN NULLIF(entity->>'ministry_id','')::uuid ELSE ministry_id END,
      default_ministry_id=CASE WHEN entity ? 'default_ministry_id' THEN NULLIF(entity->>'default_ministry_id','')::uuid ELSE default_ministry_id END,
      status=CASE WHEN admin AND entity ? 'status' THEN (entity->>'status')::public.user_status ELSE status END,
      bank_name=CASE WHEN entity ? 'bank_name' OR entity ? 'bank_code' THEN v_bank_name ELSE bank_name END,
      bank_code=CASE WHEN entity ? 'bank_code' OR entity ? 'bank_name' THEN v_bank_code ELSE bank_code END,
      bank_account_holder_name=CASE WHEN entity ? 'bank_account_holder_name' THEN NULLIF(trim(entity->>'bank_account_holder_name'),'') ELSE bank_account_holder_name END,
      bank_account_number=CASE WHEN entity ? 'bank_account_number' THEN private.encrypt_bank_account(NULLIF(regexp_replace(trim(entity->>'bank_account_number'), '[\s\-]', '', 'g'),'')) ELSE bank_account_number END,
      beneficiary_new_ic=CASE WHEN entity ? 'beneficiary_new_ic' THEN NULLIF(trim(entity->>'beneficiary_new_ic'),'') ELSE beneficiary_new_ic END,
      beneficiary_old_ic=CASE WHEN entity ? 'beneficiary_old_ic' THEN NULLIF(trim(entity->>'beneficiary_old_ic'),'') ELSE beneficiary_old_ic END,
      beneficiary_business_reg=CASE WHEN entity ? 'beneficiary_business_reg' THEN NULLIF(trim(entity->>'beneficiary_business_reg'),'') ELSE beneficiary_business_reg END,
      beneficiary_others=CASE WHEN entity ? 'beneficiary_others' THEN NULLIF(trim(entity->>'beneficiary_others'),'') ELSE beneficiary_others END,
      beneficiary_address=CASE WHEN entity ? 'beneficiary_address' THEN NULLIF(trim(entity->>'beneficiary_address'),'') ELSE beneficiary_address END,
      bank_updated_at=CASE WHEN entity ? 'bank_name' OR entity ? 'bank_code' OR entity ? 'bank_account_number' THEN now() ELSE bank_updated_at END,
      updated_at=now()
    WHERE id=row_id;

    RETURN jsonb_build_object('id', row_id);
  END IF;

  -- Delegate any other commands to existing implementation pattern
  IF action = 'comment' THEN
    IF NOT private.can_read_claim((payload->>'claim_id')::uuid) THEN RAISE EXCEPTION 'Claim not accessible' USING ERRCODE='42501'; END IF;
    INSERT INTO public.claim_comments(claim_id,author_id,author_role,content,visibility)
    VALUES((payload->>'claim_id')::uuid,uid,COALESCE(payload->>'author_role','CLAIMANT'),payload->>'content',
      COALESCE((payload->>'visibility')::public.comment_visibility,'PUBLIC_WORKFLOW'));
    RETURN jsonb_build_object('claim_id',payload->>'claim_id');
  END IF;

  IF action = 'finance_review' THEN
    IF NOT (admin OR finance) THEN RAISE EXCEPTION 'Finance Officer access required' USING ERRCODE='42501'; END IF;
    INSERT INTO public.finance_reviews(claim_id,reviewer_id,receipts_verified,category_verified,cost_centre_verified,status,notes)
    VALUES((payload->>'claim_id')::uuid,uid,COALESCE((payload->>'receipts_verified')::boolean,false),
      COALESCE((payload->>'category_verified')::boolean,false),COALESCE((payload->>'cost_centre_verified')::boolean,false),
      COALESCE(payload->>'status','APPROVED'),payload->>'notes');
    RETURN jsonb_build_object('claim_id',payload->>'claim_id');
  END IF;

  IF action = 'payment' THEN
    IF NOT (admin OR finance) THEN RAISE EXCEPTION 'Finance Officer access required' USING ERRCODE='42501'; END IF;
    SELECT * INTO c FROM public.claims WHERE id=(payload->>'claim_id')::uuid FOR UPDATE;
    IF c.id IS NULL OR c.status<>'APPROVED_FOR_PAYMENT' THEN RAISE EXCEPTION 'Claim not approved for payment'; END IF;
    INSERT INTO public.payments(claim_id,processed_by,amount,payment_date,payment_reference,payment_method,notes)
    VALUES(c.id,uid,(payload->>'amount')::numeric,(payload->>'payment_date')::date,payload->>'payment_reference',
      (payload->>'payment_method')::public.payment_method,payload->>'notes');
    UPDATE public.claims SET status='PAID',paid_at=now(),version=version+1 WHERE id=c.id;
    INSERT INTO public.claim_events(claim_id,actor_id,event_type,from_status,to_status,payload)
    VALUES(c.id,uid,'PAY','APPROVED_FOR_PAYMENT','PAID',payload);
    RETURN jsonb_build_object('claim_id',c.id);
  END IF;

  IF action = 'delete_claim' THEN
    SELECT * INTO c FROM public.claims WHERE id=(payload->>'id')::uuid FOR UPDATE;
    IF c.id IS NULL THEN RAISE EXCEPTION 'Claim not found'; END IF;
    IF NOT (admin OR ((c.submitted_by_user_id=uid OR c.claimant_id=uid) AND c.status IN ('DRAFT','CANCELLED'))) THEN
      RAISE EXCEPTION 'You cannot delete this claim' USING ERRCODE='42501';
    END IF;
    DELETE FROM public.claims WHERE id=c.id;
    RETURN jsonb_build_object('id',c.id);
  END IF;

  RAISE EXCEPTION 'Unsupported action: %', action;
END $$;

-- 10. Update private.paginate_claims to include disbursement voucher, batch number, and row order
CREATE OR REPLACE FUNCTION private.paginate_claims(p_params jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_uid uuid;
  v_admin boolean;
  v_finance boolean;
  v_search text;
  v_status text;
  v_ministry_id uuid;
  v_start_date date;
  v_end_date date;
  v_voucher text;
  v_sort_field text;
  v_sort_dir text;
  v_page integer;
  v_page_size integer;
  v_offset integer;
  v_total_count integer;
  v_items jsonb;
  v_redacted jsonb;
  v_summary jsonb;
BEGIN
  IF NOT private.active_user() THEN
    RAISE EXCEPTION 'Active account required' USING ERRCODE = '42501';
  END IF;

  v_uid := auth.uid();
  v_admin := private.has_role('SYSTEM_ADMIN');
  v_finance := private.has_role('FINANCE_OFFICER');

  v_search := lower(trim(COALESCE(p_params->>'search', '')));
  v_voucher := lower(trim(COALESCE(p_params->>'disbursement_voucher', '')));
  v_status := NULLIF(trim(COALESCE(p_params->>'status', '')), '');
  IF v_status = 'ALL' THEN
    v_status := NULL;
  END IF;

  IF NULLIF(trim(COALESCE(p_params->>'ministry_id', '')), '') IS NOT NULL
     AND trim(p_params->>'ministry_id') <> 'ALL' THEN
    v_ministry_id := (p_params->>'ministry_id')::uuid;
  END IF;

  IF NULLIF(trim(COALESCE(p_params->>'start_date', '')), '') IS NOT NULL THEN
    v_start_date := (p_params->>'start_date')::date;
  END IF;

  IF NULLIF(trim(COALESCE(p_params->>'end_date', '')), '') IS NOT NULL THEN
    v_end_date := (p_params->>'end_date')::date;
  END IF;

  v_sort_field := COALESCE(NULLIF(trim(COALESCE(p_params->>'sort_field', '')), ''), 'created_at');
  v_sort_dir := CASE WHEN lower(COALESCE(p_params->>'sort_dir', 'desc')) = 'asc' THEN 'asc' ELSE 'desc' END;
  v_page := GREATEST(1, COALESCE((p_params->>'page')::integer, 1));
  v_page_size := LEAST(100, GREATEST(1, COALESCE((p_params->>'page_size')::integer, 25)));
  v_offset := (v_page - 1) * v_page_size;

  WITH readable_claims AS (
    SELECT c.*, m.name AS ministry_name
    FROM public.claims c
    LEFT JOIN public.ministries m ON m.id = c.ministry_id
    WHERE private.can_read_claim(c.id)
  ),
  summary_agg AS (
    SELECT jsonb_build_object(
      'total_claims', COUNT(*),
      'total_amount', COALESCE(SUM(total_amount), 0),
      'pending_count', COUNT(*) FILTER (WHERE status IN ('SUBMITTED', 'PENDING_MINISTRY_APPROVAL', 'PENDING_FINANCE_REVIEW', 'PENDING_FINAL_APPROVAL')),
      'pending_amount', COALESCE(SUM(total_amount) FILTER (WHERE status IN ('SUBMITTED', 'PENDING_MINISTRY_APPROVAL', 'PENDING_FINANCE_REVIEW', 'PENDING_FINAL_APPROVAL')), 0),
      'approved_count', COUNT(*) FILTER (WHERE status IN ('APPROVED', 'APPROVED_FOR_PAYMENT')),
      'approved_amount', COALESCE(SUM(total_amount) FILTER (WHERE status IN ('APPROVED', 'APPROVED_FOR_PAYMENT')), 0),
      'paid_count', COUNT(*) FILTER (WHERE status = 'PAID'),
      'paid_amount', COALESCE(SUM(total_amount) FILTER (WHERE status = 'PAID'), 0),
      'returned_count', COUNT(*) FILTER (WHERE status = 'RETURNED_FOR_CLARIFICATION'),
      'rejected_count', COUNT(*) FILTER (WHERE status = 'REJECTED'),
      'draft_count', COUNT(*) FILTER (WHERE status = 'DRAFT')
    ) AS stats
    FROM readable_claims
  ),
  filtered AS (
    SELECT rc.*
    FROM readable_claims rc
    WHERE (v_ministry_id IS NULL OR rc.ministry_id = v_ministry_id)
      AND (
        v_status IS NULL
        OR (v_status = 'PENDING' AND rc.status IN ('SUBMITTED', 'PENDING_MINISTRY_APPROVAL', 'PENDING_FINANCE_REVIEW', 'PENDING_FINAL_APPROVAL'))
        OR rc.status = v_status
      )
      AND (v_start_date IS NULL OR rc.claim_date >= v_start_date)
      AND (v_end_date IS NULL OR rc.claim_date <= v_end_date)
      AND (
        v_voucher = ''
        OR rc.active_instruction_id IN (
          SELECT id FROM public.reimbursement_batch_instructions WHERE lower(payment_description) LIKE '%' || v_voucher || '%'
        )
      )
      AND (
        v_search = ''
        OR lower(COALESCE(rc.claim_number, '')) LIKE '%' || v_search || '%'
        OR lower(COALESCE(rc.purpose, '')) LIKE '%' || v_search || '%'
        OR lower(COALESCE(rc.claimant_name, '')) LIKE '%' || v_search || '%'
        OR lower(COALESCE(rc.claimant_email, '')) LIKE '%' || v_search || '%'
        OR lower(COALESCE(rc.ministry_name, '')) LIKE '%' || v_search || '%'
        OR rc.active_instruction_id IN (
          SELECT id FROM public.reimbursement_batch_instructions WHERE lower(payment_description) LIKE '%' || v_search || '%'
        )
        OR rc.active_batch_id IN (
          SELECT id FROM public.reimbursement_batches WHERE lower(batch_number) LIKE '%' || v_search || '%'
        )
      )
  ),
  counted AS (
    SELECT COUNT(*)::integer AS cnt FROM filtered
  ),
  paged AS (
    SELECT f.*
    FROM filtered f
    ORDER BY
      CASE WHEN v_sort_field = 'claim_date' AND v_sort_dir = 'asc' THEN f.claim_date END ASC,
      CASE WHEN v_sort_field = 'claim_date' AND v_sort_dir = 'desc' THEN f.claim_date END DESC,
      CASE WHEN v_sort_field = 'submitted_at' AND v_sort_dir = 'asc' THEN COALESCE(f.submitted_at, f.created_at) END ASC,
      CASE WHEN v_sort_field = 'submitted_at' AND v_sort_dir = 'desc' THEN COALESCE(f.submitted_at, f.created_at) END DESC,
      CASE WHEN v_sort_field = 'total_amount' AND v_sort_dir = 'asc' THEN f.total_amount END ASC,
      CASE WHEN v_sort_field = 'total_amount' AND v_sort_dir = 'desc' THEN f.total_amount END DESC,
      CASE WHEN v_sort_field = 'status' AND v_sort_dir = 'asc' THEN f.status END ASC,
      CASE WHEN v_sort_field = 'status' AND v_sort_dir = 'desc' THEN f.status END DESC,
      CASE WHEN v_sort_field = 'claim_number' AND v_sort_dir = 'asc' THEN COALESCE(f.claim_number, '') END ASC,
      CASE WHEN v_sort_field = 'claim_number' AND v_sort_dir = 'desc' THEN COALESCE(f.claim_number, '') END DESC,
      CASE WHEN v_sort_dir = 'asc' THEN f.created_at END ASC,
      f.created_at DESC,
      f.id DESC
    LIMIT v_page_size
    OFFSET v_offset
  )
  SELECT
    (SELECT cnt FROM counted),
    (SELECT stats FROM summary_agg),
    COALESCE((
      SELECT jsonb_agg(
        (to_jsonb(p) - 'ministry_name') || jsonb_build_object(
          'disbursement_voucher', (
            SELECT rbi.payment_description
            FROM public.reimbursement_batch_instructions rbi
            WHERE rbi.id = p.active_instruction_id
          ),
          'batch_number', (
            SELECT rb.batch_number
            FROM public.reimbursement_batches rb
            WHERE rb.id = p.active_batch_id
          ),
          'disbursement_line_order', (
            SELECT rbi.line_order
            FROM public.reimbursement_batch_instructions rbi
            WHERE rbi.id = p.active_instruction_id
          ),
          'expense_count', (SELECT COUNT(*)::integer FROM public.claim_expenses e WHERE e.claim_id = p.id),
          'attachment_count', (SELECT COUNT(*)::integer FROM public.claim_attachments a WHERE a.claim_id = p.id),
          'workflow_steps', COALESCE((
            SELECT jsonb_agg(to_jsonb(s) ORDER BY s.sequence)
            FROM public.claim_workflow_steps s
            JOIN public.claim_workflows w ON w.id = s.workflow_id AND w.is_current
            WHERE s.claim_id = p.id
          ), '[]'::jsonb),
          'finance_review', (
            SELECT to_jsonb(fr)
            FROM public.finance_reviews fr
            WHERE fr.claim_id = p.id
              AND fr.created_at >= COALESCE(p.resubmitted_at, p.submitted_at, p.created_at)
            ORDER BY fr.created_at DESC
            LIMIT 1
          ),
          'payment', (
            SELECT to_jsonb(py)
            FROM public.payments py
            WHERE py.claim_id = p.id
          )
        )
      )
      FROM paged p
    ), '[]'::jsonb)
  INTO v_total_count, v_summary, v_items;

  v_redacted := private.redact_workspace_snapshot(
    jsonb_build_object('claims', v_items)
  );

  RETURN jsonb_build_object(
    'items', v_redacted->'claims',
    'total_count', COALESCE(v_total_count, 0),
    'page', v_page,
    'page_size', v_page_size,
    'summary', COALESCE(v_summary, '{}'::jsonb)
  );
END $$;

-- 11. Update private.domain_snapshot to attach team leads & budgets to ministries,
--     and disbursement voucher data to claims
CREATE OR REPLACE FUNCTION private.domain_snapshot(p_domain text DEFAULT 'all') RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  uid uuid;
  admin boolean;
  finance boolean;
  claims_json jsonb;
  batches_json jsonb;
BEGIN
  IF NOT private.active_user() THEN
    RAISE EXCEPTION 'Active account required' USING ERRCODE = '42501';
  END IF;

  IF p_domain IS NULL OR p_domain = 'all' THEN
    RETURN private.snapshot();
  END IF;

  uid := auth.uid();
  admin := private.has_role('SYSTEM_ADMIN');
  finance := private.has_role('FINANCE_OFFICER');

  IF p_domain = 'bootstrap' THEN
    RETURN jsonb_build_object(
      'user_id', uid,
      'profiles', COALESCE((
        SELECT jsonb_agg(
          (CASE WHEN p.id = uid OR admin OR finance OR COALESCE(p.is_payee_only, false) = true OR p.created_by_user_id = uid
            THEN to_jsonb(p)
            ELSE to_jsonb(p) - 'bank_name' - 'bank_code' - 'bank_account_holder_name' - 'bank_account_number' - 'beneficiary_new_ic' - 'beneficiary_old_ic' - 'beneficiary_business_reg' - 'beneficiary_others' - 'beneficiary_address' - 'phone' - 'email'
          END) ||
          jsonb_build_object(
            'roles',
            COALESCE((
              SELECT jsonb_agg(r.code)
              FROM public.user_roles ur
              JOIN public.roles r ON r.id = ur.role_id
              WHERE ur.user_id = p.id
            ), '[]'::jsonb)
          )
        )
        FROM public.profiles p
      ), '[]'::jsonb),
      'ministries', COALESCE((
        SELECT jsonb_agg(
          to_jsonb(m) || jsonb_build_object(
            'team_lead_ids', COALESCE((
              SELECT jsonb_agg(mtl.user_id)
              FROM public.ministry_team_leads mtl
              WHERE mtl.ministry_id = m.id
            ), '[]'::jsonb),
            'budgets', COALESCE((
              SELECT jsonb_agg(
                jsonb_build_object(
                  'id', mb.id,
                  'ministry_id', mb.ministry_id,
                  'year', mb.year,
                  'amount', mb.amount,
                  'notes', mb.notes,
                  'created_at', mb.created_at,
                  'updated_at', mb.updated_at
                ) ORDER BY mb.year DESC
              )
              FROM public.ministry_budgets mb
              WHERE mb.ministry_id = m.id
            ), '[]'::jsonb)
          )
          ORDER BY m.name
        )
        FROM public.ministries m
      ), '[]'::jsonb),
      'categories', COALESCE((SELECT jsonb_agg(to_jsonb(e) ORDER BY display_order, name) FROM public.expense_categories e), '[]'::jsonb),
      'costCentres', COALESCE((SELECT jsonb_agg(to_jsonb(cc) ORDER BY code) FROM public.cost_centres cc), '[]'::jsonb),
      'approvalRules', COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY sequence) FROM public.approval_rules r WHERE admin), '[]'::jsonb),
      'systemSettings', COALESCE((SELECT jsonb_agg(to_jsonb(s)) FROM public.system_settings s), '[]'::jsonb),
      'notifications', COALESCE((
        SELECT jsonb_agg(to_jsonb(n))
        FROM (
          SELECT * FROM public.notifications
          WHERE user_id = uid
          ORDER BY created_at DESC
          LIMIT 100
        ) n
      ), '[]'::jsonb),
      'auditLogs', '[]'::jsonb,
      'signupInvitations', COALESCE((
        SELECT jsonb_agg(to_jsonb(i) - 'token_hash' ORDER BY created_at DESC)
        FROM public.signup_invitations i
        WHERE admin
      ), '[]'::jsonb),
      'reimbursementBatches', COALESCE((
        SELECT jsonb_agg(
          to_jsonb(b) || jsonb_build_object(
            'instructions', COALESCE((
              SELECT jsonb_agg(
                to_jsonb(inst) || jsonb_build_object(
                  'claims', COALESCE((
                    SELECT jsonb_agg(to_jsonb(ic))
                    FROM public.reimbursement_instruction_claims ic
                    WHERE ic.instruction_id = inst.id
                  ), '[]'::jsonb)
                ) ORDER BY inst.line_order
              )
              FROM public.reimbursement_batch_instructions inst
              WHERE inst.batch_id = b.id
            ), '[]'::jsonb)
          ) ORDER BY b.created_at DESC
        )
        FROM public.reimbursement_batches b
        WHERE admin OR finance
      ), '[]'::jsonb),
      'claims', COALESCE((
        SELECT jsonb_agg(
          to_jsonb(c) || jsonb_build_object(
            'disbursement_voucher', (
              SELECT rbi.payment_description
              FROM public.reimbursement_batch_instructions rbi
              WHERE rbi.id = c.active_instruction_id
            ),
            'batch_number', (
              SELECT rb.batch_number
              FROM public.reimbursement_batches rb
              WHERE rb.id = c.active_batch_id
            ),
            'disbursement_line_order', (
              SELECT rbi.line_order
              FROM public.reimbursement_batch_instructions rbi
              WHERE rbi.id = c.active_instruction_id
            ),
            'expenses', COALESCE((
              SELECT jsonb_agg(to_jsonb(e) ORDER BY sort_order)
              FROM public.claim_expenses e
              WHERE e.claim_id = c.id
            ), '[]'::jsonb),
            'attachments', COALESCE((
              SELECT jsonb_agg(to_jsonb(a))
              FROM public.claim_attachments a
              WHERE a.claim_id = c.id
            ), '[]'::jsonb),
            'workflow_steps', COALESCE((
              SELECT jsonb_agg(to_jsonb(s) ORDER BY s.sequence)
              FROM public.claim_workflow_steps s
              JOIN public.claim_workflows w ON w.id = s.workflow_id AND w.is_current
              WHERE s.claim_id = c.id
            ), '[]'::jsonb),
            'finance_review', (
              SELECT to_jsonb(f)
              FROM public.finance_reviews f
              WHERE f.claim_id = c.id
                AND f.created_at >= COALESCE(c.resubmitted_at, c.submitted_at, c.created_at)
              ORDER BY f.created_at DESC
              LIMIT 1
            ),
            'payment', (
              SELECT to_jsonb(p)
              FROM public.payments p
              WHERE p.claim_id = c.id
            )
          ) ORDER BY c.created_at DESC
        )
        FROM public.claims c
        WHERE private.can_read_claim(c.id)
      ), '[]'::jsonb)
    );
  END IF;

  IF p_domain = 'master-data' THEN
    RETURN jsonb_build_object(
      'ministries', COALESCE((
        SELECT jsonb_agg(
          to_jsonb(m) || jsonb_build_object(
            'team_lead_ids', COALESCE((
              SELECT jsonb_agg(mtl.user_id)
              FROM public.ministry_team_leads mtl
              WHERE mtl.ministry_id = m.id
            ), '[]'::jsonb),
            'budgets', COALESCE((
              SELECT jsonb_agg(
                jsonb_build_object(
                  'id', mb.id,
                  'ministry_id', mb.ministry_id,
                  'year', mb.year,
                  'amount', mb.amount,
                  'notes', mb.notes,
                  'created_at', mb.created_at,
                  'updated_at', mb.updated_at
                ) ORDER BY mb.year DESC
              )
              FROM public.ministry_budgets mb
              WHERE mb.ministry_id = m.id
            ), '[]'::jsonb)
          )
          ORDER BY m.name
        )
        FROM public.ministries m
      ), '[]'::jsonb),
      'categories', COALESCE((SELECT jsonb_agg(to_jsonb(e) ORDER BY display_order, name) FROM public.expense_categories e), '[]'::jsonb),
      'costCentres', COALESCE((SELECT jsonb_agg(to_jsonb(cc) ORDER BY code) FROM public.cost_centres cc), '[]'::jsonb),
      'systemSettings', COALESCE((SELECT jsonb_agg(to_jsonb(s)) FROM public.system_settings s), '[]'::jsonb)
    );
  END IF;

  IF p_domain = 'claims' THEN
    RETURN jsonb_build_object(
      'claims', COALESCE((
        SELECT jsonb_agg(
          to_jsonb(c) || jsonb_build_object(
            'disbursement_voucher', (
              SELECT rbi.payment_description
              FROM public.reimbursement_batch_instructions rbi
              WHERE rbi.id = c.active_instruction_id
            ),
            'batch_number', (
              SELECT rb.batch_number
              FROM public.reimbursement_batches rb
              WHERE rb.id = c.active_batch_id
            ),
            'disbursement_line_order', (
              SELECT rbi.line_order
              FROM public.reimbursement_batch_instructions rbi
              WHERE rbi.id = c.active_instruction_id
            ),
            'expenses', COALESCE((
              SELECT jsonb_agg(to_jsonb(e) ORDER BY sort_order)
              FROM public.claim_expenses e
              WHERE e.claim_id = c.id
            ), '[]'::jsonb),
            'attachments', COALESCE((
              SELECT jsonb_agg(to_jsonb(a))
              FROM public.claim_attachments a
              WHERE a.claim_id = c.id
            ), '[]'::jsonb),
            'workflow_steps', COALESCE((
              SELECT jsonb_agg(to_jsonb(s) ORDER BY s.sequence)
              FROM public.claim_workflow_steps s
              JOIN public.claim_workflows w ON w.id = s.workflow_id AND w.is_current
              WHERE s.claim_id = c.id
            ), '[]'::jsonb),
            'finance_review', (
              SELECT to_jsonb(f)
              FROM public.finance_reviews f
              WHERE f.claim_id = c.id
                AND f.created_at >= COALESCE(c.resubmitted_at, c.submitted_at, c.created_at)
              ORDER BY f.created_at DESC
              LIMIT 1
            ),
            'payment', (
              SELECT to_jsonb(p)
              FROM public.payments p
              WHERE p.claim_id = c.id
            )
          ) ORDER BY c.created_at DESC
        )
        FROM public.claims c
        WHERE private.can_read_claim(c.id)
      ), '[]'::jsonb)
    );
  END IF;

  RETURN private.snapshot();
END $$;

COMMIT;
